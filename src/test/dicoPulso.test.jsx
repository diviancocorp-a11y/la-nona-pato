/**
 * Contratos de B6R.2A — vocabularios y pulso Volt.
 *
 * Dos cosas que este lote tiene que dejar cerradas antes de que lleguen los
 * assets finales:
 *
 *   1. que los tres ejes sean INDEPENDIENTES y no vuelvan a colapsar en uno;
 *   2. que el pulso sea una capa de motion que no toca layout ni Gold.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DicoPulso from '../components/dico/DicoPulso';
import {
  ACTIVITIES, NATIVE_STATES, PHYSICAL_POSES,
  ALIAS_ACTIVITY, ALIAS_NATIVE_STATE, ALIAS_PHYSICAL_POSE,
  LEGACY_NO_ES_EXPRESION,
  activityCanonica, nativeStateCanonico, physicalPoseCanonica,
} from '../components/dico/vocabulario';

const RAIZ = resolve(__dirname, '..', '..');
const pulsoCss = readFileSync(resolve(RAIZ, 'src/components/dico/pulso.css'), 'utf8');

describe('B6R — los tres ejes son independientes', () => {
  it('declara los tres vocabularios completos', () => {
    expect(NATIVE_STATES).toEqual(
      ['neutral', 'curious', 'happy', 'celebrate', 'alert', 'concerned', 'question']);
    expect(PHYSICAL_POSES).toEqual(
      ['idle', 'explain', 'pointDown', 'pointUp', 'thinking', 'worried', 'success', 'error']);
    expect(ACTIVITIES).toEqual(
      ['idle', 'active', 'processing', 'thinking', 'attention']);
  });

  it('NO existe un vocabulario unico: los ejes no son el mismo conjunto', () => {
    // El brief lo pide explicitamente. Si alguien "unificara" para simplificar,
    // volveria el problema que este lote resuelve.
    expect(new Set(NATIVE_STATES)).not.toEqual(new Set(PHYSICAL_POSES));
    expect(new Set(NATIVE_STATES)).not.toEqual(new Set(ACTIVITIES));
    expect(new Set(PHYSICAL_POSES)).not.toEqual(new Set(ACTIVITIES));
  });

  it('`processing` no es una expresion facial y `explain` no es una actividad', () => {
    // Las dos confusiones concretas que hubo. `processing` vivia en la lista de
    // caras; `explain`/`point*` son cuerpo y no tienen cara equivalente.
    expect(NATIVE_STATES).not.toContain('processing');
    expect(NATIVE_STATES).not.toContain('thinking');
    expect(ACTIVITIES).not.toContain('explain');
    expect(ACTIVITIES).not.toContain('pointDown');
    expect(NATIVE_STATES).not.toContain('pointDown');
  });

  it('documenta que los estados viejos de proceso NO migran a nativeState', () => {
    for (const [viejo, eje] of Object.entries(LEGACY_NO_ES_EXPRESION)) {
      expect(eje).toBe('activity');
      expect(NATIVE_STATES, `${viejo} no deberia ser una cara`).not.toContain(viejo);
    }
  });

  it('cada alias resuelve a un valor real de SU eje', () => {
    for (const [alias, canon] of Object.entries(ALIAS_NATIVE_STATE)) {
      expect(NATIVE_STATES, alias).toContain(canon);
      expect(nativeStateCanonico(alias)).toBe(canon);
    }
    for (const [alias, canon] of Object.entries(ALIAS_PHYSICAL_POSE)) {
      expect(PHYSICAL_POSES, alias).toContain(canon);
      expect(physicalPoseCanonica(alias)).toBe(canon);
    }
    for (const [alias, canon] of Object.entries(ALIAS_ACTIVITY)) {
      expect(ACTIVITIES, alias).toContain(canon);
      expect(activityCanonica(alias)).toBe(canon);
    }
  });

  it('un valor desconocido cae en el neutro de su eje, no explota', () => {
    expect(nativeStateCanonico('inventado')).toBe('neutral');
    expect(physicalPoseCanonica('inventado')).toBe('idle');
    expect(activityCanonica('inventado')).toBe('idle');
    expect(activityCanonica(undefined)).toBe('idle');
  });

  it('un mismo nombre en dos ejes NO se contamina entre ejes', () => {
    // `thinking` existe como pose 3D Y como actividad. Son cosas distintas y
    // cada resolutor tiene que quedarse en su eje.
    expect(physicalPoseCanonica('thinking')).toBe('thinking');
    expect(activityCanonica('thinking')).toBe('thinking');
    expect(nativeStateCanonico('thinking')).toBe('neutral'); // no es una cara
    // `error` es pose 3D; en 2D la cara equivalente es `alert`.
    expect(physicalPoseCanonica('error')).toBe('error');
    expect(nativeStateCanonico('error')).toBe('alert');
  });
});

describe('B6R — DicoPulso: los cinco modos', () => {
  it('renderiza los cinco y marca el modo en el DOM', () => {
    for (const modo of ACTIVITIES) {
      const { container } = render(React.createElement(DicoPulso, { activity: modo }));
      const svg = container.querySelector('.dico-pulso');
      expect(svg, modo).toBeInTheDocument();
      expect(svg.getAttribute('data-dico-pulso')).toBe(modo);
      expect(svg).toHaveClass(`dico-pulso--${modo}`);
    }
  });

  it('cada modo tiene reglas propias en el CSS: ninguno es un alias vacio', () => {
    for (const modo of ACTIVITIES) {
      const re = new RegExp(`\\.dico-pulso--${modo}\\b[^{]*\\{[^}]*\\}`, 'g');
      const reglas = pulsoCss.match(re) || [];
      expect(reglas.length, `${modo} sin reglas propias`).toBeGreaterThan(0);
    }
  });

  it('idle y active NO recorren; processing, thinking y attention si', () => {
    // El recorrido significa trabajo. Si `idle` girara, el sistema estaria
    // diciendo que hace algo cuando no hace nada.
    const giro = (modo) => {
      const re = new RegExp(`\\.dico-pulso--${modo} \\.dico-pulso-giro\\s*\\{[^}]*\\}`);
      const m = pulsoCss.match(re);
      return m ? m[0] : null;
    };
    expect(giro('idle')).toBeNull();
    expect(giro('active')).toBeNull();
    for (const modo of ['processing', 'thinking', 'attention']) {
      expect(giro(modo), modo).toContain('dico-pulso-vuelta');
    }
  });

  it('attention es FINITA: es un aviso, no un loop', () => {
    const m = pulsoCss.match(/\.dico-pulso--attention \.dico-pulso-giro\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toContain('infinite');
    // Dos vueltas y para.
    expect(m[1]).toMatch(/\)\s+2\s+both/);
  });

  it('thinking recorre mas lento que processing', () => {
    const dur = (modo) => {
      const m = pulsoCss.match(new RegExp(`\\.dico-pulso--${modo} \\.dico-pulso-giro\\s*\\{([^}]*)\\}`));
      const c = m[1].match(/var\(--dico-pulso-vuelta\)\s*\*\s*([\d.]+)/);
      return c ? parseFloat(c[1]) : 1;
    };
    expect(dur('thinking')).toBeGreaterThan(dur('processing'));
  });

  it('no altera el layout: la capa esta fuera del flujo', () => {
    const base = pulsoCss.match(/\.dico-pulso\s*\{([^}]*)\}/)[1];
    expect(base).toContain('position: absolute');
    expect(base).toContain('inset: 0');
    expect(base).toContain('pointer-events: none');
  });

  it('no toca el Gold: solo pinta azul', () => {
    // El overlay dibuja el aro y la senial. Si apareciera un fill o un filtro
    // sobre la moneda, dejaria de ser una capa separada del asset.
    expect(pulsoCss).not.toMatch(/#[eE]0[aA][cC]3[cC]/);
    expect(pulsoCss).not.toMatch(/filter:\s*(?!none)/);
    const colores = [...pulsoCss.matchAll(/(?:stroke|fill|background):\s*([^;]+);/g)].map(m => m[1].trim());
    for (const c of colores) {
      expect(c, `color no azul: ${c}`).toMatch(/none|var\(--dico-blue-|color-mix\(in srgb, var\(--dico-blue-/);
    }
  });

  it('la circunferencia, el grosor y la intensidad son parametrizables', () => {
    const { container } = render(React.createElement(DicoPulso, {
      activity: 'processing', radio: 30, grosor: 3, intensidad: 0.5,
    }));
    const svg = container.querySelector('.dico-pulso');
    expect(svg.style.getPropertyValue('--dico-pulso-radio')).toBe('30');
    expect(svg.style.getPropertyValue('--dico-pulso-grosor')).toBe('3');
    expect(svg.style.getPropertyValue('--dico-pulso-intensidad')).toBe('0.5');
    expect(svg.querySelector('.dico-pulso-punta').getAttribute('r')).toBe('30');
  });

  it('el aro base es opcional: sobre arte final no se redibuja', () => {
    const sin = render(React.createElement(DicoPulso, { activity: 'idle' }));
    expect(sin.container.querySelector('.dico-pulso')).not.toHaveClass('dico-pulso--con-aro');
    const con = render(React.createElement(DicoPulso, { activity: 'idle', aro: true }));
    expect(con.container.querySelector('.dico-pulso')).toHaveClass('dico-pulso--con-aro');
  });

  it('es decorativo para lectores de pantalla', () => {
    const { container } = render(React.createElement(DicoPulso, { activity: 'attention' }));
    const svg = container.querySelector('.dico-pulso');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });
});

describe('B6R — DicoPulso: Blue Base vs Volt', () => {
  it('separa los dos tokens y no los confunde', () => {
    expect(pulsoCss).toContain('--dico-blue-base');
    expect(pulsoCss).toContain('--dico-blue-volt');
    const base = pulsoCss.match(/--dico-blue-base:\s*([^;]+);/)[1].trim();
    const volt = pulsoCss.match(/--dico-blue-volt:\s*([^;]+);/)[1].trim();
    expect(base.toLowerCase()).not.toBe(volt.toLowerCase());
  });

  it('la base es mas oscura que el Volt, o el pulso no se ve', () => {
    const lum = (hex) => {
      const v = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
      const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const base = pulsoCss.match(/--dico-blue-base:\s*(#[0-9a-fA-F]{6});/)[1];
    const volt = pulsoCss.match(/--dico-blue-volt:\s*(#[0-9a-fA-F]{6});/)[1];
    expect(lum(base)).toBeLessThan(lum(volt));
    // Medido sobre el arte: el par elegido da 2,67:1. Por debajo de 2 la senial
    // se pierde sobre su propio aro.
    const cr = (lum(volt) + 0.05) / (lum(base) + 0.05);
    expect(cr).toBeGreaterThan(2);
  });

  it('el aro plano del isologo queda documentado y NO se usa como base', () => {
    // #0957E6 es el aro vectorial del isologo. Contra el Volt da 1,35:1: si se
    // usara como base, el pulso seria invisible.
    expect(pulsoCss).toContain('--dico-blue-flat');
    const base = pulsoCss.match(/--dico-blue-base:\s*(#[0-9a-fA-F]{6});/)[1];
    expect(base.toLowerCase()).not.toBe('#0957e6');
  });
});

describe('B6R — DicoPulso: reduced motion', () => {
  const bloque = pulsoCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\}\s*$/)[0];

  it('apaga el recorrido', () => {
    expect(bloque).toContain('.dico-pulso-giro');
    expect(bloque).toContain('animation: none !important');
  });

  it('conserva el significado: los cinco modos siguen siendo distinguibles', () => {
    // Si reduced motion dejara a todos iguales, el usuario perderia informacion,
    // no solo movimiento.
    for (const modo of ACTIVITIES) {
      expect(bloque, `${modo} sin forma estatica propia`).toContain(`.dico-pulso--${modo}`);
    }
  });

  it('no esconde nada con display none', () => {
    expect(bloque).not.toMatch(/display:\s*none/);
  });
});
