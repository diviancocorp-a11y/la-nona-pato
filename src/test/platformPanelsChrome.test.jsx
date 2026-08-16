import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
// El confirm de borrado abre un provider con animaciones; para estos tests
// alcanza con que exista la funcion.
vi.mock('../components/ConfirmSlideProvider', () => ({
  useConfirm: () => async () => false,
}));

import ProductsPanel from '../components/admin/platform/ProductsPanel';
import OrdersPanel from '../components/admin/platform/OrdersPanel';

// El bug que estos tests cuidan (16/ago): las pestanias principales usaban
// `ag-page-over` como contenedor raiz. Esa clase es un overlay full-screen
// (position:fixed, z-index 950) y admin-shared.css tiene una regla explicita:
//
//   body:has(.ag-page-over) .ag-topbar,
//   body:has(.ag-page-over) .ag-bottom-nav { display: none; }
//
// O sea que el panel entero quedaba sin engranaje y sin barra de navegacion.
// Lo peor: el header y el nav SI se renderizaban, solo que tapados — asi que
// en el DOM estaba todo bien y en pantalla no habia nada. No hay test de
// integracion que lo agarre; hay que mirar la clase.
//
// Los overlays de verdad (el formulario de alta/edicion) si deben usarla: ahi
// tapar la navegacion es el comportamiento buscado.

function raiz(container) {
  return container.firstElementChild;
}

describe('las pestañas principales no tapan el chrome del panel', () => {
  it('ProductsPanel no usa ag-page-over en su raiz', () => {
    const { container } = render(
      <ProductsPanel products={[]} vertical="gastro" loading={false}
        onSave={vi.fn()} onToggleActive={vi.fn()} onDelete={vi.fn()} showToast={vi.fn()} />
    );
    expect(raiz(container).className).not.toContain('ag-page-over');
    expect(container.querySelector('.ag-page-over')).toBeNull();
  });

  it('OrdersPanel no usa ag-page-over en su raiz', () => {
    const { container } = render(
      <OrdersPanel orders={[]} loading={false} onSetStatus={vi.fn()} showToast={vi.fn()} />
    );
    expect(raiz(container).className).not.toContain('ag-page-over');
    expect(container.querySelector('.ag-page-over')).toBeNull();
  });

  it('el formulario de producto SI puede taparlo: es un takeover con Atrás', async () => {
    const { container } = render(
      <ProductsPanel products={[]} vertical="gastro" loading={false}
        onSave={vi.fn()} onToggleActive={vi.fn()} onDelete={vi.fn()} showToast={vi.fn()} />
    );
    screen.getByRole('button', { name: /Agregar/i }).click();
    // Tras abrir el formulario, el overlay es esperable.
    await vi.waitFor(() => {
      expect(container.querySelector('.ag-page-over')).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: /Volver/i })).toBeTruthy();
  });
});

describe('terminología por rubro en las pestañas', () => {
  it('gastro dice Productos', () => {
    render(<ProductsPanel products={[]} vertical="gastro" loading={false}
      onSave={vi.fn()} onToggleActive={vi.fn()} onDelete={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Productos' })).toBeTruthy();
  });

  it('barbería dice Servicios', () => {
    render(<ProductsPanel products={[]} vertical="barber" loading={false}
      onSave={vi.fn()} onToggleActive={vi.fn()} onDelete={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeTruthy();
  });

  it('retail dice Artículos', () => {
    render(<ProductsPanel products={[]} vertical="retail" loading={false}
      onSave={vi.fn()} onToggleActive={vi.fn()} onDelete={vi.fn()} showToast={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Artículos' })).toBeTruthy();
  });
});
