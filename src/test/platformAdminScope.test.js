import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import { fetchProducts, fetchOrders } from '../services/platformAdmin';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

// El bug que estos tests cuidan: las lecturas del panel se apoyaban SOLO en
// RLS. La policy es `tenant_id in (select private.current_user_tenants())`,
// que devuelve las filas de todos los tenants de los que el usuario es
// miembro — correcto como frontera de seguridad, inutil como filtro de
// alcance. Mientras cada dueno tuvo un solo negocio no se noto; el dia que
// uno quedo vinculado a cinco, el panel de la-nona-pato mostraba los
// productos de mala-miga, cochi y tienda-demo mezclados.
//
// Por eso lo que se afirma no es "devuelve estas filas" (eso lo decide la DB)
// sino "la consulta SALE con el filtro puesto".

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('fetchProducts: alcance por tenant', () => {
  it('filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchProducts(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId falla en vez de traer de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchProducts()).rejects.toThrow(/tenantId/);
    await expect(fetchProducts(null)).rejects.toThrow(/tenantId/);
    // Lo importante: nunca llego a consultar.
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('fetchOrders: alcance por tenant', () => {
  it('filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchOrders(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId falla en vez de traer de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchOrders()).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('el limit sigue aplicandose junto con el filtro', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchOrders(TENANT, { limit: 25 });

    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
    expect(c.limit).toHaveBeenCalledWith(25);
  });
});
