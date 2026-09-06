import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DicoAvisos from '../components/admin/platform/DicoAvisos';

const prod = (over = {}) => ({
  id: 'p1', name: 'Milanesa', price: 5000, active: true, ...over,
});
const ing = (over = {}) => ({
  id: 'i1', name: 'Harina', cost: 100, stock: 10, min_stock: 0,
  food_category: 'dry', ...over,
});
const receta = (pares) => new Map(pares);

const sano = {
  vertical: 'gastro',
  productos: [prod()],
  insumos: [ing()],
  recetas: receta([['p1', [{ ingredient_id: 'i1', qty: 1 }]]]),
  gastos: [{ date: '2026-08-05' }],
  settings: { waste_pct: 0, expense_pct: 0 },
  hoy: new Date('2026-08-16T12:00:00Z'),
  listo: true,
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

beforeEach(() => localStorage.clear());

function AvisosControlados(props) {
  const [abierto, setAbierto] = React.useState(false);
  return React.createElement(DicoAvisos, {
    ...props,
    abierto,
    onAbrir: () => setAbierto(true),
    onCerrar: () => setAbierto(false),
  });
}

const renderAvisos = props => render(React.createElement(AvisosControlados, props));

describe('DicoAvisos en el panel real', () => {
  it('presenta una alerta con Dico preocupado y ejecuta su salida', () => {
    const onIr = vi.fn();
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })], onIr,
    });

    expect(container.querySelector('[data-dico-native="alert"]')).toBeInTheDocument();
    expect(screen.queryByText(/está sin precio/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    expect(screen.getAllByText(/está sin precio/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-mensaje-lectura')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Poner precio' }));
    expect(onIr).toHaveBeenCalledWith('products');
  });

  it('avanza entre avisos y cambia la expresion de Dico', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })], recetas: receta([]),
    });

    expect(container.querySelector('[data-dico-native="alert"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    // `sin-receta` es una sugerencia: la cara baja de `alert` a `curious`.
    expect(container.querySelector('[data-dico-native="curious"]')).toBeInTheDocument();
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-mensaje-lectura')).toHaveLength(1);
  });

  it('permite omitir un aviso que ya resuelve otra escena', () => {
    const { container } = renderAvisos({
      ...sano, productos: [], recetas: receta([]), omitir: ['catalogo-vacio'],
    });
    expect(container.querySelector('[data-dico-native]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aviso.*dico/i })).not.toBeInTheDocument();
  });

  it('una sugerencia no se disfraza de sistema trabajando', () => {
    const { container } = renderAvisos({
      ...sano, recetas: receta([]),
    });

    // Antes esto ponia `esperando`: el sistema "esperando" usado como cara.
    // Una sugerencia es curiosidad, y que haya algo que decir lo dice el pulso.
    expect(container.querySelector('[data-dico-native="curious"]')).toBeInTheDocument();
    expect(container.querySelector('[data-dico-pulso]'))
      .toHaveAttribute('data-dico-pulso', 'attention');
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-mensaje-lectura')).toHaveLength(1);
  });

  it('mantiene a Dico visible aunque no haya avisos', () => {
    const { container } = renderAvisos(sano);
    expect(container.querySelector('[data-dico-native]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aviso.*dico/i })).not.toBeInTheDocument();
  });

  it('cerrar la burbuja no hace desaparecer a Dico', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })],
    });
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar lo que dice dico/i }));
    expect(container.querySelector('[data-dico-native]')).toBeInTheDocument();
    expect(screen.queryByText(/está sin precio/)).not.toBeInTheDocument();
  });

  it('el mensaje va antes de Native y es la tarjeta del sistema', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })],
    });
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));

    const avisos = container.querySelector('.dico-avisos');
    expect(avisos.firstElementChild).toHaveClass('dico-avisos-mensaje');
    expect(avisos.lastElementChild).toHaveClass('dico-avisos-presencia');
    // Dico 2D habla en tarjeta; el globo dibujado quedo para Physical.
    expect(container.querySelector('.dico-mensaje')).not.toBeNull();
    expect(container.querySelector('.dico-burbuja')).toBeNull();
    expect(container.querySelector('[data-dico-native]')).toBeInTheDocument();
  });

  it('cara y actividad son ejes independientes, no una sola tabla', () => {
    // Mientras carga no hay avisos (`avisosDe` devuelve [] con listo:false),
    // asi que NADA dicta una cara. El vocabulario viejo igual ponia
    // `esperando` de cara; ahora la cara queda neutral y el trabajo del
    // sistema lo cuenta el pulso, que es el eje que le corresponde.
    const { container } = renderAvisos({ ...sano, listo: false });
    expect(container.querySelector('[data-dico-native="neutral"]')).toBeInTheDocument();
    expect(container.querySelector('[data-dico-pulso]'))
      .toHaveAttribute('data-dico-pulso', 'processing');

    // Y con un aviso presente la cara la dicta el aviso, no la actividad.
    const conAlerta = renderAvisos({ ...sano, productos: [prod({ price: 0 })] });
    expect(conAlerta.container.querySelector('[data-dico-native="alert"]')).toBeInTheDocument();
    expect(conAlerta.container.querySelector('[data-dico-pulso]'))
      .toHaveAttribute('data-dico-pulso', 'attention');
  });

  /**
   * SUPERSEDED POR PHASE 4 · PASS 2 — cambio contractual explicito.
   *
   * Estos dos casos fijaban que tocar a Dico 2D TRAIA A PHYSICAL ("Traer a
   * Dico") y que el personaje y el contador fueran dos gestos distintos.
   * Ahora Dico 2D es presencia persistente e indicador de lo que tiene para
   * decir: al tocarlo abre y cierra SU MENSAJE, no invoca a Physical. El
   * boton de invocar vuelve cuando exista el chat real.
   *
   * Lo que se conserva de la version vieja: que el personaje NO sea un span
   * inerte cuando hay algo que mirar, y que el contador siga siendo un
   * control con su propia area — eso sigue medido abajo.
   */
  it('sin avisos Dico no ofrece accion: no hay nada que decir', () => {
    const { container } = renderAvisos(sano);
    expect(container.querySelector('button.dico-avisos-idle')).toBeNull();
    expect(container.querySelector('.dico-avisos-idle [data-dico-native]')).toBeInTheDocument();
  });

  it('con avisos, tocar a Dico abre y cierra su mensaje', () => {
    // Contra el comportamiento observable y no contra spies: el wrapper
    // `AvisosControlados` es quien posee `abierto`, asi que un `onAbrir`
    // inyectado por props nunca se llamaria.
    const { container } = renderAvisos({ ...sano, productos: [prod({ price: 0 })] });

    expect(container.querySelector('.dico-mensaje')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    expect(container.querySelector('.dico-mensaje')).not.toBeNull();
    expect(screen.getAllByText(/está sin precio/).length).toBeGreaterThan(0);

    // El mismo pixel lo cierra: es la misma intencion.
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el mensaje de Dico' }));
    expect(container.querySelector('.dico-mensaje')).toBeNull();

    /* PASS 4 — SUPERSEDED. Hasta acá esto exigía lo contrario: que el contador
     * fuera un control APARTE y que no envolviera al personaje. Esa regla
     * existía por dos razones que ya no valen — el badge le comía el aro a un
     * Dico de 36-40px, y personaje y contador hacían cosas distintas.
     * PASS 2 los dejó haciendo lo mismo y PASS 3 llevó al personaje a 60/88.
     * Separados, el contador se leía como una notificación ajena flotando al
     * lado; el pedido de PASS 4 es que se lea como que Dico tiene algo para
     * decir.
     *
     * Lo que se sigue exigiendo, y es lo que importaba de aquella regla: que
     * sea UN control con el personaje adentro, y que el número esté en el
     * nombre accesible y no solo dibujado. */
    const boton = container.querySelector('button.dico-avisos-trigger');
    expect(boton.querySelector('[data-dico-native]'), 'el control no envuelve al personaje').not.toBeNull();
    expect(boton.querySelector('.dico-avisos-badge')).toBeInTheDocument();
    expect(boton.getAttribute('aria-label')).toMatch(/aviso/);
    // Y no quedan dos controles donde ahora hay uno.
    expect(container.querySelectorAll('.dico-avisos-presencia button')).toHaveLength(1);
  });

  it('el mensaje declara de que chasis cuelga, y es una CAPA', () => {
    // La tarjeta ya no cambia de forma segun donde viva Dico —eso lo hacia la
    // cola del globo—, pero el contenedor sigue diciendo de donde cuelga: el
    // CSS del chasis es quien sabe donde ubicarla.
    const arriba = renderAvisos({ ...sano, productos: [prod({ price: 0 })] });
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    expect(arriba.container.querySelector('.dico-avisos-mensaje'))
      .toHaveClass('dico-avisos-mensaje--arriba');
    arriba.unmount();

    const costado = renderAvisos({ ...sano, productos: [prod({ price: 0 })], anclaje: 'lateral' });
    fireEvent.click(screen.getByRole('button', { name: /ver lo que dice dico/i }));
    expect(costado.container.querySelector('.dico-avisos-mensaje'))
      .toHaveClass('dico-avisos-mensaje--lateral');
  });

  it('lo que dice Dico no empuja la pantalla que este abierta', () => {
    // Estaba en el flujo: abrirlo bajaba el catalogo entero y cerrarlo lo
    // volvia a subir. El contrato es que salga del flujo en todos los chasis.
    const css = readFileSync(resolve('src/components/dico/burbuja.css'), 'utf8');
    const cuerpo = css.slice(
      css.indexOf('.dico-avisos-mensaje {'),
      css.indexOf('}', css.indexOf('.dico-avisos-mensaje {')),
    );
    expect(cuerpo, 'el mensaje volvio al flujo').toMatch(/position:\s*(absolute|fixed)/);
  });

  it('hace la entrada una sola vez por dispositivo', () => {
    const props = { ...sano, productos: [prod({ price: 0 })] };
    const primera = renderAvisos(props);
    expect(primera.container.querySelector('.dico-native--entrada')).toBeInTheDocument();
    primera.unmount();

    const segunda = renderAvisos(props);
    expect(segunda.container.querySelector('.dico-native--entrada')).not.toBeInTheDocument();
  });
});
