// src/test/machineSoul.test.js
//
// Contratos de Phase 3B — Machine Soul en el shell administrativo.
//
// Se leen las hojas como TEXTO, igual que `sentryRelease.test.js`: importarlas
// ejecutaria el pipeline de Vite y no es lo que interesa. Lo que se fija aca es
// el CONTRATO —que familia manda donde, que no puede volver, que reglas tiene
// la textura—; el estilo COMPUTADO real se verifica en navegador
// (.qa-lite/artifacts/phase3b-machine-soul).

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const leer = (p) => readFileSync(resolve(p), 'utf8');

const fonts = leer('src/styles/dico-fonts.css');
const ms = leer('src/styles/machine-soul.css');
const shell = leer('src/styles/admin-shell.css');
const tokens = leer('src/styles/admin-tokens.css');

/**
 * Las hojas que componen el SHELL: topbar, navegacion, hoja "Mas", dialogo,
 * encabezado de seccion y los tokens que consumen. El interior de cada modulo
 * no es shell y queda fuera de Phase 3B — hay 30 `'DM Sans'` inline en 18
 * componentes de modulo que se anotan como deuda y se tratan en su propia
 * pasada, no aca.
 */
const HOJAS_DEL_SHELL = [
  'src/styles/machine-soul.css',
  'src/styles/admin-tokens.css',
  'src/styles/admin-shell.css',
  'src/styles/admin-topbar.css',
  'src/styles/admin-bottomnav.css',
  'src/styles/admin-shared.css',
];

describe('tipografia: fuentes locales y verificables', () => {
  it('los tres WOFF2 estan en el repo', () => {
    for (const f of [
      'public/fonts/dico/overused-grotesk/OverusedGrotesk-VF.woff2',
      'public/fonts/dico/butler/Butler-Free-Rmn.woff2',
      'public/fonts/dico/butler/Butler-Free-Med.woff2',
    ]) expect(existsSync(resolve(f)), f).toBe(true);
  });

  it('se declaran autoalojadas, sin ningun host externo', () => {
    expect(fonts).toContain("'Overused Grotesk'");
    expect(fonts).toContain("'Butler'");
    expect(fonts).not.toMatch(/https?:\/\//);
    expect(fonts).not.toMatch(/fonts\.googleapis|fonts\.gstatic|typekit|cdn/i);
  });

  it('todas las caras usan font-display: swap', () => {
    const caras = fonts.split('@font-face').slice(1);
    expect(caras.length).toBeGreaterThanOrEqual(3);
    for (const c of caras) expect(c).toContain('font-display: swap');
  });

  it('el sistema declara fallbacks compatibles', () => {
    const linea = ms.split('\n').filter((l) => l.includes('--ms-font-system')).join(' ');
    expect(linea).toContain('Overused Grotesk');
    expect(linea).toMatch(/system-ui|sans-serif/);
    const soul = ms.split('\n').filter((l) => l.includes('--ms-font-soul')).join(' ');
    expect(soul).toContain('Butler');
    expect(soul).toMatch(/serif/);
  });
});

describe('tipografia: quien habla donde', () => {
  it('el shell operativo usa Overused Grotesk', () => {
    expect(tokens).toContain('--ag-font: var(--ms-font-system)');
    expect(shell).toMatch(/\.ag-root,\s*\n\.ag-overlay-root \{[^}]*font-family: var\(--ag-font\)/);
  });

  it('Butler queda para el titulo de seccion y nada mas', () => {
    expect(tokens).toContain('--ag-font-display: var(--ms-font-soul)');
    const usos = shell.split('\n').filter((l) => l.includes('var(--ag-font-display)'));
    expect(usos.length).toBeGreaterThan(0);
    // No se fuerza dentro de datos densos ni controles.
    for (const sel of ['.ag-nav-label', '.ag-metric', '.ag-field-input', '.ag-btn-primary']) {
      const i = shell.indexOf(sel);
      if (i === -1) continue;
      const bloque = shell.slice(i, shell.indexOf('}', i));
      expect(bloque, sel).not.toContain('--ag-font-display');
    }
  });

  it('NINGUNA hoja del shell vuelve a Inter ni a DM Sans', () => {
    for (const h of HOJAS_DEL_SHELL) {
      const css = leer(h);
      expect(css, `${h} declara DM Sans`).not.toMatch(/font-family:[^;]*DM Sans/i);
      expect(css, `${h} declara Inter`).not.toMatch(/font-family:[^;]*\bInter\b/i);
    }
  });

  it('el diccionario de tokens ya no nombra DM Sans', () => {
    expect(tokens).not.toMatch(/--ag-font:\s*'DM Sans'/);
  });
});

describe('color: identidad y minimos', () => {
  it('la escala Zinc esta declarada completa', () => {
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(ms, `zinc-${k}`).toContain(`--ms-zinc-${k}:`);
    }
  });

  it('el oro tiene una variante propia para borde y texto', () => {
    // El relleno conserva la funcion de accion; el borde necesita otra
    // luminancia para llegar a 3:1 sobre superficie clara.
    expect(ms).toContain('--ms-gold:');
    expect(ms).toContain('--ms-gold-ink:');
    expect(tokens).toContain('--ag-accent-border: var(--ms-gold-ink)');
  });

  it('los semanticos no son el oro', () => {
    const gold = /#E8B947/i;
    for (const t of ['--ms-ok:', '--ms-bad:', '--ms-warn:']) {
      const linea = ms.split('\n').find((l) => l.includes(t));
      expect(linea, t).toBeTruthy();
      expect(linea, `${t} reusa el oro`).not.toMatch(gold);
    }
  });

  it('el chasis es Zinc en los dos temas: sin superficie clara accidental', () => {
    // Declarado dos veces —claro y oscuro— y siempre al mismo Zinc 950.
    const chassis = tokens.split('\n').filter((l) => l.trim().startsWith('--ag-chassis:'));
    expect(chassis).toHaveLength(2);
    for (const l of chassis) expect(l).toContain('var(--ms-zinc-950)');
    // Y el fondo oscuro nunca es una superficie clara.
    const oscuro = tokens.slice(tokens.indexOf('.ag-theme-dark {'));
    expect(oscuro).toContain('--ag-bg:      var(--ms-zinc-950)');
    expect(oscuro).toContain('--ag-bg-card: var(--ms-zinc-900)');
  });

  it('la topbar deja de ser un fondo dorado extenso', () => {
    expect(shell).toMatch(/\.ag-root \.ag-topbar \{[^}]*background: var\(--ag-chassis\)/);
    const bloque = shell.slice(shell.indexOf('.ag-root .ag-topbar {'));
    expect(bloque.slice(0, bloque.indexOf('}'))).not.toContain('--ag-c-terra');
  });

  it('la seleccion es un rail y no un bloque dorado', () => {
    const i = shell.indexOf('.ag-root .ag-nav-item.active {');
    const bloque = shell.slice(i, shell.indexOf('}', i));
    expect(bloque).toContain('background: transparent');
    expect(shell).toContain('.ag-root .ag-nav-item.active::after');
  });

  it('la tinta sobre el solido de error cambia con el tema', () => {
    // Un valor fijo falla en uno de los dos: blanco da 2.77:1 sobre el rojo
    // del oscuro, y Zinc 950 da 3.04:1 sobre el del claro. Medido.
    const inks = tokens.split('\n').filter((l) => l.trim().startsWith('--ag-bad-ink:'));
    expect(inks).toHaveLength(2);
    expect(inks[0]).toContain('#FFFFFF');
    expect(inks[1]).toContain('var(--ms-zinc-950)');
    expect(shell).toContain('color: var(--ag-bad-ink)');
  });

  it('el foco es oro de 2px dentro del admin', () => {
    const i = shell.indexOf('.ag-root *:focus-visible');
    const bloque = shell.slice(i, shell.indexOf('}', i));
    expect(bloque).toContain('outline: 2px solid var(--ms-gold)');
  });
});

describe('Trace: el tratamiento material', () => {
  it('se controla con tokens, no con valores sueltos', () => {
    for (const t of ['--ms-trace-opacity', '--ms-trace-scale', '--ms-trace-ink']) {
      expect(ms, t).toContain(`${t}:`);
    }
  });

  it('la candidata por defecto es Trace A y las variantes son de revision', () => {
    const linea = ms.split('\n').find((l) => l.includes('--ms-trace-opacity:') && l.includes('0.05'));
    expect(linea, 'la opacidad por defecto deberia ser la de Trace A').toBeTruthy();
    expect(ms).toContain('data-ms-trace="clean"');
    expect(ms).toContain('data-ms-trace="b"');
  });

  it('el patron es determinista: sin imagen de ruido y sin animacion', () => {
    const i = ms.indexOf('.ms-trace::before');
    const bloque = ms.slice(i, ms.indexOf('}', i));
    expect(bloque).toContain('repeating-linear-gradient');
    expect(bloque).not.toMatch(/url\(/);
    expect(bloque).not.toContain('animation');
    expect(ms).not.toMatch(/@keyframes[^{]*trace/i);
  });

  it('la textura no intercepta el puntero ni se pone encima del contenido', () => {
    const i = ms.indexOf('.ms-trace::before');
    const bloque = ms.slice(i, ms.indexOf('}', i));
    expect(bloque).toContain('pointer-events: none');
    expect(bloque).toContain('z-index: -1');
  });

  it('NUNCA se aplica sobre Blue/Volt', () => {
    // Se miran las reglas que APLICAN la textura (su selector nombra
    // `.ms-trace`), no el diccionario de tokens, que declara volt y trace en
    // el mismo bloque por ser la raiz de primitivas.
    const aplican = (css) => css.split('}')
      .filter((r) => /\.ms-trace/.test(r.split('{')[0] || ''));
    for (const h of [...HOJAS_DEL_SHELL]) {
      for (const r of aplican(leer(h))) {
        expect(r, `${h}: textura sobre volt`).not.toMatch(/--ms-volt|#1565C0|#60A5FA/i);
      }
    }
    // Y ninguna superficie que use volt lleva la clase en el markup.
    const jsx = ['src/pages/PlatformAdmin.jsx', 'src/components/admin/platform/NavInferior.jsx'];
    for (const f of jsx) {
      for (const linea of leer(f).split('\n')) {
        if (!linea.includes('ms-trace')) continue;
        expect(linea, `${f}: textura sobre volt`).not.toMatch(/volt/i);
      }
    }
  });

  it('la textura vive en superficies estructurales, no bajo texto', () => {
    // `.ms-trace` se aplica al contenedor y su capa va DETRAS (z-index -1):
    // el texto nunca queda sobre la trama, queda sobre el contenedor.
    expect(shell).not.toMatch(/\.ms-trace[^{]*\{[^}]*color:/);
  });
});

describe('el contrato de Phase 3A sigue en pie', () => {
  it('los tokens de capa no cambiaron de jerarquia', () => {
    const orden = ['--ag-z-content', '--ag-z-sticky', '--ag-z-popover', '--ag-z-dico',
      '--ag-z-backdrop', '--ag-z-modal', '--ag-z-toast'];
    const valores = orden.map((t) => {
      const l = tokens.split('\n').find((x) => x.trim().startsWith(t));
      return Number(String(l).split(':')[1].replace(/[^\d]/g, ''));
    });
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i], `${orden[i]} deberia estar por encima de ${orden[i - 1]}`)
        .toBeGreaterThan(valores[i - 1]);
    }
  });

  it('el shell no reintroduce z-index arbitrarios', () => {
    const crudos = shell.match(/z-index:\s*(\d+)/g) || [];
    for (const z of crudos) {
      const n = Number(z.replace(/\D/g, ''));
      expect(n, `z-index crudo ${n} en admin-shell.css`).toBeLessThanOrEqual(1);
    }
    expect(shell).not.toMatch(/z-index:\s*(9999|99999)/);
  });

  it('The Slot tiene contrato de layout y no flota sobre la navegacion', () => {
    const i = shell.indexOf('.ag-slot {');
    const bloque = shell.slice(i, shell.indexOf('}', i));
    expect(bloque).toContain('z-index: var(--ag-z-content)');
    expect(bloque).not.toMatch(/position:\s*fixed/);
    expect(bloque).toContain('max-height');
  });

  it('el shell respeta reduced motion', () => {
    expect(shell).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
