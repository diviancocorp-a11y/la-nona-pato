// src/test/goldenScreenProductos.test.js
//
// Phase 4 — Golden Screen (Productos). Los contratos del brief que se pueden
// medir sin navegador: G1 (contraste) y G2 (sin fallbacks en var()).
// Brief: platform/PHASE-4-GOLDEN-SCREEN-BRIEF.md
//
// POR QUE ESTE LEE EL CSS Y NO COPIA LOS HEXES
// El bloque de contraste de Phase 3A (adminCorrectness.test.jsx) declara los
// tokens como literales adentro del test. Funciona, pero deja pasar el caso
// que a esta fase le importa: el CSS cambia, el test no, y el test sigue
// verde midiendo un color que ya no existe. Es EXACTAMENTE el defecto que
// Phase 4 encontro en produccion —un color que nadie volvio a medir despues
// de cambiarlo—, asi que repetir el patron aca seria construir la proxima
// version del mismo bug. Este parsea el archivo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const raiz = process.cwd();
const leer = (...p) => readFileSync(join(raiz, ...p), 'utf8');

const TOKENS = leer('src', 'styles', 'admin-tokens.css');
const MACHINE_SOUL = leer('src', 'styles', 'machine-soul.css');
const PANEL = leer('src', 'components', 'admin', 'platform', 'ProductsPanel.jsx');
const CSS_PANTALLA = leer('src', 'styles', 'admin-productos.css');

// Ver `sinComentarios` mas abajo: los tres se leen sin comentarios porque los
// comentarios de estos mismos archivos rompen las dos busquedas.

/* ── lectura de tokens ─────────────────────────────────────────────── */

/**
 * Fuera los comentarios ANTES de buscar nada.
 *
 * No es higiene: sin esto los dos contratos de este archivo dan un resultado
 * falso. `admin-tokens.css` menciona `.ag-theme-dark` dentro de un comentario
 * del bloque claro, asi que buscar el selector a secas devolvia el bloque
 * CLARO como si fuera el oscuro —y el test comparaba el tema contra si mismo,
 * en verde—. Del lado del JSX pasa lo simetrico: un comentario que explica por
 * que no hay que usar `var(--x, #hex)` hacia fallar al guard que prohibe
 * justamente eso.
 *
 * En CSS solo existen los de bloque; en JS/JSX tambien los de linea.
 */
function sinComentarios(texto, { linea = false } = {}) {
  const t = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  return linea ? t.replace(/(^|[^:])\/\/[^\n]*/g, '$1') : t;
}

/** El cuerpo de un selector, para no leer un token del bloque equivocado. */
function bloque(css, selector) {
  const i = css.indexOf(selector);
  if (i === -1) throw new Error(`No existe el selector ${selector}`);
  const abre = css.indexOf('{', i);
  const cierra = css.indexOf('}', abre);
  return css.slice(abre + 1, cierra);
}

// Ni los tokens ni Machine Soul nacen en `:root`: nacen en `.ag-root` y en el
// root de overlays. Es la regla de ownership de Phase 2B —el admin no le pisa
// las variables al catalogo— y por eso el ancla es el selector del admin.
const CSS_TOKENS = sinComentarios(TOKENS);
const RAIZ_CLARO = bloque(CSS_TOKENS, 'body[data-ui-owner="admin"]');
const RAIZ_OSCURO = bloque(CSS_TOKENS, '.ag-theme-dark');
const BASE_MS = bloque(sinComentarios(MACHINE_SOUL), '.ag-root,');
const PANEL_CODIGO = sinComentarios(PANEL, { linea: true });
const CSS_PANTALLA_CODIGO = sinComentarios(CSS_PANTALLA);

function valor(cuerpo, nombre) {
  const m = cuerpo.match(new RegExp(`${nombre}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

/** Resuelve un token a hex, siguiendo un nivel de var() hacia machine-soul. */
function hexDe(cuerpo, nombre) {
  const v = valor(cuerpo, nombre);
  if (!v) return null;
  if (v.startsWith('#')) return v;
  const ref = v.match(/var\(\s*(--[\w-]+)\s*\)/);
  if (!ref) return null;
  const base = valor(BASE_MS, ref[1]);
  return base && base.startsWith('#') ? base : null;
}

/** El token del tema oscuro, con el claro como herencia si no se redefine. */
const hexOscuro = (n) => hexDe(RAIZ_OSCURO, n) ?? hexDe(RAIZ_CLARO, n);

/* ── contraste WCAG 2.x ────────────────────────────────────────────── */

function luminancia(hex) {
  const h = hex.replace('#', '');
  const canal = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)];
  const r = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  return Math.round(r * 100) / 100;
}

/* ── G1: contraste ─────────────────────────────────────────────────── */

describe('Phase 4 · G1 — el margen por producto cumple AA en los dos temas', () => {
  // El texto del margen es de 13px normal: el minimo es 4.5, no 3.
  const MINIMO = 4.5;

  it('el parser encuentra los tokens que la pantalla usa', () => {
    // Si esto falla, el resto de las mediciones estaria comparando `null`.
    expect(hexDe(RAIZ_CLARO, '--ag-bg-card')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(hexOscuro('--ag-bg-card')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(hexDe(RAIZ_CLARO, '--ag-c-sales-ink')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(hexOscuro('--ag-c-orders-ink')).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  for (const token of ['--ag-c-sales-ink', '--ag-c-orders-ink']) {
    it(`${token} llega a ${MINIMO}:1 sobre la tarjeta, en claro y en oscuro`, () => {
      expect(contraste(hexDe(RAIZ_CLARO, token), hexDe(RAIZ_CLARO, '--ag-bg-card')))
        .toBeGreaterThanOrEqual(MINIMO);
      expect(contraste(hexOscuro(token), hexOscuro('--ag-bg-card')))
        .toBeGreaterThanOrEqual(MINIMO);
    });
  }

  it('los solidos siguen SIN cumplir como texto en claro: por eso existe el -ink', () => {
    // No es una queja contra los solidos: como relleno estan bien y se
    // conservan. Este caso fija POR QUE hay dos tokens, para que nadie los
    // unifique de nuevo "porque son el mismo color".
    const card = hexDe(RAIZ_CLARO, '--ag-bg-card');
    expect(contraste(hexDe(RAIZ_CLARO, '--ag-c-sales'), card)).toBeLessThan(MINIMO);
    expect(contraste(hexDe(RAIZ_CLARO, '--ag-c-orders'), card)).toBeLessThan(MINIMO);
  });

  it('la tinta clara pesa como el solido en oscuro: el color no cambia de jerarquia entre temas', () => {
    // Se eligieron oscureciendo el tono hasta igualar el contraste que el
    // solido ya tenia en oscuro. Sin esto, el mismo dato se leeria mas
    // liviano en un tema que en el otro.
    for (const [ink, solido] of [
      ['--ag-c-sales-ink', '--ag-c-sales'],
      ['--ag-c-orders-ink', '--ag-c-orders'],
    ]) {
      const claro = contraste(hexDe(RAIZ_CLARO, ink), hexDe(RAIZ_CLARO, '--ag-bg-card'));
      const oscuro = contraste(hexOscuro(solido), hexOscuro('--ag-bg-card'));
      expect(Math.abs(claro - oscuro)).toBeLessThan(0.5);
    }
  });
});

/* ── G2: sin fallbacks ─────────────────────────────────────────────── */

describe('Phase 4 · G2 — la pantalla no usa var() con fallback', () => {
  it('ni el componente ni su CSS tienen un var(--token, #hex)', () => {
    // Un fallback no falla NUNCA: si el token se renombra, el color se cae a
    // un literal fijo que deja de seguir al tema y la pantalla sigue
    // andando. Es la firma del defecto de contraste que cazo Phase 3A y la
    // razon de que el margen estuviera en 3.42:1 sin que nada avisara.
    const patron = /var\(\s*--[\w-]+\s*,[^)]*\)/g;
    expect(PANEL_CODIGO.match(patron) || []).toEqual([]);
    expect(CSS_PANTALLA_CODIGO.match(patron) || []).toEqual([]);
  });

  it('el margen se pinta con los tokens de tinta, no con los solidos', () => {
    // Phase 4 saco la presentacion del JSX: el color vive en el CSS de la
    // pantalla y el componente solo elige la clase.
    expect(CSS_PANTALLA_CODIGO).toContain('var(--ag-c-sales-ink)');
    expect(CSS_PANTALLA_CODIGO).toContain('var(--ag-c-orders-ink)');
    expect(PANEL_CODIGO).toContain('ag-fila-margen');
  });

  it('la pantalla no vuelve a clavar una familia tipografica a mano', () => {
    // El unico `fontFamily` de la pantalla era el DM Sans del titulo que se
    // eliminó. La familia la deciden los tokens, no el componente.
    expect(PANEL_CODIGO).not.toMatch(/fontFamily/);
    expect(CSS_PANTALLA_CODIGO).not.toMatch(/font-family:\s*(?!inherit)['"a-zA-Z]/);
  });

  it('el CSS de la pantalla no trae px sueltos de espaciado', () => {
    // El espaciado sale de --ag-sp-*. Se permiten los px que son contratos
    // medidos y no ritmo visual: los 44 del target tactil, el 18 que alinea
    // con `.ag-section-head`, el ancho de lectura y los hairlines de 1-2px.
    const permitidos = new Set(['44px', '18px', '860px', '1px', '2px', '0px']);
    const decls = CSS_PANTALLA_CODIGO.match(/(?:padding|margin|gap)[^:]*:\s*[^;]+;/g) || [];
    const sueltos = decls
      .flatMap((d) => d.match(/\d+(?:\.\d+)?px/g) || [])
      .filter((px) => !permitidos.has(px));
    expect(sueltos).toEqual([]);
  });
});
