import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import {
  fetchSuppliers, upsertSupplier, validateSupplier,
  SELECT_COLS, CAMPOS_EDITABLES, SCOPES,
} from '../services/platformSuppliers';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.suppliers);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en suppliers`).toBe(true);
    }
  });

  it('el formulario no escribe tenant_id ni las fechas', () => {
    for (const c of ['tenant_id', 'id', 'created_at', 'updated_at']) {
      expect(CAMPOS_EDITABLES).not.toContain(c);
    }
  });
});

describe('alcance por tenant', () => {
  it('fetchSuppliers filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchSuppliers(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('suppliers');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId falla en vez de traer o escribir de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchSuppliers()).rejects.toThrow(/tenantId/);
    await expect(upsertSupplier(null, { name: 'Carniceria' })).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // Por defecto solo activos: es lo que piden los selectores de gasto y de
  // compra, donde un proveedor pausado no tiene que aparecer.
  it('por defecto trae solo los activos; el gestor pide todos', async () => {
    const c1 = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c1);
    await fetchSuppliers(TENANT);
    expect(c1.eq).toHaveBeenCalledWith('is_active', true);

    const c2 = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c2);
    await fetchSuppliers(TENANT, { activeOnly: false });
    expect(c2.eq).not.toHaveBeenCalledWith('is_active', true);
  });
});

// `scope` responde "que le comprás" y decide en que desplegable aparece. Es
// distinto de `category`, que dice de que rubro es: la carniceria tenia
// category "Carniceria" y aparecia igual al cargar un gasto de luz.
describe('scope: en que pantalla aparece cada proveedor', () => {
  it('los valores son los que acepta el CHECK de la migracion 0031', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../platform/migrations/0031_compra_un_movimiento_y_scope_proveedor.sql'), 'utf-8'
    ).replace(/--[^\n]*/g, '');
    const m = sql.match(/check\s*\(\s*scope\s+in\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    expect([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort()).toEqual([...SCOPES].sort());
  });

  it('una compra ofrece los de insumos; un gasto, los de servicios', async () => {
    const c1 = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c1);
    await fetchSuppliers(TENANT, { para: 'compra' });
    expect(c1.in).toHaveBeenCalledWith('scope', ['insumos', 'ambos']);

    const c2 = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c2);
    await fetchSuppliers(TENANT, { para: 'gasto' });
    expect(c2.in).toHaveBeenCalledWith('scope', ['servicios', 'ambos']);
  });

  // 'ambos' es el default de la DB: un proveedor que nadie clasifico tiene
  // que seguir apareciendo en los dos lados, no desaparecer sin explicacion.
  it('el gestor no filtra por scope, y "ambos" entra en las dos pantallas', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);
    await fetchSuppliers(TENANT, { activeOnly: false });
    // Ojo: en el helper `chain` todos los metodos del builder son EL MISMO
    // vi.fn (devuelven self), asi que `.in` acumula tambien los `.eq` y los
    // `.order`. Un `not.toHaveBeenCalled()` nunca puede pasar; lo que se
    // afirma es que ninguna llamada filtro por scope.
    expect(c.in).not.toHaveBeenCalledWith('scope', expect.anything());

    for (const para of ['compra', 'gasto']) {
      const cx = chain({ data: [], error: null });
      mockFrom.mockReturnValue(cx);
      await fetchSuppliers(TENANT, { para });
      // Por lo mismo de arriba hay que buscar la llamada, no tomar la primera.
      const filtro = cx.in.mock.calls.find(c => c[0] === 'scope');
      expect(filtro?.[1], para).toContain('ambos');
    }
  });

  it('un scope inventado no llega a la base', async () => {
    mockFrom.mockReturnValue(chain({ data: {}, error: null }));
    const res = await upsertSupplier(TENANT, { name: 'Proveedor', scope: 'inventado' });
    expect(res.__error).toBe('validation');
  });

  it('sin scope explicito se guarda como "ambos"', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);
    await upsertSupplier(TENANT, { name: 'Proveedor' });
    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'ambos' }));
  });
});

describe('validateSupplier', () => {
  it('acepta lo minimo: solo el nombre', () => {
    expect(validateSupplier({ name: 'Carniceria La Esquina' })).toEqual([]);
  });

  it('rechaza nombres de menos de 2 caracteres', () => {
    expect(validateSupplier({ name: 'x' })).toHaveLength(1);
    expect(validateSupplier({ name: '  ' })).toHaveLength(1);
  });

  it('rechaza un email que no es email, pero deja el campo vacio', () => {
    expect(validateSupplier({ name: 'Proveedor', email: 'arroba-nada' })).toHaveLength(1);
    expect(validateSupplier({ name: 'Proveedor', email: '' })).toEqual([]);
  });
});

describe('upsertSupplier', () => {
  // El indice unico de la DB normaliza con lower(btrim(name)). Sin el trim
  // aca, "  Carniceria" se guardaria con los espacios y la lista mostraria
  // dos veces lo que la base considera el mismo nombre.
  it('recorta el nombre antes de guardarlo', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    await upsertSupplier(TENANT, { name: '  Carniceria La Esquina  ' });

    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Carniceria La Esquina', tenant_id: TENANT,
    }));
  });

  it('traduce el choque del indice unico a algo que se entienda', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'duplicate key' } }));

    const res = await upsertSupplier(TENANT, { name: 'Carniceria' });

    expect(res.__error).toBe('duplicate');
    expect(res.message).toMatch(/Ya tenés un proveedor/);
  });
});
