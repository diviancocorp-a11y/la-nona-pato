import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DicoNative from '../components/dico/DicoNative';
import { NATIVE_STATES } from '../components/dico/vocabulario';

const montar = (props = {}) => render(React.createElement(DicoNative, props));

/** Todo lo que define la geometria del render, junto. */
function geometria(container) {
  const img = container.querySelector('.dico-native-arte');
  const punta = container.querySelector('.dico-pulso-punta');
  const svg = container.querySelector('.dico-pulso');
  return {
    ancho: img.getAttribute('width'),
    alto: img.getAttribute('height'),
    caja: container.querySelector('.dico-native-caja').className,
    viewBox: svg.getAttribute('viewBox'),
    cx: punta.getAttribute('cx'),
    cy: punta.getAttribute('cy'),
    r: punta.getAttribute('r'),
    grosor: punta.getAttribute('stroke-width'),
  };
}

describe('DicoNative', () => {
  it('los siete estados intercambian el asset y NADA mas', () => {
    // Es la propiedad que hace que cambiar de cara no sea un salto visual: el
    // unico atributo que puede variar entre estados es el `src`.
    const vistos = new Set();
    let referencia = null;

    for (const estado of NATIVE_STATES) {
      const { container, unmount } = montar({ state: estado });
      const img = container.querySelector('.dico-native-arte');
      expect(img.getAttribute('src')).toBe(`/brand/dico/dico-2d-${estado}.png`);
      vistos.add(img.getAttribute('src'));

      const geo = geometria(container);
      if (referencia === null) referencia = geo;
      else expect(geo, `${estado} movio la geometria`).toEqual(referencia);
      unmount();
    }

    // Siete assets distintos: si dos estados apuntaran al mismo archivo, la
    // igualdad de geometria de arriba pasaria por la razon equivocada.
    expect(vistos.size).toBe(NATIVE_STATES.length);
  });

  it('la actividad cambia el pulso sin tocar la geometria', () => {
    const base = montar({ state: 'neutral', activity: 'idle' });
    const conPulso = montar({ state: 'neutral', activity: 'processing' });
    expect(geometria(conPulso.container)).toEqual(geometria(base.container));
    expect(conPulso.container.querySelector('[data-dico-pulso]'))
      .toHaveAttribute('data-dico-pulso', 'processing');
  });

  it('un estado desconocido cae en neutral en vez de pedir un PNG que no existe', () => {
    const { container } = montar({ state: 'inventado' });
    expect(container.querySelector('.dico-native-arte').getAttribute('src'))
      .toBe('/brand/dico/dico-2d-neutral.png');
  });

  it('sin onClick es presencia, con onClick es control', () => {
    const quieto = montar({ state: 'neutral' });
    expect(quieto.container.querySelector('button')).toBeNull();
    expect(quieto.container.querySelector('[role="img"]')).toBeInTheDocument();
    quieto.unmount();

    const onClick = vi.fn();
    montar({ state: 'neutral', onClick, title: 'Traer a Dico' });
    fireEvent.click(screen.getByRole('button', { name: 'Traer a Dico' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('el tamanio visual no arrastra al area clickeable', () => {
    // El area minima de 44 la pone el CSS del boton; el `size` solo mide el
    // personaje. Si el componente los atara, achicar a Dico romperia el touch.
    const { container } = montar({ state: 'neutral', size: 32, onClick: () => {} });
    const boton = container.querySelector('button');
    expect(boton.style.getPropertyValue('--dico-native-size')).toBe('32px');
    expect(boton.className).toContain('dico-native--boton');
    expect(container.querySelector('.dico-native-arte').getAttribute('width')).toBe('32');
  });
});
