// El alta de alguien del equipo de Dico — el lado del front.
//
// El alta se simplifico en 0057: se invita al correo PERSONAL y listo. La
// version anterior creaba primero un alias en el dominio de la empresa via
// Cloudflare, y se descarto porque el alias necesita una routing rule para
// entregar — sin ella la invitacion salia hacia una direccion que no recibe
// nada y se perdia en silencio.
//
// Lo que importa que sea cierto:
//   - que el PUESTO viaje siempre, y que el default sea el que menos puede:
//     olvidarse de elegirlo no puede darle a alguien los precios de toda la
//     plataforma;
//   - que el motivo exacto de la edge function llegue a la pantalla. "No se
//     pudo dar de alta" no dice si el problema es el puesto, el correo o el
//     envio, y cada uno se arregla distinto;
//   - que reenviar el acceso NO devuelva ninguna contraseña.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => invoke(...a) } },
}));

const { sumarStaff, resetearClaveDeStaff } = await import('../services/platformPlanes');

/** Un error del cliente de Supabase con el body de la function adentro. */
const errorConBody = (msg) => ({
  error: {
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => ({ error: msg }) },
  },
  data: null,
});

beforeEach(() => { invoke.mockReset(); });

describe('el alta manda correo y puesto', () => {
  it('una sola llamada, con las dos cosas', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, invitado: true, message: 'Le mandamos un mail.' },
      error: null,
    });

    const r = await sumarStaff('persona@gmail.com', 'ventas');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('staff-invite', {
      body: {
        email: 'persona@gmail.com', puesto: 'ventas',
        origin: window.location.origin,
      },
    });
    expect(r.invitado).toBe(true);
  });

  it('sin puesto explícito entra como soporte, que es el que menos puede', async () => {
    // Si el default fuera 'administrador', olvidarse de elegir le daría a
    // alguien los precios de toda la plataforma.
    invoke.mockResolvedValue({ data: { ok: true, invitado: true, message: 'ok' }, error: null });
    await sumarStaff('persona@gmail.com');
    expect(invoke.mock.calls[0][1].body.puesto).toBe('soporte');
  });

  it('a alguien que ya tenía cuenta no se le pisa la contraseña', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, invitado: false, message: 'Ya tenía cuenta: entra con la contraseña que ya usaba.' },
      error: null,
    });
    const r = await sumarStaff('persona@gmail.com', 'soporte');
    expect(r.invitado).toBe(false);
    expect(r.message).toMatch(/ya usaba/);
  });
});

describe('el motivo llega entero a la pantalla', () => {
  it('el puesto inválido', async () => {
    invoke.mockResolvedValue(errorConBody('«jefe» no es un puesto de la consola.'));
    const r = await sumarStaff('persona@gmail.com', 'jefe');
    expect(r.__error).toBe('fn');
    expect(r.message).toMatch(/no es un puesto/);
  });

  it('el envío que falló, con lo que dijo el servidor', async () => {
    invoke.mockResolvedValue(errorConBody(
      'No se pudo enviar la invitación: rate limit exceeded'));
    const r = await sumarStaff('persona@gmail.com');
    expect(r.message).toMatch(/rate limit/);
  });

  it('quien no es dueño no da de alta', async () => {
    invoke.mockResolvedValue(errorConBody(
      'Sólo el dueño de la plataforma puede dar de alta'));
    const r = await sumarStaff('persona@gmail.com');
    expect(r.__error).toBe('fn');
    expect(r.message).toMatch(/dueño de la plataforma/);
  });

  it('un error sin body legible cae en el genérico y no rompe', async () => {
    invoke.mockResolvedValue({ error: { message: 'boom' }, data: null });
    const r = await sumarStaff('persona@gmail.com');
    expect(r.__error).toBe('fn');
    expect(r.message).toBe('No se pudo dar de alta.');
  });

  it('un 200 con `error` adentro también es un error', async () => {
    invoke.mockResolvedValue({ data: { error: 'Ese correo no parece válido.' }, error: null });
    const r = await sumarStaff('mal');
    expect(r.__error).toBe('fn');
    expect(r.message).toBe('Ese correo no parece válido.');
  });
});

describe('reenviar el acceso', () => {
  it('va con `resetear` y no devuelve ninguna contraseña', async () => {
    // Es el remedio cuando la invitación no llegó. Lo único que viaja de vuelta
    // es un mensaje: la contraseña la elige la persona en su mail, y nadie más
    // la ve — ni siquiera quien pidió el reenvío.
    invoke.mockResolvedValue({ data: { ok: true, message: 'Link enviado.' }, error: null });
    const r = await resetearClaveDeStaff('persona@gmail.com');

    expect(invoke).toHaveBeenCalledWith('staff-invite', {
      body: { email: 'persona@gmail.com', origin: window.location.origin, resetear: true },
    });
    expect(JSON.stringify(r)).not.toMatch(/password|contraseña.*:/i);
    expect(r.ok).toBe(true);
  });

  it('el fallo del envío se dice, no se traga', async () => {
    invoke.mockResolvedValue(errorConBody('No se pudo mandar el link'));
    const r = await resetearClaveDeStaff('persona@gmail.com');
    expect(r.__error).toBe('fn');
  });
});
