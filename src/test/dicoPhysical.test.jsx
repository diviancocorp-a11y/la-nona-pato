import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import DicoPhysical, { CRUCE_MS, rutaDePose } from '../components/dico/DicoPhysical';
import { DICO_PHYSICAL_ASSETS, DICO_PHYSICAL_POSES } from '../../platform/brand/dico-3d-assets.mjs';
import { PHYSICAL_POSES } from '../components/dico/vocabulario';

const RAIZ = process.cwd();
const physicalCss = readFileSync(join(RAIZ, 'src/components/dico/physical.css'), 'utf8');

const montar = (props = {}) => render(React.createElement(DicoPhysical, { reducedMotion: false, ...props }));
const capas = (c) => [...c.querySelectorAll('.dico-physical-capa')].map((i) => i.getAttribute('src'));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.useRealTimers());

describe('DicoPhysical — el pack oficial y nada mas', () => {
  it('las rutas derivadas coinciden con el manifiesto certificado', () => {
    // La regla de nombre del componente contra la fuente que valido el
    // validator. Si alguien renombra un asset, esto lo dice antes de que el
    // runtime pida un 404.
    for (const pose of DICO_PHYSICAL_POSES) {
      expect(rutaDePose(pose), pose).toBe(DICO_PHYSICAL_ASSETS[pose].publicPath);
    }
  });

  it('el vocabulario de la app y el manifiesto declaran las MISMAS ocho poses', () => {
    expect([...PHYSICAL_POSES].sort()).toEqual([...DICO_PHYSICAL_POSES].sort());
    expect(PHYSICAL_POSES).toHaveLength(8);
  });

  it('processing y question NO son poses: caen en idle', () => {
    // No existen en el pack. Si el runtime las aceptara, pediria un archivo
    // que no esta y Dico desapareceria.
    for (const inventada of ['processing', 'question', 'esperando', 'pregunta']) {
      const { container, unmount } = montar({ pose: inventada });
      expect(container.querySelector('[data-dico-physical]').dataset.dicoPhysical, inventada).toBe('idle');
      unmount();
    }
  });

  it('las ocho poses cargan su propio asset', () => {
    const vistas = new Set();
    for (const pose of PHYSICAL_POSES) {
      const { container, unmount } = montar({ pose });
      const src = container.querySelector('.dico-physical-capa--actual').getAttribute('src');
      expect(src, pose).toBe(`/brand/dico/physical/${DICO_PHYSICAL_ASSETS[pose].runtime}`);
      vistas.add(src);
      unmount();
    }
    // Ocho archivos distintos: si dos poses compartieran asset, el contrato de
    // "cambiar de pose se ve" pasaria por la razon equivocada.
    expect(vistas.size).toBe(8);
  });

  it('no rasteriza texto ni monta una cara encima del render', () => {
    // Los assets ya traen la cara. Una capa de tinta arriba seria una cara
    // sobre otra cara, y el texto va SIEMPRE en la burbuja.
    const { container } = montar({ pose: 'explain' });
    expect(container.querySelector('.dico-physical-cara')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent.trim()).toBe('');
  });
});

describe('DicoPhysical — el cruce', () => {
  it('conserva la pose anterior mientras entra la nueva, y despues la retira', () => {
    const { container, rerender } = montar({ pose: 'idle' });
    expect(capas(container)).toHaveLength(1);

    rerender(React.createElement(DicoPhysical, { pose: 'success', reducedMotion: false }));
    // Las dos conviven: saliente abajo, entrante encima.
    expect(capas(container)).toEqual([rutaDePose('idle'), rutaDePose('success')]);
    expect(container.querySelector('[data-dico-physical-cruzando]').dataset.dicoPhysicalCruzando).toBe('si');

    // En el navegador esto lo dispara el propio WebP; jsdom no carga imagenes.
    act(() => { container.querySelector('.dico-physical-capa--actual').dispatchEvent(new Event('load')); });
    act(() => { vi.advanceTimersByTime(CRUCE_MS + 40); });
    expect(capas(container)).toEqual([rutaDePose('success')]);
    expect(container.querySelector('[data-dico-physical-cruzando]').dataset.dicoPhysicalCruzando).toBe('no');
  });

  it('la entrante no se revela hasta que el asset cargo', () => {
    // Sin esto, la primera vez que se usa una pose el cruce arranca contra un
    // hueco transparente mientras el navegador la baja.
    const { container, rerender } = montar({ pose: 'idle' });
    rerender(React.createElement(DicoPhysical, { pose: 'worried', reducedMotion: false }));
    const entrante = container.querySelector('.dico-physical-capa--actual');
    expect(entrante.className).not.toContain('dico-physical-capa--lista');

    act(() => { entrante.dispatchEvent(new Event('load')); });
    expect(container.querySelector('.dico-physical-capa--actual').className)
      .toContain('dico-physical-capa--lista');
  });

  it('cambiar ocho veces seguidas deja UNA sola capa', () => {
    // El riesgo real de un cruce con temporizador: que se acumulen capas si los
    // cambios llegan mas rapido que la animacion.
    const { container, rerender } = montar({ pose: 'idle' });
    for (const pose of PHYSICAL_POSES) {
      rerender(React.createElement(DicoPhysical, { pose, reducedMotion: false }));
      act(() => { vi.advanceTimersByTime(20); });
      expect(capas(container).length, `${pose} dejo capas de mas`).toBeLessThanOrEqual(2);
    }
    act(() => { vi.advanceTimersByTime(CRUCE_MS + 1000); });
    expect(capas(container)).toEqual([rutaDePose('error')]);
  });

  it('volver a la misma pose no arranca un cruce', () => {
    const { container, rerender } = montar({ pose: 'thinking' });
    rerender(React.createElement(DicoPhysical, { pose: 'thinking', reducedMotion: false }));
    expect(capas(container)).toHaveLength(1);
  });
});

describe('DicoPhysical — reduced motion', () => {
  it('sustituye la pose de inmediato, sin capa saliente', () => {
    const { container, rerender } = montar({ pose: 'idle', reducedMotion: true });
    rerender(React.createElement(DicoPhysical, { pose: 'error', reducedMotion: true }));
    expect(capas(container)).toEqual([rutaDePose('error')]);
    expect(container.querySelector('[data-dico-physical-cruzando]').dataset.dicoPhysicalCruzando).toBe('no');
  });

  it('el CSS apaga la transicion por clase Y por media query', () => {
    // Por clase para el override explicito, por media query para el caso en que
    // nadie pase la prop. Si solo estuviera la clase, un montaje sin prop
    // animaria igual.
    expect(physicalCss).toContain('.dico-physical--sin-cruce');
    const bloque = physicalCss.slice(physicalCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloque).toContain('transition: none');
  });
});

describe('DicoPhysical — geometria', () => {
  it('las dos capas comparten caja y no participan del layout', () => {
    // Es lo que hace imposible el reflow y el salto entre poses.
    const capa = physicalCss.match(/\.dico-physical-capa \{([^}]*)\}/)[1];
    expect(capa).toContain('position: absolute');
    expect(capa).toContain('inset: 0');
    expect(capa).toContain('object-fit: contain');
  });

  it('el aspecto sale del canvas certificado, no de un numero suelto', () => {
    const caja = physicalCss.match(/\.dico-physical \{([^}]*)\}/)[1];
    expect(caja).toContain('aspect-ratio: 1600 / 1136');
  });

  it('declara las dimensiones intrinsecas para que el navegador reserve la caja', () => {
    const { container } = montar({ pose: 'idle' });
    const img = container.querySelector('.dico-physical-capa--actual');
    expect(img.getAttribute('width')).toBe('1600');
    expect(img.getAttribute('height')).toBe('1136');
  });

  it('NO hay microtraslacion: medido, no hay discontinuidad que compensar', () => {
    // Las ocho comparten canvas, centro y diametro. Mover el personaje entre
    // poses seria agregar movimiento decorativo, no arreglar continuidad.
    expect(physicalCss).not.toContain('translate');
    expect(physicalCss).not.toMatch(/\.dico-physical-capa[^{]*\{[^}]*transform:/);
  });
});
