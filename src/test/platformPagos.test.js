// MercadoPago por tenant — el lado del front.
//
// Lo que importa que sea cierto:
//   - que el slug del negocio viaje SIEMPRE (sin el, la function no sabe de
//     quien es el cobro);
//   - que el importe NO viaje desde el browser;
//   - que el access_token no vuelva nunca al front, ni siquiera al conectar;
//   - que el error de la edge function llegue legible a la pantalla, porque el
//     90% de los problemas de esta pantalla son "pegaste el token equivocado".

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => invoke(...a) } },
}));
vi.mock('../lib/activeTenant', () => ({
  getTenantSlugSync: () => 'cochi',
}));

const { estadoMercadoPago, conectarMercadoPago, linkDePago } =
  await import('../services/platformPagos');

beforeEach(() => { invoke.mockReset(); });

describe('el negocio viaja siempre', () => {
  it('el estado se pregunta por slug', async () => {
    invoke.mockResolvedValue({ data: { ok: true, conectado: false }, error: null });
    await estadoMercadoPago();
    expect(invoke).toHaveBeenCalledWith('mp-status', { body: { tenant_slug: 'cochi' } });
  });

  it('conectar manda el slug junto al token', async () => {
    invoke.mockResolvedValue({ data: { ok: true, cuenta: {} }, error: null });
    await conectarMercadoPago({ accessToken: 'APP_USR-x' });
    expect(invoke).toHaveBeenCalledWith('mp-connect', {
      body: {
        tenant_slug: 'cochi',
        access_token: 'APP_USR-x',
        public_key: null,
        webhook_secret: null,
      },
    });
  });
});

describe('el importe no sale del browser', () => {
  it('el link de pago manda el pedido, no la plata', async () => {
    invoke.mockResolvedValue({ data: { ok: true, init_point: 'https://mp/x' }, error: null });
    await linkDePago('o1');
    const [, opciones] = invoke.mock.calls[0];
    expect(opciones.body).toEqual({ tenant_slug: 'cochi', order_id: 'o1' });
    // Si el total viajara desde acá, cualquiera pagaría $1 un pedido de $20.000.
    expect(JSON.stringify(opciones.body)).not.toMatch(/total|amount|precio/i);
  });

  it('devuelve el link y si es real o de prueba', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, init_point: 'https://mp/x', live_mode: false }, error: null,
    });
    const r = await linkDePago('o1');
    expect(r).toEqual({ ok: true, url: 'https://mp/x', liveMode: false });
  });
});

describe('el token no vuelve', () => {
  it('conectar devuelve la cuenta, nunca el token', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, cuenta: { nickname: 'ELCOCHI', live_mode: true } }, error: null,
    });
    const r = await conectarMercadoPago({ accessToken: 'APP_USR-secreto' });
    expect(JSON.stringify(r)).not.toContain('APP_USR-secreto');
    expect(r.cuenta.nickname).toBe('ELCOCHI');
  });

  it('el estado tampoco lo trae', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, conectado: true, cuenta: 'ELCOCHI', public_key: 'pub-1' },
      error: null,
    });
    const r = await estadoMercadoPago();
    expect(r.access_token).toBeUndefined();
    // La public key SI es publica: la usa el checkout en el browser.
    expect(r.public_key).toBe('pub-1');
  });
});

describe('los errores llegan legibles', () => {
  it('el mensaje del cuerpo gana sobre el generico de supabase', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'Ese token no es válido o fue revocado.' }) },
      },
    });
    const r = await conectarMercadoPago({ accessToken: 'roto' });
    expect(r.__error).toBe('fn');
    expect(r.message).toBe('Ese token no es válido o fue revocado.');
  });

  it('un error en el body tambien se propaga', async () => {
    invoke.mockResolvedValue({ data: { error: 'Solo el dueño puede conectar' }, error: null });
    const r = await conectarMercadoPago({ accessToken: 'x' });
    expect(r.message).toBe('Solo el dueño puede conectar');
  });

  it('sin negocio identificado no se llama a nada', async () => {
    vi.resetModules();
    vi.doMock('../lib/activeTenant', () => ({ getTenantSlugSync: () => null }));
    const mod = await import('../services/platformPagos');
    const r = await mod.estadoMercadoPago();
    expect(r.conectado).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
