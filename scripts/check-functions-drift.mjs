#!/usr/bin/env node
// scripts/check-functions-drift.mjs
//
// Compara las funciones DESPLEGADAS contra el cuerpo que dice la ultima
// migracion que las define.
//
// ── POR QUE EXISTE ──
// El 29/ago se encontro que `signup_tenant()` en produccion no la producia
// ninguna migracion del repo: era mas nueva que la 0041 y leia el nombre del
// negocio de `business_name`, un campo que no escribe nadie (el cliente manda
// `biz_name`). El alta seguia funcionando y guardaba el nombre equivocado.
//
// Ningun guard del repo lo veia: `check-schema-freshness.mjs` compara NUMEROS
// de migracion, no contenido. Aplicar algo por MCP y no escribir el archivo
// —o escribirlo distinto— pasaba en verde por los tres checks.
//
// ── QUE COMPARA Y QUE NO ──
// Solo el CUERPO (`pg_proc.prosrc`). Postgres canonicaliza el encabezado de la
// funcion pero guarda el cuerpo literal, asi que el cuerpo es comparable y el
// encabezado no: compararlo entero daria falso positivo en cada migracion.
//
// Antes de comparar se normaliza: se sacan comentarios SQL y se colapsan
// espacios. Reindentar una migracion no es drift.
//
// ── USO ──
//   node scripts/check-functions-drift.mjs            # falla si hay drift
//   node scripts/check-functions-drift.mjs --verbose  # muestra el diff
//
// Necesita PLATFORM_SUPABASE_URL + PLATFORM_SUPABASE_SERVICE_ROLE_KEY (o las
// SUPABASE_* genericas, que son las del edificio), y que la base tenga
// public.function_snapshot() — platform/migrations/0061.
//
// SIN credenciales o SIN el RPC: saltea y devuelve 0. Es a proposito, mismo
// criterio que schema:sync — no se le puede pedir la service role a alguien
// para commitear. El que corre siempre es el de CI (morning-health).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MIGRACIONES = join(ROOT, 'platform', 'migrations');
const VERBOSE = process.argv.includes('--verbose');

// Este archivo se importa desde src/test/functionsDrift.test.js para probar el
// parser sin base. Por eso las funciones puras se exportan y el chequeo contra
// la base corre SOLO cuando se lo ejecuta directo (ver el final).
const ES_MAIN = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

// Las funciones que, si driftean, rompen plata o el alta. No es toda la base:
// una lista larga se vuelve ruido y se termina ignorando.
export const CRITICAS = [
  'signup_tenant',      // el alta entera
  'complete_order',     // cierra el pedido y asienta la venta
  'sumar_staff',        // reparte acceso a la consola
  'quitar_staff',
  'suspender_impagos',  // apaga negocios
  'tenant_puede_operar',
  'slug_available',     // decide que slug se puede tomar
];

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const mal = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);

/** Saca comentarios SQL y colapsa espacios: reindentar no es drift. */
export function normalizar(sql) {
  return String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * El cuerpo de `fn` segun la ULTIMA migracion que la define.
 * Devuelve null si ninguna la define (funcion creada fuera del repo).
 */
export function cuerpoSegunElRepo(fn, dir = MIGRACIONES) {
  if (!existsSync(dir)) return null;
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 0001..0061: orden lexicografico == cronologico

  let ultimo = null;
  for (const archivo of archivos) {
    const texto = readFileSync(join(dir, archivo), 'utf8');
    // `create or replace function public.fn(` — con o sin `public.`
    const re = new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${fn}\\s*\\(`,
      'gi',
    );
    let m;
    while ((m = re.exec(texto))) {
      // El cuerpo va entre delimitadores dollar-quoted: $$ o $function$ o $x$.
      const desde = texto.slice(m.index);
      const abre = desde.match(/\$([a-z_]*)\$/i);
      if (!abre) continue;
      const tag = abre[0];
      const ini = desde.indexOf(tag) + tag.length;
      const fin = desde.indexOf(tag, ini);
      if (fin === -1) continue;
      ultimo = { archivo, cuerpo: desde.slice(ini, fin) };
    }
  }
  return ultimo;
}

async function traerDesplegadas() {
  const url = (process.env.PLATFORM_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .replace(/\/+$/, '');
  const key = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { skip: 'sin credenciales' };

  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/function_snapshot`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
  } catch (e) {
    return { skip: `no se pudo conectar (${e.message})` };
  }

  if (res.status === 404) {
    return {
      skip: 'la base no tiene public.function_snapshot() — aplicale '
        + 'platform/migrations/0061_function_snapshot_rpc.sql',
    };
  }
  if (!res.ok) {
    return { skip: `HTTP ${res.status}` };
  }
  return { funciones: await res.json() };
}

/**
 * Todas las firmas desplegadas de `fn`.
 *
 * El snapshot viene con clave `nombre(args)` justamente para no perder
 * overloads: `sumar_staff` tiene dos en produccion porque la 0054 creo la de
 * dos argumentos y nadie dropeo la de uno.
 */
export function overloadsDe(snapshot, fn) {
  return Object.entries(snapshot || {})
    .filter(([clave, v]) => (v && v.name === fn) || clave.startsWith(`${fn}(`))
    .map(([, v]) => v);
}

/** Primer tramo donde difieren, para no imprimir cuerpos enteros. */
export function primeraDiferencia(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const ctx = 90;
  return {
    repo: a.slice(Math.max(0, i - 20), i + ctx),
    desplegado: b.slice(Math.max(0, i - 20), i + ctx),
  };
}

async function main() {
  const { skip, funciones } = await traerDesplegadas();

  if (skip) {
    console.log(`· drift de funciones: salteado (${skip})`);
    return 0;
  }

  let problemas = 0;
  let comparadas = 0;

  for (const fn of CRITICAS) {
    // La clave del snapshot es `nombre(args)`, asi que una funcion con varias
    // firmas aparece varias veces. Se juntan todas: cual corre en produccion
    // lo decide el caller (PostgREST resuelve por argumentos), asi que basta
    // con que ALGUNA coincida con el repo.
    const overloads = overloadsDe(funciones, fn);
    const enRepo = cuerpoSegunElRepo(fn);

    if (overloads.length === 0 && !enRepo) continue;

    if (overloads.length === 0) {
      mal(`${fn}: esta en las migraciones y NO esta desplegada`);
      info(`la define ${enRepo.archivo} — falta aplicarla`);
      problemas++;
      continue;
    }

    if (!enRepo) {
      mal(`${fn}: esta desplegada y NINGUNA migracion la define`);
      info('se aplico fuera del repo: escribi el archivo que la produce');
      problemas++;
      continue;
    }

    // Mas de una firma no es drift, pero es un riesgo: cual se ejecuta depende
    // de con cuantos argumentos la llamen. Se avisa sin hacer fallar.
    if (overloads.length > 1) {
      info(`⚠ ${fn}: ${overloads.length} firmas desplegadas — ${overloads.map((o) => `(${o.args})`).join(' ')}`);
      info('  cual corre lo decide el caller. Dropea la que sobre.');
    }

    comparadas++;
    const esperado = normalizar(enRepo.cuerpo);
    if (!overloads.some((o) => normalizar(o.body) === esperado)) {
      mal(`${fn}: ninguna firma desplegada coincide con ${enRepo.archivo}`);
      if (VERBOSE) {
        const d = primeraDiferencia(esperado, normalizar(overloads[0].body));
        info(`repo       …${d.repo}…`);
        info(`desplegado …${d.desplegado}…`);
      }
      problemas++;
    }
  }

  if (problemas) {
    console.log('');
    mal(`${problemas} funcion(es) con drift entre el repo y la base`);
    info('Correlo con --verbose para ver donde difieren.');
    info('Una funcion que drifteo no falla: hace algo distinto de lo que dice');
    info('el repo, y nadie se entera hasta que un cliente lo sufre.');
    return 1;
  }

  ok(`${comparadas} funcion(es) criticas: lo desplegado coincide con las migraciones`);
  return 0;
}

if (ES_MAIN) {
  // process.exitCode y NO process.exit(): cortar el proceso justo despues de un
  // fetch dispara una assertion de libuv en Windows y sale con 127, que CI lee
  // como fallo. Se deja que node cierre solo.
  const { cargarEnvDeArchivo } = await import('../platform/scripts/_env.mjs');
  cargarEnvDeArchivo();
  process.exitCode = await main();
}
