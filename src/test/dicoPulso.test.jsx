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

  it('el centro es parametrizable: el arte no esta centrado en la caja', () => {
    // Medido sobre los assets finales de Dico 2D: el personaje ocupa el 78,8%
    // del canvas y su centro cae en 49,90 / 48,05. Con cx/cy clavados en 50 el
    // pulso quedaba descentrado respecto del aro azul.
    const { container } = render(React.createElement(DicoPulso, {
      activity: 'processing', cx: 49.9, cy: 48.05, radio: 26.4,
    }));
    const svg = container.querySelector('.dico-pulso');
    for (const sel of ['.dico-pulso-aro', '.dico-pulso-estela', '.dico-pulso-punta']) {
      const c = svg.querySelector(sel);
      expect(c.getAttribute('cx'), sel).toBe('49.9');
      expect(c.getAttribute('cy'), sel).toBe('48.05');
      expect(c.getAttribute('r'), sel).toBe('26.4');
    }
    // El giro tiene que rotar alrededor del centro real, no del 50% de la caja.
    expect(svg.style.getPropertyValue('--dico-pulso-origen')).toBe('49.9% 48.05%');
    expect(svg.querySelector('.dico-pulso-punta').getAttribute('transform'))
      .toContain('49.9 48.05');
  });

  it('sobre el arte final NUNCA repinta el aro: eso seria recolorear el PNG', () => {
    // El aro base solo se dibuja donde no hay arte debajo. Si `idle` o `active`
    // lo encendieran igual, el overlay estaria pintando encima del aro del
    // asset con otro color, que es exactamente lo prohibido: el arte manda.
    for (const modo of ACTIVITIES) {
      const re = new RegExp(`\\.dico-pulso--${modo} \\.dico-pulso-aro\\s*\\{`);
      expect(pulsoCss, `${modo} enciende el aro base`).not.toMatch(re);
    }
    // Fuera del bloque de reduced motion, el aro base solo aparece con --con-aro.
    // Se quitan los comentarios primero: sin eso el regex arrastra el bloque de
    // texto anterior y ninguna regla parece empezar por su propio selector.
    const sinComentarios = pulsoCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const sinReduce = sinComentarios.split('@media (prefers-reduced-motion')[0];
    const reglasAro = [...sinReduce.matchAll(/([^{}]*)\.dico-pulso-aro\s*\{/g)].map(m => m[0]);
    for (const r of reglasAro) {
      const esBase = r.trim().startsWith('.dico-pulso-aro');
      expect(esBase || r.includes('--con-aro'), `regla suelta sobre el aro: ${r.slice(-60)}`).toBe(true);
    }
  });

  it('idle y active senializan con Volt encima, no repintando', () => {
    for (const modo of ['idle', 'active']) {
      const re = new RegExp(`\\.dico-pulso--${modo} \\.dico-pulso-brillo\\s*\\{[^}]*\\}`);
      expect(pulsoCss, `${modo} sin brillo Volt`).toMatch(re);
    }
    const brillo = pulsoCss.match(/\.dico-pulso-brillo\s*\{([^}]*)\}/)[1];
    expect(brillo).toContain('var(--dico-blue-volt)');
    expect(brillo).not.toContain('-base');
  });

  it('los tokens se nombran por SOPORTE, no por jerarquia', () => {
    // "Blue Base" es una familia de material, no un RGB unico: cada soporte
    // rinde el mismo azul distinto. Un token llamado `--dico-blue-base` a
    // secas obligaria a elegir cual de los tres es "el" base, y de ahi a
    // recolorear PNGs para que coincidan hay un paso.
    expect(pulsoCss, 'volvio el token sin soporte').not.toMatch(/--dico-blue-base\s*:/);
    for (const token of ['--dico-blue-2d-base', '--dico-blue-3d-base', '--dico-blue-flat', '--dico-blue-volt']) {
      expect(pulsoCss, `falta ${token}`).toContain(`${token}:`);
    }
    // Y cada uno copia lo MEDIDO sobre su soporte.
    const valor = (t) => pulsoCss.match(new RegExp(`${t}:\\s*(#[0-9a-fA-F]{6});`))[1].toUpperCase();
    expect(valor('--dico-blue-2d-base')).toBe('#192B6C');
    expect(valor('--dico-blue-3d-base')).toBe('#2A3369');
    expect(valor('--dico-blue-flat')).toBe('#0957E6');
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

describe('B6R — DicoPulso: Volt es el sistematico', () => {
  const LUM = (hex) => {
    const v = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const valor = (t) => pulsoCss.match(new RegExp(`${t}:\\s*(#[0-9a-fA-F]{6});`))[1];
  const contraste = (a, b) => {
    const [x, y] = [LUM(a), LUM(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it('el Volt se lee sobre TODOS los bases de soporte, no solo sobre uno', () => {
    // Esta es la propiedad que hace a Volt sistematico: la senial tiene que
    // funcionar igual sobre el 2D y sobre el 3D, que fisicamente NO son el
    // mismo azul. Si algun dia un base se aclara, este contrato lo frena
    // antes de que el pulso desaparezca sobre ese soporte.
    const volt = valor('--dico-blue-volt');
    for (const soporte of ['--dico-blue-2d-base', '--dico-blue-3d-base']) {
      const base = valor(soporte);
      expect(LUM(base), `${soporte} no es mas oscuro que el Volt`).toBeLessThan(LUM(volt));
      expect(contraste(base, volt), `${soporte} contra Volt`).toBeGreaterThan(2);
    }
  });

  it('el aro plano NO alcanza como base, y por eso no lo es', () => {
    // 1,35:1 contra el Volt. Queda documentado justamente para que nadie lo
    // use de base creyendo que es "el azul de la marca".
    const cr = contraste(valor('--dico-blue-flat'), valor('--dico-blue-volt'));
    expect(cr).toBeLessThan(2);
    expect(pulsoCss).not.toMatch(/stroke:\s*var\(--dico-blue-flat\)/);
  });

  it('el pulso pinta con Volt; el track lo pone el arte', () => {
    // El aro base es lo unico que puede usar un color de soporte, y solo
    // donde no hay arte debajo. Todo lo demas que dibuja el pulso es Volt.
    const trazos = [...pulsoCss.matchAll(/\.dico-pulso-(\w+)\s*\{([^}]*)\}/g)]
      .filter(([, , cuerpo]) => cuerpo.includes('stroke:'));
    for (const [, parte, cuerpo] of trazos) {
      const usaVolt = cuerpo.includes('--dico-blue-volt');
      const esAro = parte === 'aro';
      expect(usaVolt || esAro, `.dico-pulso-${parte} no pinta con Volt`).toBe(true);
    }
    // Y el aro base es parametrizable por soporte, con el 2D como default.
    expect(pulsoCss).toMatch(/var\(--dico-pulso-base,\s*var\(--dico-blue-2d-base\)\)/);
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
