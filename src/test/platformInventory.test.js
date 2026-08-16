import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import {
  fetchIngredients, upsertIngredient, validateIngredient, bajoMinimo,
  SELECT_COLS, CAMPOS_EDITABLES,
} from '../services/platformInventory';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.ingredients);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en ingredients`).toBe(true);
    }
  });

  it('no se escribe tenant_id ni id ni created_at desde el formulario', () => {
    for (const c of ['tenant_id', 'id', 'created_at']) {
      expect(CAMPOS_EDITABLES).not.toContain(c);
    }
  });
});

describe('validateIngredient', () => {
  it('acepta lo minimo: solo el nombre', () => {
    expect(validateIngredient({ name: 'Harina' })).toEqual([]);
  });

  it('rechaza nombre vacio', () => {
    expect(validateIngredient({ name: '' })).toHaveLength(1);
    expect(validateIngredient({ name: '   ' })).toHaveLength(1);
  });

  it('los numeros no pueden ser negativos', () => {
    expect(validateIngredient({ name: 'X', cost: -1 })).toHaveLength(1);
    expect(validateIngredient({ name: 'X', stock: -5 })).toHaveLength(1);
    expect(validateIngredient({ name: 'X', min_stock: -2 })).toHaveLength(1);
  });

  it('cero es valido', () => {
    expect(validateIngredient({ name: 'X', cost: 0, stock: 0, min_stock: 0 })).toEqual([]);
  });

  it('vacio y null son opcionales, no cero implicito invalido', () => {
    // Number('') es 0: si el vacio cayera en la validacion numerica pasaria
    // como valido por accidente. Se descarta antes, a proposito.
    expect(validateIngredient({ name: 'X', cost: '', stock: null })).toEqual([]);
  });

  it('rechaza texto donde va un numero', () => {
    expect(validateIngredient({ name: 'X', cost: 'caro' })).toHaveLength(1);
  });
});

describe('fetchIngredients', () => {
  it('filtra por tenant y esconde archivados', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchIngredients(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('ingredients');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
    expect(c.eq).toHaveBeenCalledWith('is_archived', false);
  });

  it('puede incluir archivados sin perder el filtro de tenant', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchIngredients(TENANT, { incluirArchivados: true });

    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
    expect(c.eq).not.toHaveBeenCalledWith('is_archived', false);
  });

  it('sin tenantId falla en vez de traer de mas', async () => {
    await expect(fetchIngredients()).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('upsertIngredient', () => {
  it('manda el tenant_id en la fila', async () => {
    const c = chain({ data: { id: 'i1' }, error: null });
    mockFrom.mockReturnValue(c);

    await upsertIngredient(TENANT, { name: 'Harina', cost: 900, unit: 'kg' });

    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT, name: 'Harina', cost: 900, unit: 'kg',
    }));
  });

  it('los vacios se guardan como 0, no como NaN', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    await upsertIngredient(TENANT, { name: 'Sal', cost: '', stock: '', min_stock: '' });

    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({ cost: 0, stock: 0, min_stock: 0 }));
  });

  it('un invalido no llega a la base', async () => {
    const r = await upsertIngredient(TENANT, { name: '' });
    expect(r.__error).toBe('validation');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('el nombre repetido da un mensaje entendible, no el error de Postgres', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'duplicate key' } }));
    const r = await upsertIngredient(TENANT, { name: 'Harina' });
    expect(r.__error).toBe('duplicate');
    expect(r.message).toMatch(/Harina/);
  });

  it('sin tenantId falla en vez de escribir', async () => {
    await expect(upsertIngredient(null, { name: 'X' })).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('bajoMinimo', () => {
  it('marca los que estan en o por debajo del minimo', () => {
    const lista = [
      { name: 'Harina', stock: 2, min_stock: 5 },   // debajo
      { name: 'Sal', stock: 5, min_stock: 5 },      // justo en el limite
      { name: 'Aceite', stock: 10, min_stock: 5 },  // ok
    ];
    expect(bajoMinimo(lista).map(i => i.name)).toEqual(['Harina', 'Sal']);
  });

  it('sin minimo definido no alerta nunca', () => {
    // min_stock 0 = "no me controles esto". Si contara, todo insumo en 0
    // apareceria como faltante desde el dia uno.
    expect(bajoMinimo([{ name: 'X', stock: 0, min_stock: 0 }])).toEqual([]);
  });
});
