import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }));

import {
  fetchSales, createSale, validateSale, completeOrder,
  productosComoRecetas, pedidosParaVentas,
  SELECT_COLS,
} from '../services/platformSales';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.sales);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en sales`).toBe(true);
    }
  });
});

// Mismo bug que cuidan platformFinance y platformAdminScope: la RLS devuelve
// las filas de TODOS los tenants de los que el usuario es miembro. Un P&L que
// suma las ventas de otro negocio da un numero creible y equivocado.
describe('alcance por tenant', () => {
  it('fetchSales filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchSales(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('sales');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId fallan en vez de traer o escribir de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchSales()).rejects.toThrow(/tenantId/);
    await expect(createSale(null, { recipe_id: 'p1', qty: 1, unit_price: 100 })).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('createSale manda el tenant_id en la fila', async () => {
    const c = chain({ data: { id: 's1' }, error: null });
    mockFrom.mockReturnValue(c);

    await createSale(TENANT, { recipe_id: 'p1', qty: 2, unit_price: 500 });

    expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT,
      recipe_id: 'p1',
      qty: 2,
      unit_price: 500,
      total: 1000,
    }));
  });
});

describe('validateSale', () => {
  it('acepta lo minimo', () => {
    expect(validateSale({ recipe_id: 'p1', qty: 1, unit_price: 100 })).toEqual([]);
  });

  it('rechaza sin producto', () => {
    expect(validateSale({ qty: 1, unit_price: 100 })).toHaveLength(1);
  });

  // Number('') y Number(null) son 0: sin el corte explicito, una cantidad
  // vacia pasaria la validacion como venta gratis.
  it('rechaza cantidad o precio vacios, cero o negativos', () => {
    expect(validateSale({ recipe_id: 'p1', qty: '', unit_price: 100 })).toHaveLength(1);
    expect(validateSale({ recipe_id: 'p1', qty: 1, unit_price: null })).toHaveLength(1);
    expect(validateSale({ recipe_id: 'p1', qty: 0, unit_price: -5 })).toHaveLength(2);
  });
});

describe('completeOrder', () => {
  it('llama a la RPC con el pedido y devuelve las ventas', async () => {
    const filas = [{ id: 's1', order_id: 'o1' }];
    mockRpc.mockResolvedValue({ data: filas, error: null });

    const res = await completeOrder('o1');

    expect(mockRpc).toHaveBeenCalledWith('complete_order', { p_order_id: 'o1' });
    expect(res).toEqual({ ok: true, sales: filas });
  });

  it('traduce los codigos de error de la RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'P0001: ya_completado' } });
    const res = await completeOrder('o1');
    expect(res.__error).toBe('ya_completado');
    expect(res.message).toMatch(/ya estaba completado/);
  });

  it('sin orderId no llama a la RPC', async () => {
    const res = await completeOrder(null);
    expect(res.__error).toBe('validation');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// Los adaptadores traducen el modelo del edificio al idioma de las pantallas
// legacy. Si estos se rompen, SalesView muestra "?" en todo y el costeo del
// resumen da 0 sin que nada falle.
describe('adaptadores', () => {
  it('productosComoRecetas: price -> sale_price y qty -> quantity', () => {
    const recetas = new Map([['p1', [{ ingredient_id: 'i1', qty: 3 }]]]);
    const recs = productosComoRecetas(
      [{ id: 'p1', name: 'Milanesa', price: 900 }, { id: 'p2', name: 'Corte', price: 500 }],
      recetas
    );
    expect(recs).toEqual([
      { id: 'p1', name: 'Milanesa', sale_price: 900, ingredients: [{ ingredient_id: 'i1', quantity: 3 }] },
      { id: 'p2', name: 'Corte', sale_price: 500, ingredients: [] },
    ]);
  });

  it('pedidosParaVentas: customer_name -> customer y product_id -> recipe_id', () => {
    const items = new Map([['o1', [{ product_id: 'p1', qty: 2, unit_price: 900, name_snapshot: 'Milanesa' }]]]);
    const pedidos = pedidosParaVentas(
      [{ id: 'o1', status: 'completed', customer_name: 'Ana', customer_phone: '11', payment: 'efectivo', total: 1800, created_at: '2026-08-16T20:00:00Z' }],
      items
    );
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({
      customer: 'Ana',
      date: '2026-08-16',
      payment: 'efectivo',
      order_items: [{ recipe_id: 'p1', quantity: 2, unit_price: 900, name_snapshot: 'Milanesa' }],
    });
  });

  it('pedidosParaVentas: sin items cargados no rompe', () => {
    const pedidos = pedidosParaVentas([{ id: 'o1', customer_name: 'Ana', created_at: '2026-08-16T20:00:00Z' }], null);
    expect(pedidos[0].order_items).toEqual([]);
  });
});
