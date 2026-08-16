import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import {
  fetchSettings, saveSettings, validateSettings,
  CAMPOS_EDITABLES, SELECT_COLS, TEMAS_CATALOGO,
} from '../services/platformSettings';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

// SELECT_COLS es un literal a proposito (el pre-commit solo lee literales) y
// CAMPOS_EDITABLES es la lista blanca de escritura. Son dos fuentes de lo
// mismo: si se separan, el panel guarda un campo que despues no vuelve a leer.
describe('SELECT_COLS vs CAMPOS_EDITABLES', () => {
  it('el select cubre exactamente los editables mas las de sistema', () => {
    const enSelect = SELECT_COLS.split(',').map(s => s.trim());
    expect(enSelect).toEqual(['tenant_id', ...CAMPOS_EDITABLES, 'updated_at']);
  });

  it('todas las columnas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.settings);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en la tabla settings`).toBe(true);
    }
  });

  it('no se escribe tenant_id ni updated_at', () => {
    expect(CAMPOS_EDITABLES).not.toContain('tenant_id');
    expect(CAMPOS_EDITABLES).not.toContain('updated_at');
  });
});

describe('validateSettings', () => {
  it('un patch vacio es valido (no se guarda nada, pero no es un error)', () => {
    expect(validateSettings({})).toEqual([]);
  });

  it('el tema del catalogo esta acotado a tres', () => {
    for (const t of TEMAS_CATALOGO) expect(validateSettings({ catalog_theme: t })).toEqual([]);
    expect(validateSettings({ catalog_theme: 'neon' })).toHaveLength(1);
  });

  it('logo_color es hex libre, no un tema', () => {
    // La distincion importa: catalog_theme acotado, logo_color hex libre.
    expect(validateSettings({ logo_color: '#c91b14' })).toEqual([]);
    expect(validateSettings({ logo_color: '#C91B14' })).toEqual([]);
    expect(validateSettings({ logo_color: 'rojo' })).toHaveLength(1);
    expect(validateSettings({ logo_color: '#fff' })).toHaveLength(1);
    expect(validateSettings({ logo_color: '' })).toEqual([]);
  });

  it('los porcentajes van de 0 a 100', () => {
    expect(validateSettings({ waste_pct: 0 })).toEqual([]);
    expect(validateSettings({ waste_pct: 100 })).toEqual([]);
    expect(validateSettings({ waste_pct: 101 })).toHaveLength(1);
    expect(validateSettings({ expense_pct: -1 })).toHaveLength(1);
  });

  it('los montos y tiempos no pueden ser negativos', () => {
    expect(validateSettings({ min_order_amount: 0 })).toEqual([]);
    expect(validateSettings({ min_order_amount: -5 })).toHaveLength(1);
    expect(validateSettings({ prep_time_min: -1 })).toHaveLength(1);
  });

  it('vacio y null no cuentan como valor invalido', () => {
    expect(validateSettings({ waste_pct: '', min_order_amount: null })).toEqual([]);
  });

  it('las listas tienen que ser listas', () => {
    expect(validateSettings({ delivery_pricing: [] })).toEqual([]);
    expect(validateSettings({ delivery_pricing: 'gratis' })).toHaveLength(1);
    expect(validateSettings({ payment_accounts: {} })).toHaveLength(1);
  });
});

describe('fetchSettings', () => {
  it('filtra por tenant', async () => {
    const c = chain({ data: { tenant_id: TENANT }, error: null });
    mockFrom.mockReturnValue(c);

    await fetchSettings(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('settings');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId falla en vez de consultar', async () => {
    await expect(fetchSettings()).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('guarda solo los campos del patch y filtra por tenant', async () => {
    const c = chain({ data: { tenant_id: TENANT, slogan: 'Hola' }, error: null });
    mockFrom.mockReturnValue(c);

    await saveSettings(TENANT, { slogan: 'Hola' });

    expect(c.update).toHaveBeenCalledWith({ slogan: 'Hola' });
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('descarta lo que no esta en la lista blanca', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    // tenant_id y updated_at los maneja la DB; `hackeo` no existe.
    await saveSettings(TENANT, { slogan: 'Hola', tenant_id: 'otro', updated_at: 'ayer', hackeo: 1 });

    expect(c.update).toHaveBeenCalledWith({ slogan: 'Hola' });
  });

  it('el string vacio se guarda como null, no como ""', async () => {
    const c = chain({ data: {}, error: null });
    mockFrom.mockReturnValue(c);

    await saveSettings(TENANT, { slogan: '' });

    expect(c.update).toHaveBeenCalledWith({ slogan: null });
  });

  it('no manda una consulta si no quedo nada para guardar', async () => {
    const r = await saveSettings(TENANT, { hackeo: 1 });
    expect(r.__error).toBe('validation');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('un patch invalido no llega a la base', async () => {
    const r = await saveSettings(TENANT, { catalog_theme: 'neon' });
    expect(r.__error).toBe('validation');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sin tenantId falla en vez de escribir', async () => {
    await expect(saveSettings(null, { slogan: 'x' })).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
