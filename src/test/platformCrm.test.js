import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import {
  fetchCustomerStats, agregarClientes, pedidosParaCrm, SELECT_COLS,
} from '../services/platformCrm';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.orders);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en orders`).toBe(true);
    }
  });
});

describe('alcance por tenant', () => {
  it('fetchCustomerStats filtra por tenant y excluye cancelados', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchCustomerStats(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
    // OJO _chain: todos los metodos son el mismo vi.fn, filtrar por argumento.
    expect(c.neq).toHaveBeenCalledWith('status', 'cancelled');
  });

  it('sin tenantId falla en vez de traer de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchCustomerStats()).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('agregarClientes', () => {
  const pedido = (extra) => ({
    customer_name: 'Ana', customer_phone: '111', customer_email: '',
    total: 1000, status: 'completed', created_at: '2026-08-01T10:00:00Z',
    delivery_address: '', ...extra,
  });

  it('consolida por telefono y suma totales', () => {
    const clientes = agregarClientes([
      pedido(), pedido({ total: 500, created_at: '2026-08-10T10:00:00Z' }),
    ]);
    expect(clientes).toHaveLength(1);
    expect(clientes[0]).toMatchObject({ name: 'Ana', phone: '111', orders: 2, total: 1500 });
    expect(clientes[0].last_order).toBe('2026-08-10T10:00:00Z');
  });

  it('la direccion es la del pedido mas reciente que tenga una', () => {
    const clientes = agregarClientes([
      pedido({ delivery_address: 'Vieja 1', created_at: '2026-08-01T10:00:00Z' }),
      pedido({ delivery_address: 'Nueva 2', created_at: '2026-08-15T10:00:00Z' }),
      pedido({ delivery_address: '', created_at: '2026-08-16T10:00:00Z' }),
    ]);
    expect(clientes[0].address).toBe('Nueva 2');
  });

  it('ordena por total gastado y descarta pedidos sin identidad', () => {
    const clientes = agregarClientes([
      pedido(),
      pedido({ customer_name: 'Beto', customer_phone: '222', total: 9000 }),
      pedido({ customer_name: '', customer_phone: '', customer_email: '' }),
    ]);
    expect(clientes.map(c => c.name)).toEqual(['Beto', 'Ana']);
  });

  it('sin flujo de cumpleanos: birth_date y age quedan null', () => {
    const [c] = agregarClientes([pedido()]);
    expect(c.birth_date).toBeNull();
    expect(c.age).toBeNull();
    expect(typeof c.days_since_last_order).toBe('number');
  });
});

describe('pedidosParaCrm', () => {
  it('traduce al idioma del legacy (customer/phone/email)', () => {
    const [p] = pedidosParaCrm([{
      customer_name: 'Ana', customer_phone: '111', customer_email: 'a@b.c',
      total: 1000, status: 'new', payment: 'efectivo', created_at: '2026-08-16T10:00:00Z',
    }]);
    expect(p).toEqual({
      customer: 'Ana', phone: '111', email: 'a@b.c',
      total: 1000, status: 'new', payment: 'efectivo', created_at: '2026-08-16T10:00:00Z',
    });
  });
});
