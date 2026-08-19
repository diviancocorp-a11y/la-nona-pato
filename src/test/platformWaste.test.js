import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }));

import { fetchWaste, registerWaste, SELECT_COLS } from '../services/platformWaste';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.waste_log);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe en waste_log`).toBe(true);
    }
  });
});

describe('alcance por tenant', () => {
  it('fetchWaste filtra por el tenant_id que recibe', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);

    await fetchWaste(TENANT);

    expect(mockFrom).toHaveBeenCalledWith('waste_log');
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId fallan en vez de traer o escribir de mas', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    await expect(fetchWaste()).rejects.toThrow(/tenantId/);
    await expect(registerWaste(null, 'i1', 1, 'rotura')).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('registerWaste', () => {
  // Contrato bool del legacy: WasteForm no distingue de donde viene el saver.
  it('llama a la RPC con el tenant y devuelve true', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'w1' }], error: null });

    const ok = await registerWaste(TENANT, 'i1', 2.5, 'vencimiento', 'nota');

    expect(mockRpc).toHaveBeenCalledWith('register_waste', {
      p_tenant_id: TENANT,
      p_ingredient_id: 'i1',
      p_qty: 2.5,
      p_reason: 'vencimiento',
      p_note: 'nota',
      // Etapa 0: sin esto, un reintento descontaba el stock dos veces. El
      // valor es un uuid nuevo por operacion, asi que se compara la forma.
      p_client_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    });
    expect(ok).toBe(true);
  });

  it('el reintento de la MISMA merma lleva la misma clave', async () => {
    // Es la garantia entera: si la clave cambiara entre intentos, el server no
    // podria reconocer que es el mismo envio y descontaria dos veces.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });

    await registerWaste(TENANT, 'i1', 2.5, 'vencimiento', 'nota');
    await registerWaste(TENANT, 'i1', 2.5, 'vencimiento', 'nota');

    const [, primera] = mockRpc.mock.calls[0];
    const [, segunda] = mockRpc.mock.calls[1];
    expect(segunda.p_client_request_id).toBe(primera.p_client_request_id);
  });

  it('tras guardar bien, la merma siguiente es otra', async () => {
    // Dos roturas iguales del mismo insumo el mismo dia son dos mermas, no un
    // duplicado: se rompieron dos veces.
    mockRpc.mockResolvedValue({ data: [{ id: 'w1' }], error: null });

    await registerWaste(TENANT, 'i1', 2.5, 'vencimiento', 'nota');
    await registerWaste(TENANT, 'i1', 2.5, 'vencimiento', 'nota');

    const [, primera] = mockRpc.mock.calls[0];
    const [, segunda] = mockRpc.mock.calls[1];
    expect(segunda.p_client_request_id).not.toBe(primera.p_client_request_id);
  });

  it('un error de la RPC devuelve false, no revienta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'P0001: insumo_de_otro_negocio' } });
    expect(await registerWaste(TENANT, 'i1', 1, 'otro')).toBe(false);
  });

  it('sin razon manda el default del legacy', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await registerWaste(TENANT, 'i1', 1);
    expect(mockRpc).toHaveBeenCalledWith('register_waste',
      expect.objectContaining({ p_reason: 'otro', p_note: null }));
  });
});
