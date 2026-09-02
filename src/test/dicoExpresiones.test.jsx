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
import { PHYSICAL_POSES } from '../components/dico/vocabulario';

const RAIZ = resolve(__dirname, '..', '..');
const dicoCss = readFileSync(resolve(RAIZ, 'src/components/dico/dico.css'), 'utf8');
const slotCss = readFileSync(resolve(RAIZ, 'src/components/dico/dico-slot.css'), 'utf8');

const FRAMES = ['closed', 'mid', 'open'];

/** Los siete estados canonicos. NO son diez: speaking es un eje aparte. */
const CANONICOS = ['idle', 'processing', 'thinking', 'success', 'worried', 'question', 'error'];

/** Alias legacy que tienen que seguir resolviendo al canonico. */
const ALIAS = { esperando: 'processing', pensando: 'thinking', contento: 'success',
                preocupado: 'worried', pregunta: 'question' };

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

/**
 * Las reglas de `dico.css` que un estado enciende, leidas del CSS.
 *
 * TIRA si no encuentra ninguna. Al renombrar las clases al vocabulario canonico
 * quedaron llamadas con el nombre viejo: devolvian `[]` y las aserciones que
 * preguntan "esto NO deberia estar" pasaban POR VACIO. Un helper que solo sabe
 * devolver nada es la forma mas facil de tener un gate que no mide.
 */
function bloquesDelEstado(estado) {
  const re = new RegExp(`\\.dico--${estado}\\b[^{]*\\{[^}]*\\}`, 'g');
  const encontrado = dicoCss.match(re) || [];
  if (estado !== 'idle' && encontrado.length === 0) {
    throw new Error(`dico.css no tiene reglas para .dico--${estado}: nombre viejo?`);
  }
  return encontrado;
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

  it('thinking y processing no son el mismo estado disfrazado', () => {
    // Razonar y estar trabajando son lecturas distintas. Si solo se
    // diferenciaran por un par de pixeles de ceja, a 36px —el tamanio real en
    // el panel— serian el mismo estado: eso es lo que pasaba y se corrigio.
    // Lo que se lee de lejos es la DIRECCION DE LA MIRADA, no la ceja.
    const thinking = bloquesDelEstado('thinking').join('\n');
    const processing = bloquesDelEstado('processing').join('\n');
    expect(thinking).toContain('dico-boca--reflexiva');
    expect(processing).toContain('dico-boca--proceso');
    expect(thinking).not.toContain('dico-espera-puntos');

    const mirada = (css) => {
      const m = css.match(/dico-pupila-estado\s*\{[^}]*translate\(([^)]*)\)/);
      return m ? m[1].split(',').map(v => parseFloat(v)) : null;
    };
    const t = mirada(thinking);
    const p = mirada(processing);
    expect(t, 'thinking sin mirada propia').not.toBeNull();
    expect(p, 'processing sin mirada propia').not.toBeNull();
    // Thinking se va ARRIBA; processing barre al costado y nivelado.
    expect(t[1], 'thinking deberia mirar hacia arriba').toBeLessThan(-2);
    expect(Math.abs(p[1]), 'processing no deberia mirar arriba').toBeLessThan(1);
    // Y no van para el mismo lado.
    expect(Math.sign(t[0])).not.toBe(Math.sign(p[0]));
  });

  it('los alias legacy resuelven al estado canonico', () => {
    // `DicoAvisos`, `ProductsPanel` y la vitrina siguen pasando los nombres en
    // espaniol. Tienen que funcionar, y lo que llega al DOM tiene que ser el
    // canonico: si sobreviviera una segunda familia de clases, el vocabulario
    // volveria a estar partido en dos.
    for (const [alias, canonico] of Object.entries(ALIAS)) {
      const native = render(React.createElement(DicoCara, { estado: alias, size: 48 }));
      expect(native.container.querySelector(`.dico--${canonico}`), alias).toBeInTheDocument();
      expect(native.container.querySelector(`.dico--${alias}`), `${alias} sobrevive como clase`).toBeNull();
    }
  });

  it('los diez valores visibles son SIETE estados mas un eje de habla', () => {
    // El riesgo que nombra el brief: contar closed/mid/open como emociones y
    // terminar con diez personajes en vez de siete estados y una boca que habla.
    expect(ESTADOS_DICO).toHaveLength(7);
    expect(FRAMES).toHaveLength(3);
    for (const f of FRAMES) expect(ESTADOS_DICO).not.toContain(f);
    expect(ESTADOS_DICO).not.toContain('speaking');
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
    // `worried` es "hay algo que revisar", no un error: no lleva color.
    const worried = bloquesDelEstado('worried').join('\n');
    expect(worried).not.toMatch(/color|stroke:|fill:/);
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

  it('Physical expresa por POSE, no por una cara montada encima', () => {
    // Cambio la modalidad, no el eje: antes Physical recibia un estado facial y
    // se le pintaba `CaraDeTinta` arriba; ahora recibe una de las ocho poses
    // del pack oficial, que ya traen la cara. Sigue sin quedar clavado.
    for (const pose of PHYSICAL_POSES) {
      const { container, unmount } = render(React.createElement(DicoSlot, { estado: 'physical_open', pose }));
      expect(container.querySelector('[data-dico-physical]').dataset.dicoPhysical, pose).toBe(pose);
      expect(container.querySelector('.dico-physical-cara'), `${pose} monta una cara encima`).toBeNull();
      unmount();
    }
  });

  it('Physical ya no queda clavado en idle', () => {
    // Era literalmente `<g className="dico--idle">` en el JSX: Physical no podia
    // expresar nada. Este contrato existe para que no vuelva a pasar.
    const fuente = readFileSync(resolve(RAIZ, 'src/components/dico/DicoSlot.jsx'), 'utf8');
    expect(fuente).not.toMatch(/className="dico--idle"/);
    const { container } = render(React.createElement(DicoSlot, { estado: 'physical_open', pose: 'error' }));
    expect(container.querySelector('[data-dico-physical]').dataset.dicoPhysical).toBe('error');
  });

  it('un valor desconocido cae en el default de cada modalidad', () => {
    const native = render(React.createElement(DicoCara, { estado: 'inventado', size: 48 }));
    expect(native.container.querySelector('.dico--idle')).toBeInTheDocument();
    // Physical no tiene un asset para lo que no existe: cae en `idle` o pediria
    // un archivo que no esta.
    const physical = render(React.createElement(DicoSlot, { estado: 'physical_open', pose: 'inventado' }));
    expect(physical.container.querySelector('[data-dico-physical]').dataset.dicoPhysical).toBe('idle');
  });

  it('Native sigue montando la anatomia de CaraDeTinta en todos los estados', () => {
    for (const estado of CANONICOS) {
      const native = render(React.createElement(DicoCara, { estado, size: 48 }));
      expect(firmaAnatomia(native.container.querySelector('.dico-cara')), `native ${estado}`).toEqual(referencia);
    }
  });

  it('la geometria de Physical se deriva del canvas certificado, no se tantea', () => {
    // Antes esto protegia el encuadre de `CaraDeTinta` sobre el cuerpo 3D: la
    // cara se pintaba 2,28x mas chica y el arreglo tenia que vivir en el marco,
    // no en una segunda anatomia. Con el pack oficial esa correccion no existe
    // —la cara viene renderizada a escala—, pero el riesgo se mudo: que alguien
    // fije el tamanio del escenario a ojo y rompa el encuadre compartido.
    //
    // Se mira el BLOQUE, como antes, y que los valores se DERIVEN.
    const bloque = slotCss.match(/\.dico-slot-stage\s*\{([^}]*)\}/);
    expect(bloque).not.toBeNull();
    const cuerpo = bloque[1];

    for (const v of ['--pose-ancho', '--pose-alto', '--pose-bajo-pies']) {
      expect(cuerpo, `falta ${v}`).toContain(v);
    }
    // El alto sale del aspecto del canvas, no de un numero suelto.
    expect(cuerpo).toContain('1600 / 1136');
    // Sin regex: alcanza con partir por `;` y mirar cada declaracion.
    const declaraciones = cuerpo.split(';').map((d) => d.trim());
    for (const prop of ['width', 'height', 'bottom']) {
      const decl = declaraciones.find((d) => d.startsWith(`${prop}:`));
      expect(decl, `falta ${prop}`).toBeDefined();
      expect(decl, `${prop} con valor fijo en vez de derivado`).toContain('var(--pose-');
    }
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

    // Physical NO tiene eje de habla: los ocho renders son poses, no frames de
    // boca, y simular lipsync esta explicitamente fuera del contrato. Si
    // apareciera un `habla` que cambia el asset, seria eso.
    // Se mira el CODIGO, no la documentacion: el encabezado del componente
    // explica justamente que el eje de habla se fue, y prohibir la palabra
    // castigaria esa explicacion.
    const codigo = readFileSync(resolve(RAIZ, 'src/components/dico/DicoSlot.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(codigo, 'volvio el eje de habla a Physical').not.toContain('habla');
    const physical = render(React.createElement(DicoSlot, {
      estado: 'physical_open', pose: 'error', habla: 'open',
    }));
    expect(physical.container.querySelector('[data-dico-physical]').dataset.dicoPhysical).toBe('error');
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
    expect(bloque).toContain('.dico--processing .dico-espera-puntos');
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
    for (const estado of ['thinking', 'error']) {
      for (const regla of bloquesDelEstado(estado)) {
        for (const m of regla.matchAll(/animation:\s*([^;}]+)/g)) {
          expect(m[1].trim(), `${estado}: ${regla.slice(0, 50)}`).toMatch(/^none\b/);
        }
      }
    }
  });
});
