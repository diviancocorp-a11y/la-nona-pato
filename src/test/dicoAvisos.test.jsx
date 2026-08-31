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

    expect(container.querySelector('.dico--preocupado')).toBeInTheDocument();
    expect(screen.queryByText(/está sin precio/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    expect(screen.getAllByText(/está sin precio/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Poner precio' }));
    expect(onIr).toHaveBeenCalledWith('products');
  });

  it('avanza entre avisos y cambia la expresion de Dico', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })], recetas: receta([]),
    });

    expect(container.querySelector('.dico--preocupado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /abrir 2 avisos de dico/i }));
    fireEvent.click(screen.getByRole('button', { name: /hay 1 más/i }));
    expect(container.querySelector('.dico--esperando')).toBeInTheDocument();
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(2);
  });

  it('permite omitir un aviso que ya resuelve otra escena', () => {
    const { container } = renderAvisos({
      ...sano, productos: [], recetas: receta([]), omitir: ['catalogo-vacio'],
    });
    expect(container.querySelector('[data-dico-core]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aviso.*dico/i })).not.toBeInTheDocument();
  });

  it('usa la espera con puntos cuando sólo hay una sugerencia', () => {
    const { container } = renderAvisos({
      ...sano, recetas: receta([]),
    });

    expect(container.querySelector('.dico--esperando')).toBeInTheDocument();
    expect(container.querySelectorAll('.dico-espera-punto')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    expect(screen.getAllByText(/no tiene receta cargada/)).toHaveLength(2);
  });

  it('mantiene a Dico visible aunque no haya avisos', () => {
    const { container } = renderAvisos(sano);
    expect(container.querySelector('[data-dico-core]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aviso.*dico/i })).not.toBeInTheDocument();
  });

  it('cerrar la burbuja no hace desaparecer a Dico', () => {
    const { container } = renderAvisos({
      ...sano, productos: [prod({ price: 0 })],
    });
    fireEvent.click(screen.getByRole('button', { name: /abrir 1 aviso de dico/i }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar lo que dice dico/i }));
    expect(container.querySelector('[data-dico-core]')).toBeInTheDocument();
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
    expect(container.querySelector('[data-dico-core]')).toBeInTheDocument();
  });

  it('hace la entrada una sola vez por dispositivo', () => {
    const props = { ...sano, productos: [prod({ price: 0 })] };
    const primera = renderAvisos(props);
    expect(primera.container.querySelector('.dico--entrada')).toBeInTheDocument();
    primera.unmount();

    const segunda = renderAvisos(props);
    expect(segunda.container.querySelector('.dico--entrada')).not.toBeInTheDocument();
  });
});
