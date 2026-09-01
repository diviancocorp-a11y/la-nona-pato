/**
 * Contratos de la cara canonica (Stage B5).
 *
 * Dico tiene UNA sola anatomia facial adentro de la app: `CaraDeTinta`. Native
 * la monta sobre la moneda y Physical la monta sobre el cuerpo 3D limpio. Los
 * renders narrativos viejos —los que traen ojos, bigote y boca cocidos al
 * pixel— siguen existiendo como archivo, pero no pueden volver a entrar.
 *
 * POR QUE ESTOS TESTS Y NO UN REFACTOR
 * Al auditar B5 la arquitectura YA cumplia: una sola fuente facial, los dos
 * cuerpos limpios, los globs con nombre exacto y el build emitiendo solo tres
 * assets. Lo que faltaba no era codigo sino garantia: nada impedia que un
 * `import DicoEscena` desde un panel, o un glob ensanchado a `poses/*.webp`,
 * devolvieran la cara vieja a la interfaz sin que ningun gate chillara.
 *
 * Los contratos son ESTRUCTURALES a proposito. No comparan archivos enteros
 * como strings —eso se rompe con cualquier reformateo y no prueba nada— sino
 * que leen el grafo de imports, expanden los globs de verdad y comparan la
 * geometria que las dos modalidades terminan pintando en el DOM.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DicoCara from '../components/dico/DicoCara';
import DicoSlot from '../components/dico/DicoSlot';

const POSES = 'src/components/dico/poses';

/**
 * Clasificacion de `poses/`. Cada archivo entra en exactamente una lista, y un
 * archivo nuevo rompe el primer test hasta que alguien lo clasifique: es el
 * unico momento en que se decide si una imagen puede o no tocar la app.
 */
const CUERPOS_RUNTIME = [
  'moneda-sin-brazos.webp',   // Native: disco liso, sin rasgos
  'brazos.webp',              // Native: brazos y guantes sobre alfa
  'dico-physical-body.webp',  // Physical: moneda con galera, centro limpio
];

/** Fuentes archivadas SIN cara. Pueden entrar sin dano; hoy no las usa nadie. */
const ARCHIVO_SIN_CARA = [
  'moneda.webp',
  'moneda-retro-galera.webp',
  'moneda-render-crudo.jpg',
];

/**
 * Los siete renders narrativos con la ANATOMIA VIEJA cocida al pixel: ojos,
 * cejas, nariz, bigote y boca. Se conservan para marketing, Retro Moments y
 * material de produccion. Ninguno puede aparecer en una superficie in-app.
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

/**
 * Modulos que pueden tocar la cara legacy sin que sea un defecto: el propio
 * componente heredado y lo que no viaja en el bundle de la app (tests y la
 * vitrina, que compila con su propio vite.config).
 */
const PUEDEN_USAR_LEGACY = [
  'src/components/dico/DicoEscena.jsx',
];

function recorrer(dir, acumulado = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, acumulado);
    else if (/\.(jsx?|css)$/.test(nombre)) acumulado.push(ruta.replace(/\\/g, '/'));
  }
  return acumulado;
}

/** Archivos de `src/` que SI viajan al bundle: todo menos la carpeta de tests. */
function fuentesDeLaApp() {
  return recorrer('src').filter(f => !f.startsWith('src/test/'));
}

/** Expande `{a,b}` y `*` de un patron de glob a una expresion regular. */
function globARegex(patron) {
  const llaves = patron.replace(/\{([^}]*)\}/g, (_, opciones) => `(${opciones.split(',').join('|')})`);
  const escapado = llaves.replace(/[.+^$()|[\]\\]/g, m => `\\${m}`);
  return new RegExp(`^${escapado.replace(/\*/g, '[^/]*')}$`);
}

/** Firma geometrica de la cara tal como queda pintada en el DOM. */
function firmaFacial(raiz) {
  const cara = raiz.querySelector('.dico-tinta-cara');
  if (!cara) return null;
  return [...cara.querySelectorAll('*')].map(el => [
    el.tagName,
    el.getAttribute('class') || '',
    el.getAttribute('d') || '',
    el.getAttribute('cx') || '',
    el.getAttribute('cy') || '',
    el.getAttribute('rx') || '',
    el.getAttribute('ry') || '',
    el.getAttribute('r') || '',
    el.getAttribute('fill') || '',
  ].join('|'));
}

describe('cara canonica de Dico', () => {
  it('clasifica todos los assets de poses/ y no deja ninguno sin decidir', () => {
    const enDisco = readdirSync(POSES).filter(n => n !== 'README.md').sort();
    const clasificados = [...CUERPOS_RUNTIME, ...ARCHIVO_SIN_CARA, ...ARCHIVO_CARA_LEGACY].sort();

    // Si esto falla es porque alguien agrego una imagen: hay que decir si tiene
    // cara vieja o no ANTES de que un glob pueda alcanzarla.
    expect(enDisco).toEqual(clasificados);
  });

  it('mantiene los globs de runtime con nombre exacto y fuera de la cara legacy', () => {
    const globs = [];
    for (const archivo of fuentesDeLaApp()) {
      const texto = readFileSync(archivo, 'utf8');
      for (const m of texto.matchAll(/import\.meta\.glob\(\s*['"]([^'"]+)['"]/g)) {
        globs.push({ archivo, patron: m[1] });
      }
    }

    expect(globs.length).toBeGreaterThan(0);

    for (const { archivo, patron } of globs) {
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

  it('no deja que una superficie de la app importe la cara legacy', () => {
    const culpables = [];
    for (const archivo of fuentesDeLaApp()) {
      if (PUEDEN_USAR_LEGACY.includes(archivo)) continue;
      const texto = readFileSync(archivo, 'utf8');
      if (/from\s+['"][^'"]*DicoEscena['"]/.test(texto)) culpables.push(`${archivo}: importa DicoEscena`);
      for (const legacy of ARCHIVO_CARA_LEGACY) {
        if (texto.includes(legacy)) culpables.push(`${archivo}: referencia ${legacy}`);
      }
    }
    expect(culpables).toEqual([]);
  });

  it('define la geometria facial en un solo modulo', () => {
    // `dico-esclera` es el blanco del ojo: existe una vez por implementacion de
    // cara. Dos archivos con esa clase significan dos anatomias.
    const definen = fuentesDeLaApp().filter(archivo => {
      if (archivo.endsWith('.css')) return false; // el CSS transforma, no dibuja
      return readFileSync(archivo, 'utf8').includes('dico-esclera');
    });
    expect(definen).toEqual(['src/components/dico/CaraDeTinta.jsx']);
  });

  it('no dibuja rasgos faciales desde CSS', () => {
    // Si un rasgo naciera de un `background-image` o un `content`, cambiar
    // CaraDeTinta dejaria de alcanzar para cambiar la cara.
    const rasgos = /dico-(esclera|pupila|parpado|ceja|boca)[^{]*\{([^}]*)\}/g;
    for (const archivo of fuentesDeLaApp().filter(f => f.endsWith('.css'))) {
      const css = readFileSync(archivo, 'utf8');
      for (const m of css.matchAll(rasgos)) {
        expect(m[2], `${archivo}: ${m[0].slice(0, 60)}`).not.toMatch(/background-image:|content:\s*['"]|url\(/);
      }
    }
  });

  it('Native monta CaraDeTinta sobre el cuerpo, no una cara propia', () => {
    const { container } = render(React.createElement(DicoCara, { estado: 'idle', size: 48 }));

    const cara = container.querySelector('.dico-capa-tinta .dico-cara .dico-tinta-cara');
    expect(cara).toBeInTheDocument();
    expect(cara.querySelectorAll('.dico-esclera')).toHaveLength(2);
    expect(cara.querySelectorAll('.dico-parpado')).toHaveLength(2);
    expect(cara.querySelectorAll('.dico-ceja')).toHaveLength(2);
    expect(cara.querySelectorAll('.dico-boca').length).toBeGreaterThan(0);

    // El cuerpo Native es asset limpio: la cara no viene adentro del render.
    for (const img of container.querySelectorAll('img')) {
      const src = img.getAttribute('src') || '';
      for (const legacy of ARCHIVO_CARA_LEGACY) expect(src).not.toContain(legacy.replace('.webp', ''));
    }
  });

  it('Physical monta la MISMA CaraDeTinta sobre el cuerpo 3D limpio', () => {
    const { container } = render(React.createElement(DicoSlot, { estado: 'physical_open' }));

    const cara = container.querySelector('.dico-physical-cara .dico-tinta-cara');
    expect(cara).toBeInTheDocument();
    expect(cara.querySelectorAll('.dico-esclera')).toHaveLength(2);
    expect(cara.querySelectorAll('.dico-parpado')).toHaveLength(2);
    expect(cara.querySelectorAll('.dico-ceja')).toHaveLength(2);

    // El cuerpo Physical es un asset SIN cara: si alguien lo reemplaza por un
    // render con rasgos, la cara canonica quedaria encima de otra cara.
    const cuerpo = container.querySelector('.dico-physical-cuerpo');
    expect(cuerpo.getAttribute('src')).toContain('dico-physical-body');
    expect(CUERPOS_RUNTIME).toContain('dico-physical-body.webp');
  });

  it('pinta exactamente la misma anatomia en Native y en Physical', () => {
    // El contrato de fondo de B5: una expresion nueva en CaraDeTinta se ve en
    // las dos modalidades porque las dos leen la misma geometria. Si alguien
    // bifurca la cara, estas dos firmas dejan de coincidir.
    const native = render(React.createElement(DicoCara, { estado: 'idle', size: 48 }));
    const physical = render(React.createElement(DicoSlot, { estado: 'physical_open' }));

    const firmaNative = firmaFacial(native.container);
    const firmaPhysical = firmaFacial(physical.container);

    expect(firmaNative).not.toBeNull();
    expect(firmaPhysical).toEqual(firmaNative);
  });

  it('mantiene la cara canonica incluso cuando falta el render del cuerpo', () => {
    // El fallback provisorio de DicoCara existe para que borrar un .webp no
    // rompa la app. Tambien tiene que caer del lado canonico.
    const fuente = readFileSync('src/components/dico/DicoCara.jsx', 'utf8');
    const provisoria = fuente.slice(fuente.indexOf('function DicoProvisoria'));
    expect(provisoria).toContain('CapaDeTinta');
  });
});

describe('la vitrina no es una superficie de la app', () => {
  it('compila con su propia configuracion y no entra al bundle', () => {
    // Es el consumidor legitimo de DicoEscena: ahi las poses narrativas se
    // muestran a proposito. El contrato es que viva afuera del build de la app.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.vitrina).toContain('tools/vitrina/vite.config.mjs');
    expect(relative('.', 'tools/vitrina').replace(/\\/g, '/')).not.toContain('src/');
  });
});
