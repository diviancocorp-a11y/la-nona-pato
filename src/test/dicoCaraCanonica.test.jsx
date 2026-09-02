/**
 * Contratos de la cara canonica (Stage B5).
 *
 * Dico tiene UNA sola anatomia facial adentro de la app: `CaraDeTinta`. Native
 * la monta sobre la moneda y Physical la monta sobre el cuerpo 3D limpio. Los
 * renders narrativos viejos —los que traen ojos, bigote y boca cocidos al
 * pixel— siguen existiendo como archivo de vitrina y no se tocan: lo que no
 * pueden hacer es volver a entrar a una superficie productiva.
 *
 * POR QUE ESTOS TESTS Y NO UN REFACTOR
 * Al auditar B5 la arquitectura YA cumplia: una sola fuente facial, los dos
 * cuerpos limpios, los globs con nombre exacto y el build emitiendo solo tres
 * assets sin cara. Lo que faltaba no era codigo sino garantia.
 *
 * QUE SIGNIFICA "SUPERFICIE PRODUCTIVA"
 * No "un archivo cuya ruta no empieza con src/test". Eso seria una lista de
 * exclusiones que envejece mal. Aca se camina el GRAFO DE IMPORTS real desde
 * `src/main.jsx`, el mismo punto de entrada que usa `index.html`: productivo es
 * lo que el bundle puede alcanzar. Los tests, `tools/vitrina` y la
 * documentacion quedan afuera solos, sin nombrarlos, porque nadie los importa
 * desde la app.
 *
 * QUE SIGNIFICA "PARIDAD"
 * No que Native y Physical tengan el mismo tamanio, offset, escala o encuadre:
 * los cuerpos son distintos y sus transformaciones tambien. Significa que la
 * GEOMETRIA FACIAL sale de `CaraDeTinta`. Por eso la firma que se compara son
 * atributos internos del viewBox —paths y radios—, que no dependen de a que
 * tamanio se pinte cada modalidad, y por eso se compara contra el componente
 * renderizado SOLO y no una modalidad contra la otra: si las dos se bifurcaran
 * a la vez, compararlas entre si no lo notaria.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CaraDeTinta from '../components/dico/CaraDeTinta';
import DicoCara from '../components/dico/DicoCara';
import DicoSlot from '../components/dico/DicoSlot';
import { NATIVE_STATES } from '../components/dico/vocabulario';

const RAIZ = resolve(__dirname, '..', '..');
const ENTRADA = 'src/main.jsx';   // el mismo de index.html
const POSES = 'src/components/dico/poses';

const norm = p => p.replace(/\\/g, '/');
const rel = p => norm(p).slice(norm(RAIZ).length + 1);

/* ─────────────────── Clasificacion de los assets de poses/ ─────────────────
 * Cada archivo entra en exactamente una lista. Uno nuevo rompe el primer test
 * hasta que alguien lo clasifique: es el unico momento en que se decide si una
 * imagen puede o no tocar la app. */

/* Physical dejo de salir de aca: ahora usa el pack oficial 3D, que vive en
   `public/brand/dico/physical/` y trae la cara renderizada. `dico-physical-body`
   queda archivado como el resto. */
const CUERPOS_RUNTIME = [
  'moneda-sin-brazos.webp',   // Native: disco liso, sin rasgos
  'brazos.webp',              // Native: brazos y guantes sobre alfa
];

/** Fuentes archivadas SIN cara. Podrian entrar sin dano; hoy no las usa nadie. */
const ARCHIVO_SIN_CARA = [
  'moneda.webp',
  'moneda-retro-galera.webp',
  'moneda-render-crudo.jpg',
];

/**
 * Los siete renders narrativos con la ANATOMIA VIEJA cocida al pixel: ojos,
 * cejas, nariz, bigote y boca. Se conservan para vitrina, marketing y Retro
 * Moments. Ninguno puede ser alcanzable desde el punto de entrada de la app.
 */
const ARCHIVO_CARA_LEGACY = [
  'escena-celebra.webp',
  'escena-descubre.webp',
  'escena-explica.webp',
  'escena-fatal.webp',
  'escena-idle.webp',
  'escena-pregunta.webp',
  'escena-senala.webp',
];

/* ───────────────────────── El grafo de imports ───────────────────────────── */

const ALIAS = [
  { prefijo: '@hermes/core/', destino: 'src/' },
  { prefijo: '@business', destino: 'clients/hermes-cochi/business.js', exacto: true },
];

const EXTENSIONES = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.jsx'];

function resolverEspecificador(especificador, desde) {
  for (const a of ALIAS) {
    if (a.exacto && especificador === a.prefijo) return join(RAIZ, a.destino);
    if (!a.exacto && especificador.startsWith(a.prefijo)) {
      return join(RAIZ, a.destino, especificador.slice(a.prefijo.length));
    }
  }
  // Bare specifier: node_modules. No es superficie nuestra.
  if (!especificador.startsWith('.') && !especificador.startsWith('/')) return null;
  const base = especificador.startsWith('/')
    ? join(RAIZ, especificador.slice(1))
    : resolve(dirname(desde), especificador);
  for (const ext of EXTENSIONES) {
    const intento = base + ext;
    if (existsSync(intento) && statSync(intento).isFile()) return intento;
  }
  return null;
}

/**
 * Expande `{a,b}` y `*` de un glob a una expresion regular.
 *
 * El escapado va PRIMERO y la expansion despues. Al reves —que es como estaba
 * escrito al principio— los parentesis y la barra que genera la propia
 * expansion se escapan tambien, el regex no matchea nunca nada y cualquier
 * contrato que pregunte "este glob alcanza un asset legacy?" responde que no
 * por vacio. Lo detecto el contrato de los tres cuerpos, que pregunta al reves:
 * "que alcanza?".
 */
function globARegex(patron) {
  const escapado = patron.replace(/[.+^$()|[\]\\]/g, m => `\\${m}`);
  return new RegExp(`^${escapado
    .replace(/\{([^}]*)\}/g, (_, o) => `(${o.split(',').join('|')})`)
    // Una sola pasada: usar un centinela intermedio para `**` ya metio
    // NULL bytes en este archivo una vez, que es el bug #3 del CLAUDE.md.
    .replace(/\*\*|\*/g, m => (m === '**' ? '.*' : '[^/]*'))}$`);
}

/** Todo lo que el bundle puede alcanzar desde `src/main.jsx`. */
function grafoProductivo() {
  const vistos = new Set();
  const globs = [];
  const pendientes = [join(RAIZ, ENTRADA)];

  while (pendientes.length) {
    const archivo = pendientes.pop();
    const clave = rel(archivo);
    if (vistos.has(clave)) continue;
    if (!existsSync(archivo) || !statSync(archivo).isFile()) continue;
    vistos.add(clave);

    // Los binarios son hojas: se registran, no se parsean.
    if (!/\.(jsx?|tsx?|css)$/.test(archivo)) continue;
    const texto = readFileSync(archivo, 'utf8');

    const especificadores = [];
    // import x from 'y'  ·  export * from 'y'  ·  import 'y'
    for (const m of texto.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)) especificadores.push(m[1]);
    for (const m of texto.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) especificadores.push(m[1]);
    // import('y') dinamico
    for (const m of texto.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) especificadores.push(m[1]);
    // CSS: @import y url()
    for (const m of texto.matchAll(/@import\s+["']([^"']+)["']/g)) especificadores.push(m[1]);
    for (const m of texto.matchAll(/url\(\s*['"]?(\.[^'")]+)['"]?\s*\)/g)) especificadores.push(m[1]);

    for (const e of especificadores) {
      const destino = resolverEspecificador(e.split('?')[0], archivo);
      if (destino) pendientes.push(destino);
    }

    // import.meta.glob: se expande contra el disco, igual que hace Vite.
    for (const m of texto.matchAll(/import\.meta\.glob\(\s*['"]([^'"]+)['"]/g)) {
      const patron = m[1];
      globs.push({ archivo: clave, patron });
      const dirBase = dirname(archivo);
      const carpeta = join(dirBase, dirname(patron));
      if (!existsSync(carpeta)) continue;
      const regex = globARegex(patron.replace(/^\.\//, ''));
      for (const nombre of readdirSync(carpeta)) {
        const candidato = norm(join(dirname(patron), nombre)).replace(/^\.\//, '');
        if (regex.test(candidato)) pendientes.push(join(carpeta, nombre));
      }
    }
  }

  return { alcanzables: vistos, globs };
}

const PRODUCTIVO = grafoProductivo();

/** Firma de la anatomia: atributos INTERNOS del viewBox, independientes de escala. */
function firmaAnatomia(raiz) {
  const cara = raiz.querySelector('.dico-tinta-cara');
  if (!cara) return null;
  return [...cara.querySelectorAll('*')].map(el => [
    el.tagName,
    el.getAttribute('class') || '',
    el.getAttribute('d') || '',
    el.getAttribute('cx') || '', el.getAttribute('cy') || '',
    el.getAttribute('rx') || '', el.getAttribute('ry') || '', el.getAttribute('r') || '',
    el.getAttribute('fill') || '',
  ].join('|'));
}

/* ──────────────────────────────── Contratos ──────────────────────────────── */

describe('B5 — el grafo productivo no alcanza la cara legacy', () => {
  it('parte de un grafo real y no de una lista de exclusiones', () => {
    // Si el walker se rompiera y devolviera casi nada, todos los contratos de
    // abajo pasarian por vacio. Este es el canario.
    expect(PRODUCTIVO.alcanzables.size).toBeGreaterThan(100);
    expect(PRODUCTIVO.alcanzables).toContain('src/components/dico/CaraDeTinta.jsx');
    expect(PRODUCTIVO.alcanzables).toContain('src/components/dico/DicoCara.jsx');
    expect(PRODUCTIVO.alcanzables).toContain('src/components/dico/DicoSlot.jsx');
  });

  it('no alcanza DicoEscena ni sus renders narrativos', () => {
    // El componente legacy y sus assets viven en el repo a proposito. El
    // contrato no es que no existan: es que el bundle no llegue a ellos.
    expect(PRODUCTIVO.alcanzables).not.toContain('src/components/dico/DicoEscena.jsx');
    for (const legacy of ARCHIVO_CARA_LEGACY) {
      expect(PRODUCTIVO.alcanzables, legacy).not.toContain(`${POSES}/${legacy}`);
    }
  });

  it('alcanza exactamente los dos cuerpos sin cara que le quedan a Native', () => {
    const dePoses = [...PRODUCTIVO.alcanzables]
      .filter(f => f.startsWith(`${POSES}/`) && !f.endsWith('.md'))
      .map(f => f.slice(POSES.length + 1))
      .sort();
    expect(dePoses).toEqual([...CUERPOS_RUNTIME].sort());
  });

  it('mantiene los globs productivos con nombre exacto', () => {
    expect(PRODUCTIVO.globs.length).toBeGreaterThan(0);
    for (const { archivo, patron } of PRODUCTIVO.globs) {
      const nombre = patron.split('/').pop();
      // El comodin puede vivir en la EXTENSION (`.{png,webp,avif}` protege de un
      // cambio de formato) pero nunca en el nombre: `poses/*.webp` arrastraria
      // los siete renders narrativos al bundle sin que se note.
      expect(nombre.split('.')[0], `${archivo}: ${patron}`).not.toContain('*');
      const regex = globARegex(patron.replace(/^\.\//, ''));
      for (const legacy of ARCHIVO_CARA_LEGACY) {
        expect(regex.test(`poses/${legacy}`), `${patron} alcanza ${legacy}`).toBe(false);
      }
    }
  });

  it('clasifica todos los assets de poses/ y no deja ninguno sin decidir', () => {
    const enDisco = readdirSync(join(RAIZ, POSES)).filter(n => n !== 'README.md').sort();
    expect(enDisco).toEqual([
      ...CUERPOS_RUNTIME, 'dico-physical-body.webp', ...ARCHIVO_SIN_CARA, ...ARCHIVO_CARA_LEGACY,
    ].sort());
  });
});

describe('B5 — una sola fuente facial', () => {
  it('define la geometria facial en un solo modulo productivo', () => {
    // `dico-esclera` es el blanco del ojo: existe una vez por implementacion de
    // cara. Dos modulos con esa clase significan dos anatomias.
    const definen = [...PRODUCTIVO.alcanzables]
      .filter(f => /\.jsx?$/.test(f))
      .filter(f => readFileSync(join(RAIZ, f), 'utf8').includes('dico-esclera'));
    expect(definen).toEqual(['src/components/dico/CaraDeTinta.jsx']);
  });

  it('no dibuja rasgos faciales desde CSS', () => {
    // El CSS transforma la anatomia; no la crea. Si un rasgo naciera de un
    // `background-image` o un `content`, cambiar CaraDeTinta dejaria de
    // alcanzar para cambiar la cara.
    const rasgos = /dico-(esclera|pupila|parpado|ceja|boca)[^{]*\{([^}]*)\}/g;
    const css = [...PRODUCTIVO.alcanzables].filter(f => f.endsWith('.css'));
    expect(css.length).toBeGreaterThan(0);
    for (const archivo of css) {
      for (const m of readFileSync(join(RAIZ, archivo), 'utf8').matchAll(rasgos)) {
        expect(m[2], `${archivo}: ${m[0].slice(0, 60)}`).not.toMatch(/background-image:|content:\s*['"]|url\(/);
      }
    }
  });
});

describe('B5 — Native y Physical rinden la anatomia de CaraDeTinta', () => {
  // Referencia: el componente solo, sin cuerpo ni modalidad.
  const referencia = firmaAnatomia(
    render(React.createElement('svg', { viewBox: '0 0 120 120' }, React.createElement(CaraDeTinta))).container,
  );

  it('la referencia tiene la anatomia completa', () => {
    expect(referencia).not.toBeNull();
    expect(referencia.length).toBeGreaterThan(20);
  });

  it('Native monta esa anatomia sobre el cuerpo, no una propia', () => {
    const { container } = render(React.createElement(DicoCara, { estado: 'idle', size: 48 }));
    const capa = container.querySelector('.dico-capa-tinta .dico-cara');
    expect(capa).toBeInTheDocument();
    expect(firmaAnatomia(capa)).toEqual(referencia);
  });

  it('Physical usa el pack oficial y NO le monta una cara encima', () => {
    // Esto era al reves: Physical era un cuerpo sin cara mas `CaraDeTinta`
    // arriba, y habia un contrato que exigia que el cuerpo NO tuviera rasgos
    // —"si alguien lo reemplazara por un render con rasgos, la cara canonica
    // quedaria encima de otra cara"—. Los ocho assets oficiales SI traen la
    // cara renderizada, asi que la regla se cumple de la unica forma posible:
    // sacando la capa de tinta.
    const { container } = render(React.createElement(DicoSlot, { estado: 'physical_open' }));
    expect(container.querySelector('.dico-physical-cara')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();

    const capa = container.querySelector('.dico-pose-capa--actual');
    expect(capa.getAttribute('src')).toBe('/brand/dico/physical/dico-3d-idle.webp');
  });

  it('el fallback provisorio de Native tambien es canonico', () => {
    // Existe para que borrar un .webp no rompa la app. Tambien tiene que caer
    // del lado de la fuente unica.
    const fuente = readFileSync(join(RAIZ, 'src/components/dico/DicoCara.jsx'), 'utf8');
    expect(fuente.slice(fuente.indexOf('function DicoProvisoria'))).toContain('CapaDeTinta');
  });

  it('CaraDeTinta sigue siendo la unica anatomia de quien la use', () => {
    // El contrato de fondo de B5 sigue vivo, con menos superficies: Physical ya
    // no dibuja una cara —la trae el render— y Native 2D usa los PNG oficiales.
    // Lo que queda del lado de la tinta es `DicoCara`, y ahi la firma tiene que
    // seguir saliendo del mismo componente.
    const native = render(React.createElement(DicoCara, { estado: 'contento', size: 48 }));
    const fN = firmaAnatomia(native.container.querySelector('.dico-cara'));
    expect(fN).toEqual(referencia);
    // Las bocas de TODAS las expresiones estan en el DOM: cual se ve lo decide
    // `dico.css` por estado, no una anatomia distinta por expresion.
    expect(fN.filter(l => l.includes('dico-boca')).length).toBeGreaterThan(3);
  });
});

describe('B6R — los assets publicos de Dico 2D', () => {
  /**
   * Vite copia `public/` tal cual: estos archivos se referencian por URL y NO
   * pasan por el grafo de imports, asi que el gate de arriba —que camina el
   * grafo desde `src/main.jsx`— no los ve. Necesitan su propio contrato.
   *
   * Y necesita ser POSITIVO, no solo negativo. Un gate que unicamente dice "no
   * hay legacy" pasa igual si la carpeta esta vacia: la leccion de B5. Este
   * declara los siete que TIENEN que estar.
   */
  const PUBLICO = 'public/brand/dico';
  const OFICIALES = [
    'dico-2d-neutral.png', 'dico-2d-curious.png', 'dico-2d-happy.png',
    'dico-2d-celebrate.png', 'dico-2d-alert.png', 'dico-2d-concerned.png',
    'dico-2d-question.png',
  ];

  it('estan exactamente los siete assets oficiales, ni uno mas ni uno menos', () => {
    const enDisco = readdirSync(join(RAIZ, PUBLICO))
      .filter((n) => n.toLowerCase().endsWith('.png')).sort();
    expect(enDisco).toEqual([...OFICIALES].sort());
  });

  it('los siete cubren exactamente los siete nativeState del vocabulario', () => {
    // Si maniana se agrega un estado al vocabulario y nadie exporta su asset,
    // esto lo dice antes de que la sidebar muestre un hueco.
    const estados = OFICIALES.map((f) => f.replace('dico-2d-', '').replace('.png', '')).sort();
    expect(estados).toEqual([...NATIVE_STATES].sort());
  });

  it('no hay renders legacy ni cuerpos fuente en la carpeta publica', () => {
    for (const f of readdirSync(join(RAIZ, PUBLICO))) {
      for (const legacy of ARCHIVO_CARA_LEGACY) {
        expect(f, `${f} es un render legacy`).not.toBe(legacy);
      }
      expect(f, `${f}: render de escena legacy`).not.toMatch(/^escena-/);
      expect(f, `${f}: cuerpo fuente, no va al runtime`).not.toMatch(/^moneda/);
    }
  });

  it('cada asset publico es RGBA de verdad', () => {
    // Byte 25 del PNG es el color type del IHDR. 6 = RGBA. Un export sin canal
    // alfa entraria como 2 (RGB) y la moneda vendria con fondo.
    for (const f of OFICIALES) {
      const buf = readFileSync(join(RAIZ, PUBLICO, f));
      expect(buf.readUInt8(25), `${f} no es RGBA`).toBe(6);
    }
  });

  it('los derivados coinciden con su master: el script --check pasa', () => {
    // El contrato de fondo: nadie edita un derivado a mano. Si lo que hay en
    // disco no es lo que sale de `platform/brand/dico-2d-masters/`, falla.
    const r = spawnSync(process.execPath, ['scripts/dico-2d-derivar.mjs', '--check'],
      { cwd: RAIZ, encoding: 'utf8' });
    expect(r.status, `salida:\n${r.stdout || ''}\n${r.stderr || ''}`).toBe(0);
  });
});
