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
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    expect(screen.getAllByText(/está sin precio/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-burbuja-lectura')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Poner precio' }));
    expect(onIr).toHaveBeenCalledWith('products');
  });

  it('avanza entre avisos y cambia la expresion de Dico', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })], recetas: receta([]),
    });

    expect(container.querySelector('[data-dico-native="alert"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /abrir 2 avisos de dico/i }));
    fireEvent.click(screen.getByRole('button', { name: /hay 1 más/i }));
    // `sin-receta` es una sugerencia: la cara baja de `alert` a `curious`.
    expect(container.querySelector('[data-dico-native="curious"]')).toBeInTheDocument();
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-burbuja-lectura')).toHaveLength(1);
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
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(3);
    expect(container.querySelectorAll('.dico-burbuja-lectura')).toHaveLength(1);
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
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar lo que dice dico/i }));
    expect(container.querySelector('[data-dico-native]')).toBeInTheDocument();
    expect(screen.queryByText(/está sin precio/)).not.toBeInTheDocument();
  });

  it('renderiza el mensaje antes de Native y con cola centrada', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })],
    });
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));

    const avisos = container.querySelector('.dico-avisos');
    expect(avisos.firstElementChild).toHaveClass('dico-avisos-mensaje');
    expect(avisos.lastElementChild).toHaveClass('dico-avisos-presencia');
    expect(container.querySelector('.dico-burbuja')).toHaveClass('dico-burbuja--cola-centro');
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

  it('sin avisos Dico deja de ser decorativo: se lo puede invocar', () => {
    const onInvocar = vi.fn();
    renderAvisos({ ...sano, onInvocar });

    // Sin `onInvocar` esto era un span inerte: el usuario veia a Dico y no
    // podia hacer nada con el.
    fireEvent.click(screen.getByRole('button', { name: 'Traer a Dico' }));
    expect(onInvocar).toHaveBeenCalledTimes(1);
  });

  it('con avisos el click atiende el aviso y no invoca a Physical', () => {
    const onInvocar = vi.fn();
    renderAvisos({ ...sano, productos: [prod({ price: 0 })], onInvocar });

    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    expect(onInvocar).not.toHaveBeenCalled();
    expect(screen.getAllByText(/está sin precio/).length).toBeGreaterThan(0);
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
