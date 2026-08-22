// El alta de un empleado desde la consola — el lado del front.
//
// Lo que importa que sea cierto:
//   - que crear el correo y dar el acceso sean DOS llamadas distintas. Si la
//     pantalla las juntara, la invitacion saldria antes de que la persona
//     confirme el reenvio y se perderia;
//   - que el motivo exacto de la edge function llegue a la pantalla. "No se
//     pudo dar de alta" no le dice a nadie si el problema es el dominio, el
//     token de Cloudflare o una confirmacion que falta — y cada uno se arregla
//     distinto;
//   - que `paso` viaje tal cual, porque es lo unico que separa "esperando el
//     clic" de "listo".

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...a) => invoke(...a) } },
}));

const {
  crearCorreoDeEmpleado, fetchCorreosDeEquipo, reenviarConfirmacion, sumarStaff,
} = await import('../services/platformPlanes');

/** Un error del cliente de Supabase con el body de la function adentro. */
const errorConBody = (msg) => ({
  error: { message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => ({ error: msg }) } },
  data: null,
});

beforeEach(() => { invoke.mockReset(); });

describe('crear el correo y dar el acceso son dos pasos', () => {
  it('crear el correo no invita a nadie', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, email: 'juan@grupodivianco.com', personal: 'juan@gmail.com',
        paso: 'esperando_confirmacion', confirmado: false, regla: false },
      error: null,
    });

    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('staff-invite', {
      body: { accion: 'crear_correo', alias: 'juan', personal: 'juan@gmail.com' },
    });
    expect(r.paso).toBe('esperando_confirmacion');
  });

  it('el segundo intento, ya confirmado, cierra el alta', async () => {
    invoke.mockResolvedValue({
      data: { ok: true, email: 'juan@grupodivianco.com', paso: 'listo',
        confirmado: true, regla: true },
      error: null,
    });
    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });
    expect(r.paso).toBe('listo');
  });

  it('dar el acceso va por la accion de siempre, con la direccion de trabajo', async () => {
    invoke.mockResolvedValue({ data: { ok: true, invitado: true, message: 'ok' }, error: null });
    await sumarStaff('juan@grupodivianco.com', 'ventas');
    expect(invoke).toHaveBeenCalledWith('staff-invite', {
      body: {
        email: 'juan@grupodivianco.com', puesto: 'ventas',
        origin: window.location.origin,
      },
    });
  });

  it('sin puesto explícito entra como soporte, que es el que menos puede', async () => {
    // El default importa: si fuera 'administrador', olvidarse de elegir el
    // puesto le daría a alguien los precios de toda la plataforma.
    invoke.mockResolvedValue({ data: { ok: true, invitado: true, message: 'ok' }, error: null });
    await sumarStaff('juan@grupodivianco.com');
    expect(invoke.mock.calls[0][1].body.puesto).toBe('soporte');
  });
});

describe('el motivo llega entero a la pantalla', () => {
  it('el alias que no entrega no frena la invitación, pero avisa', async () => {
    // Decisión de Ricky (21/ago): mandar igual en vez de frenar, para no
    // depender de un permiso de Cloudflare que todavía no está. Lo que NO se
    // puede perder es el aviso: si la invitación no llega, la causa tiene que
    // estar en pantalla y no en los logs de una edge function.
    invoke.mockResolvedValue({
      data: {
        ok: true, invitado: true, message: 'Le mandamos un mail.',
        aviso: 'Ojo: juan@grupodivianco.com no figura recibiendo correo.',
      },
      error: null,
    });
    const r = await sumarStaff('juan@grupodivianco.com');
    expect(r.__error).toBeUndefined();
    expect(r.aviso).toMatch(/no figura recibiendo correo/);
  });

  it('el aviso de que no se pudo crear el alias vuelve con el paso listo', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true, email: 'juan@grupodivianco.com', paso: 'listo',
        confirmado: true, regla: false,
        aviso: 'Ojo: no se pudo crear el alias en Cloudflare.',
      },
      error: null,
    });
    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });
    // `listo` con `regla: false` es la combinación rara y es a propósito: el
    // alta sigue, pero la pantalla tiene que poder decir que el alias no existe.
    expect(r.paso).toBe('listo');
    expect(r.regla).toBe(false);
    expect(r.aviso).toMatch(/no se pudo crear el alias/);
  });

  it('el token de Cloudflare que falta', async () => {
    invoke.mockResolvedValue(errorConBody(
      'Falta el token de Cloudflare en los secretos de la función (CLOUDFLARE_API_TOKEN).'));
    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });
    expect(r.message).toMatch(/CLOUDFLARE_API_TOKEN/);
  });

  it('un error sin body legible cae en el mensaje generico y no rompe', async () => {
    invoke.mockResolvedValue({ error: { message: 'boom' }, data: null });
    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });
    expect(r.__error).toBe('fn');
    expect(r.message).toBe('No se pudo crear el correo.');
  });

  it('un 200 con `error` adentro tambien es un error', async () => {
    invoke.mockResolvedValue({ data: { error: 'Ese alias ya existe' }, error: null });
    const r = await crearCorreoDeEmpleado({ alias: 'juan', personal: 'juan@gmail.com' });
    expect(r.__error).toBe('fn');
    expect(r.message).toBe('Ese alias ya existe');
  });
});

describe('leer el estado del correo', () => {
  it('devuelve reglas, destinos y catch-all listos para el modulo', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true, dominio: 'grupodivianco.com',
        reglas: [{ alias: 'juan@grupodivianco.com', destinos: ['juan@gmail.com'], activa: true }],
        destinos: [{ email: 'juan@gmail.com', confirmado: true }],
        catchAll: { activo: false, destinos: [] },
      },
      error: null,
    });
    const r = await fetchCorreosDeEquipo();
    expect(invoke).toHaveBeenCalledWith('staff-invite', { body: { accion: 'correos' } });
    expect(r.dominio).toBe('grupodivianco.com');
    expect(r.reglas).toHaveLength(1);
  });

  it('si falla no inventa un estado vacio: avisa', async () => {
    // Devolver listas vacias haria que la pantalla diga "sin correo de
    // trabajo" para TODO el equipo, que es exactamente lo contrario de lo que
    // pasa.
    invoke.mockResolvedValue(errorConBody('Cloudflare: permiso denegado'));
    const r = await fetchCorreosDeEquipo();
    expect(r.__error).toBe('fn');
    expect(r.reglas).toBeUndefined();
  });
});

describe('reenviar la confirmacion', () => {
  it('manda el correo personal, que es el que hay que confirmar', async () => {
    invoke.mockResolvedValue({ data: { ok: true, message: 'listo' }, error: null });
    await reenviarConfirmacion('juan@gmail.com');
    expect(invoke).toHaveBeenCalledWith('staff-invite', {
      body: { accion: 'reenviar_confirmacion', personal: 'juan@gmail.com' },
    });
  });
});
