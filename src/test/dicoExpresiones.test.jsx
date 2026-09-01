/**
 * Vocabulario facial canonico (Stage B6).
 *
 * Dico tiene siete estados emocionales y tres frames de habla, y las dos
 * modalidades —Native y Physical— hablan el MISMO vocabulario sobre la misma
 * `CaraDeTinta`. Estos contratos cuidan tres cosas que se rompen solas:
 *
 *   1. que un estado nuevo no traiga una anatomia paralela;
 *   2. que `error` no dependa del color para significar error;
 *   3. que Physical no vuelva a quedar clavado en un solo estado, que es como
 *      estaba antes de este lote.
 *
 * NO se congela el SVG entero como snapshot: un snapshot gigante falla ante
 * cualquier reacomodo de paths y no dice nada sobre el significado. Se afirma
 * lo que cada estado tiene que lograr.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import CaraDeTinta from '../components/dico/CaraDeTinta';
import DicoCara, { ESTADOS_DICO } from '../components/dico/DicoCara';
import DicoSlot from '../components/dico/DicoSlot';

const RAIZ = resolve(__dirname, '..', '..');
const dicoCss = readFileSync(resolve(RAIZ, 'src/components/dico/dico.css'), 'utf8');
const slotCss = readFileSync(resolve(RAIZ, 'src/components/dico/dico-slot.css'), 'utf8');

const FRAMES = ['closed', 'mid', 'open'];

/** Los siete estados del vocabulario, en el idioma del codigo. */
const CANONICOS = ['idle', 'esperando', 'pensando', 'contento', 'preocupado', 'pregunta', 'error'];

/** Firma de la anatomia: atributos internos del viewBox, independientes de escala. */
function firmaAnatomia(raiz) {
  const cara = raiz.querySelector('.dico-tinta-cara');
  if (!cara) return null;
  return [...cara.querySelectorAll('*')].map(el => [
    el.tagName, el.getAttribute('class') || '', el.getAttribute('d') || '',
    el.getAttribute('cx') || '', el.getAttribute('cy') || '',
    el.getAttribute('rx') || '', el.getAttribute('ry') || '', el.getAttribute('r') || '',
  ].join('|'));
}

/** Las reglas de `dico.css` que un estado enciende, leidas del CSS. */
function bloquesDelEstado(estado) {
  const re = new RegExp(`\\.dico--${estado}\\b[^{]*\\{[^}]*\\}`, 'g');
  return dicoCss.match(re) || [];
}

describe('B6 — el vocabulario canonico esta completo', () => {
  it('declara los siete estados y no inventa un octavo', () => {
    expect([...ESTADOS_DICO].sort()).toEqual([...CANONICOS].sort());
  });

  it('cada estado renderiza y aplica su propia clase', () => {
    for (const estado of CANONICOS) {
      const { container } = render(React.createElement(DicoCara, { estado, size: 48 }));
      expect(container.querySelector(`.dico--${estado}`), estado).toBeInTheDocument();
      expect(container.querySelector('.dico-tinta-cara'), estado).toBeInTheDocument();
    }
  });

  it('cada estado cambia algo de la cara: ninguno es un alias vacio', () => {
    for (const estado of CANONICOS) {
      if (estado === 'idle') continue; // idle ES la referencia neutral
      const reglas = bloquesDelEstado(estado).join('\n');
      expect(reglas.length, `${estado} no tiene reglas propias`).toBeGreaterThan(0);
      // Al menos una pieza facial —boca, ceja, pupila, parpado u ojo— se mueve.
      expect(reglas, estado).toMatch(/dico-(boca|ceja|pupila|parpado|ojo)/);
    }
  });

  it('pensando y esperando no son el mismo estado disfrazado', () => {
    // Razonar y estar trabajando son lecturas distintas: si las dos encendieran
    // la misma boca, el vocabulario tendria seis estados y no siete.
    const pensando = bloquesDelEstado('pensando').join('\n');
    const esperando = bloquesDelEstado('esperando').join('\n');
    expect(pensando).toContain('dico-boca--reflexiva');
    expect(esperando).toContain('dico-boca--pensando');
    expect(pensando).not.toContain('dico-espera-puntos');
  });
});

describe('B6 — error significa error sin depender del color', () => {
  it('usa una FORMA como senial, no solo tinta roja', () => {
    const { container } = render(React.createElement(DicoCara, { estado: 'error', size: 48 }));
    // Dos X, una por ojo: se leen igual en escala de grises o sin percibir rojo.
    const equis = container.querySelectorAll('.dico-ojo-x');
    expect(equis).toHaveLength(2);
    for (const x of equis) expect(x.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('.dico-boca--error')).toBeInTheDocument();
  });

  it('el rojo entra como acento y no tinie la cara entera', () => {
    // Si el rojo se aplicara al grupo de la cara, `error` seria "Dico muerto"
    // en vez de "Dico avisando". Solo la X lo lleva.
    const reglasRojas = dicoCss.match(/[^}]*var\(--ms-bad[^}]*\}/g) || [];
    expect(reglasRojas.length).toBeGreaterThan(0);
    for (const regla of reglasRojas) {
      expect(regla).toContain('dico-ojo-x');
      expect(regla).not.toMatch(/\.dico-tinta-cara|\.dico-cara\b|\.dico-boca\b/);
    }
  });

  it('no usa amarillo semantico para warning ni introduce paleta nueva', () => {
    // `preocupado` es "hay algo que revisar", no un error: no lleva color.
    const preocupado = bloquesDelEstado('preocupado').join('\n');
    expect(preocupado).not.toMatch(/color|stroke:|fill:/);
    // El unico token de color semantico de la cara es el rojo de error.
    const tokens = [...dicoCss.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]);
    expect([...new Set(tokens)].filter(t => t.startsWith('--ms-') || t.startsWith('--ag-')))
      .toEqual(['--ms-bad']);
  });
});

describe('B6 — Native y Physical hablan el mismo vocabulario', () => {
  const referencia = firmaAnatomia(
    render(React.createElement('svg', { viewBox: '0 0 120 120' }, React.createElement(CaraDeTinta))).container,
  );

  it('Physical acepta los mismos estados que Native', () => {
    for (const estado of CANONICOS) {
      const { container } = render(React.createElement(DicoSlot, { estado: 'physical_open', cara: estado }));
      expect(container.querySelector(`.dico-physical-cara .dico--${estado}`), estado).toBeInTheDocument();
    }
  });

  it('Physical ya no queda clavado en idle', () => {
    // Era literalmente `<g className="dico--idle">` en el JSX: Physical no podia
    // expresar nada. Este contrato existe para que no vuelva a pasar.
    const fuente = readFileSync(resolve(RAIZ, 'src/components/dico/DicoSlot.jsx'), 'utf8');
    expect(fuente).not.toMatch(/className="dico--idle"/);
    const { container } = render(React.createElement(DicoSlot, { estado: 'physical_open', cara: 'error' }));
    expect(container.querySelector('.dico--idle')).not.toBeInTheDocument();
  });

  it('un estado desconocido cae en idle en las dos modalidades', () => {
    const native = render(React.createElement(DicoCara, { estado: 'inventado', size: 48 }));
    expect(native.container.querySelector('.dico--idle')).toBeInTheDocument();
    const physical = render(React.createElement(DicoSlot, { estado: 'physical_open', cara: 'inventado' }));
    expect(physical.container.querySelector('.dico-physical-cara .dico--idle')).toBeInTheDocument();
  });

  it('las dos siguen montando la anatomia de CaraDeTinta, en todos los estados', () => {
    for (const estado of CANONICOS) {
      const native = render(React.createElement(DicoCara, { estado, size: 48 }));
      const physical = render(React.createElement(DicoSlot, { estado: 'physical_open', cara: estado }));
      expect(firmaAnatomia(native.container.querySelector('.dico-cara')), `native ${estado}`).toEqual(referencia);
      expect(firmaAnatomia(physical.container.querySelector('.dico-physical-cara')), `physical ${estado}`).toEqual(referencia);
    }
  });

  it('la correccion de proporcion vive en el marco, no en una segunda anatomia', () => {
    // El encuadre de Physical se corrige por CSS sobre `.dico-physical-cara`.
    // Si alguien lo "arreglara" duplicando geometria, la firma de arriba dejaria
    // de coincidir; esto ademas fija donde tiene que estar la correccion.
    expect(slotCss).toMatch(/--dico-cara-ancho/);
    expect(slotCss).toMatch(/--dico-cara-cx/);
    expect(slotCss).toMatch(/--dico-cara-cy/);
  });
});

describe('B6 — habla es una dimension aparte del estado', () => {
  it('conserva los tres frames closed/mid/open', () => {
    for (const frame of FRAMES) {
      const { container } = render(React.createElement(DicoCara, { estado: 'idle', speakingFrame: frame, size: 48 }));
      expect(container.querySelector(`.dico--habla-${frame}`), frame).toBeInTheDocument();
    }
    expect(dicoCss).toContain('dico-boca--habla-cerrada');
    expect(dicoCss).toContain('dico-boca--habla-media');
    expect(dicoCss).toContain('dico-boca--habla-abierta');
  });

  it('se combina con un estado emocional sin crear otra maquina', () => {
    // `estado="error"` + `habla="open"`: la X sigue en los ojos y la boca la
    // toma el frame de habla. Son dos ejes, no ocho personajes.
    const { container } = render(React.createElement(DicoCara, {
      estado: 'error', speakingFrame: 'open', size: 48,
    }));
    const raiz = container.querySelector('.dico');
    expect(raiz).toHaveClass('dico--error');
    expect(raiz).toHaveClass('dico--habla-open');

    const physical = render(React.createElement(DicoSlot, {
      estado: 'physical_open', cara: 'error', habla: 'open',
    }));
    const capa = physical.container.querySelector('.dico-physical-cara > g');
    expect(capa.className.baseVal).toContain('dico--error');
    expect(capa.className.baseVal).toContain('dico--habla-open');
  });

  it('un frame desconocido no ensucia las clases', () => {
    const { container } = render(React.createElement(DicoCara, { estado: 'idle', speakingFrame: 'gritando', size: 48 }));
    expect(container.querySelector('.dico').className).not.toContain('dico--habla-');
  });
});

describe('B6 — reduced motion conserva el significado', () => {
  it('neutraliza el movimiento tambien dentro de la cara de Physical', () => {
    // La cara de Physical NO cuelga de `.dico`, asi que el neutralizador
    // historico (`.dico *`) no la alcanzaba y el parpadeo seguia corriendo.
    const bloque = dicoCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\}/);
    expect(bloque).not.toBeNull();
    expect(bloque[0]).toContain('.dico-physical-cara *');
    expect(bloque[0]).toContain('animation: none !important');
  });

  it('no apaga los estados: solo el movimiento', () => {
    const bloque = dicoCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\}/)[0];
    // Los puntos animan su opacidad; sin la fijacion quedarian invisibles.
    expect(bloque).toContain('.dico--esperando .dico-espera-puntos');
    expect(bloque).toContain('opacity: 1');
    // Nada dentro del bloque esconde una expresion.
    expect(bloque).not.toMatch(/display:\s*none/);
  });

  it('ningun estado nuevo depende de una animacion para significar', () => {
    // Si `error` o `pensando` necesitaran moverse para leerse, con reduced
    // motion dejarian de comunicar. Sus reglas son transformaciones y opacidad
    // estaticas, sin `animation`.
    // Se lee el VALOR de cada declaracion en vez de negar con un lookahead:
    // `/animation:\s*(?!none)/` parece decir "que no sea none" y no lo dice —
    // `\s*` retrocede hasta una posicion donde el lookahead pasa, asi que la
    // regla `animation: none` tambien matcheaba.
    for (const estado of ['pensando', 'error']) {
      for (const regla of bloquesDelEstado(estado)) {
        for (const m of regla.matchAll(/animation:\s*([^;}]+)/g)) {
          expect(m[1].trim(), `${estado}: ${regla.slice(0, 50)}`).toMatch(/^none\b/);
        }
      }
    }
  });
});
