// src/services/platformPlanes.js
// Los planes: precios, promos y a quién le toca cada uno.
//
// Lectura abierta y escritura cerrada: la página de precios los muestra sin
// sesión, y sólo el staff de Divianco los edita (policy `plans_write` contra
// `private.es_staff_divianco()`, migración 0052). Si alguien que no es staff
// intenta guardar, la fila no cambia y la base no se queja — por eso
// `guardarPlan` RELEE lo guardado y compara, en vez de confiar en que no hubo
// error.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';

const COLS = 'id, nombre, descripcion, precio_mensual, precio_anual_por_mes, '
  + 'meses_gratis, meses_descuento, descuento_pct, disponible, orden, actualizado_at';

/**
 * El mensaje que la edge function puso en el body, no el "Edge Function
 * returned a non-2xx status code" del cliente.
 *
 * La function contesta con el motivo exacto —"ese puesto no existe", "no se
 * pudo enviar la invitación: …"— y cada uno se arregla distinto. Perderlo y
 * mostrar un error genérico es mandar a la persona a adivinar.
 */
async function mensajeDeError(error, fallback) {
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch { /* el body no era JSON: queda el fallback */ }
  return fallback;
}

/** Todos los planes, en el orden en que se muestran. */
export async function fetchPlanes({ soloDisponibles = false } = {}) {
  let q = supabase.from('plans').select(COLS).order('orden');
  if (soloDisponibles) q = q.eq('disponible', true);
  const { data, error } = await q;
  if (error) {
    console.error('fetchPlanes:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Guarda los cambios de un plan.
 *
 * Devuelve la fila releida: si quien guarda no es staff, la policy filtra el
 * update y afecta CERO filas sin devolver error. Comparar es la unica forma de
 * saber si el cambio entro de verdad.
 */
export async function guardarPlan(id, cambios) {
  const limpio = {
    nombre: cambios.nombre,
    descripcion: cambios.descripcion,
    precio_mensual: Number(cambios.precio_mensual) || 0,
    precio_anual_por_mes: cambios.precio_anual_por_mes === '' || cambios.precio_anual_por_mes == null
      ? null
      : Number(cambios.precio_anual_por_mes),
    meses_gratis: Number(cambios.meses_gratis) || 0,
    meses_descuento: Number(cambios.meses_descuento) || 0,
    descuento_pct: Number(cambios.descuento_pct) || 0,
    disponible: cambios.disponible !== false,
    actualizado_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('plans').update(limpio).eq('id', id).select(COLS);

  if (error) {
    console.error('guardarPlan:', error.message);
    return { __error: 'db', message: 'No se pudo guardar el plan.' };
  }
  if (!data || data.length === 0) {
    return {
      __error: 'permiso',
      message: 'No tenés permiso para editar los planes.',
    };
  }
  return { ok: true, plan: data[0] };
}

/** Si esta persona es staff de Divianco (decide si la consola se abre). */
export async function soyStaffDivianco() {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return false;

  // Se pregunta por la tabla y no por la funcion privada: `platform_admins`
  // no tiene policies, asi que un no-staff recibe vacio en vez de un error.
  const { data, error } = await supabase
    .from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Los negocios con su suscripcion, para la consola.
 *
 * Trae lo que hace falta para cobrar y para ver quien esta por vencer: no es
 * el panel de un negocio, es la lista de clientes de Dico.
 */
export async function fetchNegocios() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, vertical, operation_mode, status, plan_id, ciclo, '
      + 'paga_hasta, suspendido_at, medio_de_cobro, created_at, first_order_at, '
      + 'first_value_at, activated_at, last_activity_at, organization_id')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchNegocios:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Cambia la suscripcion de un negocio: plan, ciclo, hasta cuando pago.
 *
 * Mover `paga_hasta` hacia adelante es lo que lo saca de suspendido, asi que
 * el estado se recalcula acá y no se pide aparte: dejar que se pisen a mano
 * termina en un negocio pagando y sin poder trabajar.
 */
export async function actualizarSuscripcion(tenantId, cambios) {
  const patch = {};
  if (cambios.plan_id !== undefined) patch.plan_id = cambios.plan_id;
  if (cambios.ciclo !== undefined) patch.ciclo = cambios.ciclo;
  if (cambios.medio_de_cobro !== undefined) patch.medio_de_cobro = cambios.medio_de_cobro || null;

  if (cambios.paga_hasta !== undefined) {
    patch.paga_hasta = cambios.paga_hasta || null;
    const alDia = cambios.paga_hasta && new Date(cambios.paga_hasta) > new Date();
    if (alDia) {
      patch.status = 'active';
      patch.suspendido_at = null;
    }
  }

  const { data, error } = await supabase
    .from('tenants').update(patch).eq('id', tenantId)
    .select('id, slug, status, plan_id, ciclo, paga_hasta, suspendido_at, medio_de_cobro');

  if (error) {
    console.error('actualizarSuscripcion:', error.message);
    return { __error: 'db', message: 'No se pudo actualizar la suscripción.' };
  }
  if (!data || data.length === 0) {
    return { __error: 'permiso', message: 'No tenés permiso para esto.' };
  }
  return { ok: true, negocio: data[0] };
}

/* ─────────────────── El equipo de Divianco ─────────────────── */

/**
 * Entrar a la consola.
 *
 * Es un login PROPIO y no el de `/entrar` a proposito: aquel, al terminar,
 * manda al negocio de la persona (`destinoTrasLogin`). Para quien viene a
 * administrar la plataforma eso es salir de donde queria entrar. Ademas la
 * sesion de Supabase se guarda POR ORIGEN: la que se abre en el subdominio de
 * un negocio no existe en `divianco.app`, asi que la consola necesita la suya.
 */
export async function entrarAConsola(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });
  if (error) {
    // Un mensaje unico para credenciales malas: distinguir "no existe" de
    // "clave incorrecta" le dice a cualquiera que direcciones tienen cuenta.
    return { __error: 'auth', message: 'Email o contraseña incorrectos.' };
  }
  if (!(await soyStaffDivianco())) {
    // Entro bien pero no es del equipo: se cierra la sesion para no dejarlo
    // con una sesion abierta en un origen donde no tiene nada que hacer.
    await supabase.auth.signOut();
    return { __error: 'permiso', message: 'Esa cuenta no tiene acceso a la consola.' };
  }
  return { ok: true };
}

export async function salirDeConsola() {
  await supabase.auth.signOut();
}

/** Quien del equipo de Divianco tiene acceso. */
export async function fetchStaff() {
  const { data, error } = await supabase
    .from('platform_admins').select('user_id, email, rol, puesto, modalidad, created_at')
    .order('created_at');
  if (error) {
    console.error('fetchStaff:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Suma a alguien al equipo.
 *
 * Se invita al correo PERSONAL de la persona (0057). Hubo una version que
 * antes creaba un alias en el dominio de la empresa via Cloudflare; se
 * descarto porque el alias necesita una routing rule para entregar y ese
 * permiso no esta, asi que la invitacion se perdia en silencio.
 *
 * La proteccion del alta es una sola y es del lado del servidor: SOLO EL
 * DUENIO puede. La lista de dominios permitidos filtraba la forma del correo,
 * no quien lo daba de alta.
 */
export async function sumarStaff(email, puesto = 'soporte') {
  // Va por edge function y no por la RPC porque hace falta CREAR la cuenta con
  // la API de admin. Si el empleado se registrara por `divianco.app/registro`,
  // el alta le crearia un NEGOCIO —`signup_tenant`— y terminaria con un tenant
  // fantasma a su nombre. Nunca tiene que pasar por ese camino.
  const { data, error } = await supabase.functions.invoke('staff-invite', {
    body: { email, puesto, origin: window.location.origin },
  });

  if (error) {
    return { __error: 'fn', message: await mensajeDeError(error, 'No se pudo dar de alta.') };
  }
  if (data?.error) return { __error: 'fn', message: data.error };
  return { ok: true, message: data?.message, invitado: data?.invitado, aviso: data?.aviso };
}

export async function quitarStaff(userId) {
  const { data, error } = await supabase.rpc('quitar_staff', { p_user_id: userId });
  if (error) {
    console.error('quitarStaff:', error.message);
    return { __error: 'db', message: 'No se pudo quitar el acceso.' };
  }
  if (!data?.ok) {
    const razones = {
      es_el_duenio: 'Al dueño de la plataforma no se lo puede quitar.',
      no_esta: 'Esa persona ya no está en el equipo.',
    };
    return { __error: 'fn', message: razones[data?.error] || 'No se pudo quitar.' };
  }
  return { ok: true };
}

/**
 * Si esta persona es el DUEÑO de la plataforma.
 *
 * Distinto de ser staff: el staff entra a la consola, el dueño ademas reparte
 * el acceso. Sin esta division, alguien a quien le diste acceso para mirar
 * cobros podia darle acceso a un tercero, o sacarte a vos.
 */
export async function soyDuenioDivianco() {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return false;
  const { data } = await supabase
    .from('platform_admins').select('rol').eq('user_id', uid).maybeSingle();
  return data?.rol === 'owner';
}

/**
 * Fija la contraseña de quien llega por un link de invitacion o de
 * recuperacion. El link ya abrio sesion; lo que falta es la clave.
 */
export async function fijarPasswordConsola(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { __error: 'auth', message: 'No se pudo guardar la contraseña. Pedí el link de nuevo.' };
  }
  return { ok: true };
}

/**
 * Le manda a un empleado un link para que elija una contraseña nueva.
 *
 * La consola no tiene "olvidé mi contraseña" a proposito: ese link llevaba a
 * `/entrar`, que es el login de los CLIENTES y termina resolviendo a que
 * negocio mandarte — y un empleado no tiene negocio. Ademas asi el duenio sabe
 * quien pidio un reseteo y cuando.
 *
 * NO devuelve ninguna contraseña: la elige la persona en su mail.
 */
export async function resetearClaveDeStaff(email) {
  const { data, error } = await supabase.functions.invoke('staff-invite', {
    body: { email, origin: window.location.origin, resetear: true },
  });
  if (error) {
    return { __error: 'fn', message: await mensajeDeError(error, 'No se pudo mandar el link.') };
  }
  if (data?.error) return { __error: 'fn', message: data.error };
  return { ok: true, message: 'Le mandamos un link para elegir contraseña nueva.' };
}
