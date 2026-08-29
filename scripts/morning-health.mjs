#!/usr/bin/env node
// scripts/morning-health.mjs
// ─────────────────────────────────────────────────────────
// Health check matutino de DICO (el edificio) — envia a Telegram.
// Corre via GitHub Actions cron L-S 7am AR (10:00 UTC), o a mano:
//   node scripts/morning-health.mjs
//
// Reescrito 17/ago/2026. La version anterior chequeaba los 3 tenants LEGACY
// (proyectos Supabase pausados a proposito): daba rojo todas las mananas, y un
// reporte que siempre esta en rojo se deja de leer — el opuesto de un health
// check. Ahora mira lo que esta VIVO:
//
//   1. Landing divianco.app
//   2. Por tenant: catalogo por subdominio (HTTP) + RPC get_catalog (valida
//      DB + RLS + que haya productos). El ping ademas cuenta como actividad:
//      ayuda a que el free tier no auto-pause el proyecto.
//   3. Edge function submit-order viva (OPTIONS al gateway)
//   4. Drift de schema del edificio (schema-sync --check) — con service role
//      en secrets; sin ella se saltea. Un snapshot viejo no falla: deja de
//      proteger en silencio (la familia de bug del Zod, 4 veces).
//   5. Sentry: issues nuevos en 24h — con SENTRY_AUTH_TOKEN; sin token se
//      saltea.
//
// Criterio del mensaje: lo roto va PRIMERO y el verde es corto. Secrets que
// espera el workflow: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, y opcionales
// PLATFORM_SUPABASE_URL / PLATFORM_SUPABASE_SERVICE_ROLE_KEY (drift) y
// SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT (errores).
// ─────────────────────────────────────────────────────────

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// El edificio. La anon key es sb_publishable_ (publica por diseno, viaja en
// el bundle del cliente): hardcodearla aca no expone nada.
const PLATFORM_URL = 'https://wwwzdgprsooyjgkuyoav.supabase.co';
const PLATFORM_ANON = 'sb_publishable_8gMlo42jYdK8epcD-Zr9TQ_eKmY2nW-';

const LANDING = 'https://divianco.app';

// Tenants con negocio real andando. Los demo (barberia-demo, tienda-demo) no
// van: que se caigan no despierta a nadie.
const TENANTS = ['la-nona-pato', 'cochi', 'mala-miga'];

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

if (!TG_TOKEN || !TG_CHAT) {
  console.error('❌ Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  const problemas = [];
  const detalles = [];

  /* ── 1. Landing ──────────────────────────────────────── */
  const landing = await httpCheck(LANDING);
  if (landing !== '✓') problemas.push(`Landing divianco.app: ${landing}`);

  /* ── 2. Tenants: subdominio + catalogo por RPC ───────── */
  const tenants = await Promise.all(TENANTS.map(async (slug) => {
    const [front, rpc] = await Promise.all([
      httpCheck(`https://${slug}.divianco.app`),
      checkCatalogRpc(slug),
    ]);
    return { slug, front, rpc };
  }));
  for (const t of tenants) {
    const ok = t.front === '✓' && t.rpc.startsWith('✓');
    if (!ok) problemas.push(`*${t.slug}* — front: ${t.front} · catalogo: ${t.rpc}`);
    detalles.push(`${ok ? '🟢' : '🔴'} ${t.slug} · ${t.rpc}`);
  }

  /* ── 3. submit-order viva ────────────────────────────── */
  const fn = await checkSubmitOrder();
  if (fn !== '✓') problemas.push(`submit-order: ${fn}`);

  /* ── 4. Drift de schema (opcional, exige service role) ─ */
  const drift = checkSchemaDrift();
  if (drift.rojo) problemas.push(`Snapshot del edificio DESACTUALIZADO — correr npm run schema:sync`);
  detalles.push(`schema: ${drift.texto}`);

  /* ── 5. Drift de funciones (opcional, exige service role) ─
     El de schema mira COLUMNAS; este mira el CUERPO de las funciones
     criticas. Es el unico que habria visto que `signup_tenant` desplegada no
     la producia ninguna migracion del repo (29/ago). */
  const fnDrift = checkFunctionsDrift();
  if (fnDrift.rojo) problemas.push(`Funciones DRIFTEADAS vs migraciones — node scripts/check-functions-drift.mjs --verbose`);
  detalles.push(`funciones: ${fnDrift.texto}`);

  /* ── 6. Sentry (opcional) ────────────────────────────── */
  const sentry = await checkSentry();
  if (sentry.rojo) problemas.push(`Sentry: ${sentry.texto}`);
  else detalles.push(`sentry: ${sentry.texto}`);

  /* ── Mensaje: lo roto primero, el verde corto ────────── */
  const date = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const lines = [`🌅 *Dico — salud del edificio*`, `_${date}_`, ''];

  if (problemas.length === 0) {
    lines.push(`✅ Todo en verde (${TENANTS.length} tenants, función, schema).`);
    lines.push('');
    lines.push(...detalles.map(d => `  ${d}`));
  } else {
    lines.push(`⚠️ *${problemas.length} problema${problemas.length > 1 ? 's' : ''}:*`);
    lines.push(...problemas.map(p => `• ${p}`));
    lines.push('');
    lines.push(...detalles.map(d => `  ${d}`));
  }

  const msg = lines.join('\n');
  console.log(msg);
  const enviado = await sendTelegram(msg);
  if (enviado) console.log('\n✓ Enviado a Telegram');
}

/* ─────────────────────── Checks ─────────────────────── */

async function httpCheck(url) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
    return r.ok ? '✓' : `HTTP ${r.status}`;
  } catch (e) {
    return `error: ${e.name}`;
  }
}

/** get_catalog valida DB despierta + RPC + que el tenant tenga productos. */
async function checkCatalogRpc(slug) {
  try {
    const r = await fetch(`${PLATFORM_URL}/rest/v1/rpc/get_catalog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PLATFORM_ANON,
        Authorization: `Bearer ${PLATFORM_ANON}`,
      },
      body: JSON.stringify({ p_tenant_slug: slug }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return `HTTP ${r.status}`;
    const data = await r.json();
    const n = Array.isArray(data?.products) ? data.products.length : 0;
    // 0 productos en un negocio real no es "anda": es un catalogo vacio que
    // el cliente ve como local cerrado.
    return n > 0 ? `✓ ${n} productos` : 'catalogo VACIO';
  } catch (e) {
    return `error: ${e.name}`;
  }
}

/** OPTIONS responde el handler CORS de la funcion: viva sin crear pedidos. */
async function checkSubmitOrder() {
  try {
    const r = await fetch(`${PLATFORM_URL}/functions/v1/submit-order`, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(10000),
    });
    return r.ok ? '✓' : `HTTP ${r.status}`;
  } catch (e) {
    return `error: ${e.name}`;
  }
}

/**
 * Reusa schema-sync --check --target=platform, que resuelve solo sus
 * credenciales (.env.scripts local, secrets en CI) y se saltea limpio sin
 * ellas — por eso aca no hay guard de env: se corre siempre y se lee el
 * resultado.
 */
function checkSchemaDrift() {
  const r = spawnSync(process.execPath, [join(HERE, 'schema-sync.mjs'), '--check', '--target=platform'], {
    encoding: 'utf-8', timeout: 60000,
  });
  const salida = `${r.stdout || ''}${r.stderr || ''}`;
  if (/salteado/.test(salida)) return { rojo: false, texto: 'sin credenciales — salteado' };
  if (r.status === 0) return { rojo: false, texto: '✓ al dia' };
  return { rojo: true, texto: 'DESACTUALIZADO' };
}

/**
 * El cuerpo de las funciones criticas vs lo que dicen las migraciones.
 *
 * Distinto de checkSchemaDrift: ese compara COLUMNAS y este el CODIGO. Una
 * funcion que drifteo no falla —hace algo distinto de lo que dice el repo— y
 * ningun otro guard lo ve.
 */
function checkFunctionsDrift() {
  const r = spawnSync(process.execPath, [join(HERE, 'check-functions-drift.mjs')], {
    encoding: 'utf-8', timeout: 60000,
  });
  const salida = `${r.stdout || ''}${r.stderr || ''}`;
  if (/salteado/.test(salida)) return { rojo: false, texto: 'sin credenciales — salteado' };
  if (r.status === 0) return { rojo: false, texto: '✓ coinciden' };
  return { rojo: true, texto: 'DRIFT' };
}

/** Issues sin resolver vistos en las ultimas 24h. Sin token se saltea. */
async function checkSentry() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  if (!token || !org || !project) return { rojo: false, texto: 'sin token — salteado' };

  try {
    const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/`
      + `?query=${encodeURIComponent('is:unresolved')}&statsPeriod=24h&limit=5`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { rojo: true, texto: `API HTTP ${r.status}` };
    const issues = await r.json();
    if (!Array.isArray(issues) || issues.length === 0) return { rojo: false, texto: '✓ sin errores en 24h' };
    const top = issues.slice(0, 3).map(i => i.title?.slice(0, 60) || i.culprit || '?');
    return { rojo: true, texto: `${issues.length} issue(s) en 24h — ${top.join(' · ')}` };
  } catch (e) {
    return { rojo: true, texto: `error: ${e.name}` };
  }
}

/* ─────────────────────── Telegram ───────────────────── */

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.error('Telegram API error:', r.status, body);
    process.exitCode = 1;
    return false;
  }
  return true;
}
