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
      + 'paga_hasta, suspendido_at, medio_de_cobro, created_at, first_order_at')
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
    .from('platform_admins').select('user_id, email, created_at').order('created_at');
  if (error) {
    console.error('fetchStaff:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Suma a alguien al equipo.
 *
 * Dos condiciones, las dos del lado del servidor: el correo tiene que ser de
 * un dominio de la empresa (`staff_dominios`) y la cuenta tiene que EXISTIR.
 * La funcion no crea usuarios: poder fabricar cuentas desde la consola es
 * poder fabricarse accesos.
 */
export async function sumarStaff(email) {
  const { data, error } = await supabase.rpc('sumar_staff', { p_email: email });
  if (error) {
    console.error('sumarStaff:', error.message);
    return { __error: 'db', message: 'No se pudo sumar a esa persona.' };
  }
  if (!data?.ok) {
    const razones = {
      sin_cuenta: 'Esa persona todavía no tiene cuenta. Que se registre en '
        + 'divianco.app y después la sumás.',
      dominio_no_permitido: 'A la consola sólo entran los correos de la empresa '
        + '(@grupodivianco.com). Un correo personal no puede tener acceso a los '
        + 'precios ni a las suscripciones.',
    };
    return { __error: 'fn', message: razones[data?.error] || 'No se pudo sumar.' };
  }
  return { ok: true };
}

export async function quitarStaff(userId) {
  const { data, error } = await supabase.rpc('quitar_staff', { p_user_id: userId });
  if (error) {
    console.error('quitarStaff:', error.message);
    return { __error: 'db', message: 'No se pudo quitar el acceso.' };
  }
  if (!data?.ok) {
    const razones = {
      no_te_saques_a_vos: 'No podés sacarte el acceso a vos mismo.',
      ultimo_staff: 'Es la última persona con acceso: no se puede quitar.',
    };
    return { __error: 'fn', message: razones[data?.error] || 'No se pudo quitar.' };
  }
  return { ok: true };
}
