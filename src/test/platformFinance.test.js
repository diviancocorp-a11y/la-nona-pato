import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }));

import {
  fetchExpenses, createExpense, validateExpense, voidExpense, registerPurchase,
  SELECT_COLS, CAMPOS_EDITABLES,
} from '../services/platformFinance';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.expenses);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en expenses`).toBe(true);
    }
  });

  it('el formulario no escribe tenant_id ni las marcas de anulacion', () => {
    // voided_* y voids_expense_id los pone la RPC. Si la pantalla pudiera
    // mandarlos, un gasto podria nacer marcado como anulado.
    for (const c of ['tenant_id', 'id', 'created_at', 'voided_at', 'voided_by', 'voided_reason', 'voids_expense_id']) {
      expect(CAMPOS_EDITABLES).not.toContain(c);
    }
  });
});

// El bug que estos tests cuidan es el mismo de platformAdminScope: la RLS
// devuelve las filas de TODOS los tenants de los que el usuario es miembro.
// Con plata de por medio, un panel que suma los gastos de otro negocio no da
// un numero raro: da un numero creible y equivocado.
describe('alcance por tenant', () => {
  it('fetchExpenses filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchExpenses(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('expenses');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId fallan en vez de traer o escribir de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchExpenses()).rejects.toThrow(/tenantId/);
    await expect(createExpense(null, { description: 'x', amount: 1 })).rejects.toThrow(/tenantId/);
    await expect(registerPurchase(null, {})).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('createExpense manda el tenant_id en la fila', async () => {
    const c = chain({ data: { id: 'e1' }, error: null });
    mockFrom.mockReturnValue(c);

    await createExpense(TENANT, { description: 'Luz', amount: 100 });

    expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: TENANT }));
  });
});

describe('validateExpense', () => {
  it('acepta lo minimo', () => {
    expect(validateExpense({ description: 'Pago de luz', amount: 5000 })).toEqual([]);
  });

  it('rechaza descripcion vacia', () => {
    expect(validateExpense({ description: '   ', amount: 100 })).toHaveLength(1);
  });

  // Number('') y Number(null) son 0, asi que un campo vacio pasaria como un
  // monto valido si el corte fuera solo `Number(x) > 0` sobre el crudo.
  it('un monto vacio no es un monto de 0', () => {
    for (const amount of ['', null, undefined, 0, -5, 'ocho']) {
      expect(validateExpense({ description: 'algo', amount }), String(amount)).toHaveLength(1);
    }
  });

  it('rechaza un tipo de gasto que la DB no acepta', () => {
    expect(validateExpense({ description: 'algo', amount: 1, expense_type: 'inventado' })).toHaveLength(1);
  });
});

describe('createExpense: normalizacion', () => {
  it('las cuotas solo se guardan si el gasto es de tipo cuota', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    await createExpense(TENANT, {
      description: 'Alquiler', amount: 100, expense_type: 'fixed',
      installment_current: 3, installment_total: 12,
    });

    expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({
      installment_current: null, installment_total: null,
    }));
  });

  it('los vacios van como null y no como cadena vacia', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    await createExpense(TENANT, {
      description: 'Luz', amount: 100,
      supplier: '  ', supplier_id: '', usar_category: '', payment_account_id: '',
    });

    const fila = c.insert.mock.calls[0][0];
    for (const campo of ['supplier', 'supplier_id', 'usar_category', 'payment_account_id']) {
      expect(fila[campo], campo).toBeNull();
    }
  });
});

describe('voidExpense', () => {
  it('separa el original de la reversion', async () => {
    const original = { id: 'a', voids_expense_id: null, voided_at: '2026-08-16' };
    const reversal = { id: 'b', voids_expense_id: 'a' };
    mockRpc.mockResolvedValue({ data: [original, reversal], error: null });

    const res = await voidExpense({ id: 'a', reason: 'monto mal' });

    expect(mockRpc).toHaveBeenCalledWith('void_expense', { p_expense_id: 'a', p_reason: 'monto mal' });
    expect(res).toEqual({ ok: true, original, reversal });
  });

  // La pantalla traduce por codigo exacto: si el service devuelve el mensaje
  // crudo de Postgres, el usuario ve "Error al anular" en vez del motivo.
  it('devuelve los codigos que la pantalla sabe traducir', async () => {
    for (const codigo of ['already_voided', 'is_a_reversal', 'outside_current_month']) {
      mockRpc.mockResolvedValue({ data: null, error: { message: `error de la base: ${codigo}` } });
      const res = await voidExpense({ id: 'a' });
      expect(res).toEqual({ ok: false, errors: [codigo] });
    }
  });

  it('sin id no llama a la base', async () => {
    const res = await voidExpense({ id: null });
    expect(res.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('registerPurchase', () => {
  it('descarta las lineas sin insumo o sin cantidad', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'e1' }], error: null });

    await registerPurchase(TENANT, {
      date: '2026-08-16',
      items: [
        { ingredient_id: 'i1', qty: 2, unitCost: 100 },
        { ingredient_id: '', qty: 5, unitCost: 10 },     // sin insumo
        { ingredient_id: 'i2', qty: 0, unitCost: 10 },   // sin cantidad
      ],
    });

    expect(mockRpc).toHaveBeenCalledWith('register_purchase', expect.objectContaining({
      p_tenant_id: TENANT,
      p_items: [{ ingredient_id: 'i1', qty: 2, unit_cost: 100 }],
    }));
  });

  it('sin ninguna linea valida no llega a la base', async () => {
    const res = await registerPurchase(TENANT, { items: [{ ingredient_id: 'i1', qty: 0 }] });
    expect(res.__error).toBe('validation');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('traduce los errores de la RPC a algo legible', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'insumo_de_otro_negocio' } });
    const res = await registerPurchase(TENANT, { items: [{ ingredient_id: 'i1', qty: 1 }] });
    expect(res.__error).toBe('insumo_de_otro_negocio');
    expect(res.message).toMatch(/no es de este negocio/);
  });
});
