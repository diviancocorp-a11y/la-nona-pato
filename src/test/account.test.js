import { describe, it, expect, vi, beforeEach } from 'vitest';

// business.platform decide contra que base habla el service. Es un objeto
// mutable para poder probar LAS DOS ramas: el edificio no puede ganar la
// suya rompiendo el catalogo de los 3 negocios legacy.
const { mockBusiness, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockBusiness: { platform: false },
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));
vi.mock('@business', () => ({ default: mockBusiness }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }));

import {
  fetchUserData, toggleFavorite, fetchFavoriteProducts, fetchOrderHistory, updateProfile,
} from '../services/account';
import { chain } from './_chain.js';

const USER = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mockBusiness.platform = false;
});

describe('favoritos: la columna cambia con la base', () => {
  it('en el edificio son product_id', async () => {
    mockBusiness.platform = true;
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await toggleFavorite(USER, 'p1', false);

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(c.insert).toHaveBeenCalledWith({ user_id: USER, product_id: 'p1' });
  });

  it('en el legacy siguen siendo recipe_id', async () => {
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await toggleFavorite(USER, 'r1', false);

    expect(c.insert).toHaveBeenCalledWith({ user_id: USER, recipe_id: 'r1' });
  });

  it('si el guardado falla devuelve false (el corazon no puede quedar pintado)', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'nope' } }));
    expect(await toggleFavorite(USER, 'r1', false)).toBe(false);
  });

  it('desmarcar borra por la columna que corresponde', async () => {
    mockBusiness.platform = true;
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await toggleFavorite(USER, 'p1', true);

    expect(c.delete).toHaveBeenCalled();
    // OJO _chain: todos los metodos son el MISMO vi.fn, asi que .eq acumula
    // las llamadas de todos. Hay que filtrar por argumento.
    const cols = c.eq.mock.calls.map(([col]) => col);
    expect(cols).toContain('product_id');
    expect(cols).not.toContain('recipe_id');
  });
});

describe('fetchFavoriteProducts', () => {
  it('el edificio traduce price -> sale_price para la pantalla', async () => {
    mockBusiness.platform = true;
    mockFrom.mockReturnValue(chain({ data: [{ id: 'p1', name: 'Pan', price: 900 }], error: null }));

    const r = await fetchFavoriteProducts(['p1']);

    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(r[0].sale_price).toBe(900);
  });

  it('el legacy lee recipes tal cual', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ id: 'r1', sale_price: 500 }], error: null }));
    await fetchFavoriteProducts(['r1']);
    expect(mockFrom).toHaveBeenCalledWith('recipes');
  });

  it('sin favoritos no consulta nada', async () => {
    await fetchFavoriteProducts([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('fetchUserData', () => {
  it('devuelve las tres claves aunque una consulta falle', async () => {
    // Si alguna volviera undefined, AuthContext pisaria su estado con eso y
    // la cuenta mostraria los datos del usuario anterior.
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));

    const r = await fetchUserData(USER);

    expect(r).toEqual({ profile: null, addresses: [], favorites: [] });
  });

  it('sin usuario no consulta', async () => {
    expect(await fetchUserData(null)).toEqual({ profile: null, addresses: [], favorites: [] });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('updateProfile', () => {
  it('en el edificio hace upsert: el comprador todavia no tiene fila', async () => {
    mockBusiness.platform = true;
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await updateProfile(USER, { name: 'Ana' });

    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: USER, name: 'Ana' }));
    expect(c.update).not.toHaveBeenCalled();
  });

  it('en el legacy sigue siendo update por id', async () => {
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await updateProfile(USER, { name: 'Ana' });

    expect(c.update).toHaveBeenCalled();
    expect(c.upsert).not.toHaveBeenCalled();
  });
});

describe('historial', () => {
  it('con cuenta filtra por user_id', async () => {
    mockBusiness.platform = true;
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchOrderHistory({ user: { id: USER } });

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(c.eq).toHaveBeenCalledWith('user_id', USER);
  });

  it('el edificio traduce customer_name -> customer', async () => {
    mockBusiness.platform = true;
    mockFrom.mockReturnValue(chain({ data: [{ id: 'o1', customer_name: 'Ana' }], error: null }));

    const r = await fetchOrderHistory({ user: { id: USER } });

    expect(r[0].customer).toBe('Ana');
  });

  // Decision explicita, no un olvido: el RPC del legacy matchea por telefono
  // y cualquiera que escriba un numero ajeno ve esos pedidos. En el edificio
  // eso seria el mismo agujero multiplicado por la cantidad de locales.
  it('por telefono: el legacy usa el RPC, el edificio NO', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'o1' }], error: null });
    expect(await fetchOrderHistory({ user: null, phone: '111' })).toHaveLength(1);

    mockBusiness.platform = true;
    mockRpc.mockClear();
    expect(await fetchOrderHistory({ user: null, phone: '111' })).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
