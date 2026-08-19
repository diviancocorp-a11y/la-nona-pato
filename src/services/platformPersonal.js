// src/services/platformPersonal.js
// Turnos, disponibilidad, ausencias, fichaje y costo laboral (0048).
//
// Es el "workforce scheduling": el otro lado del scheduling de 6c. Comparten
// la matematica de intervalos —y el mismo patron de EXCLUDE constraint— pero
// no la entidad, asi que van en archivos distintos a proposito.
//
// SOBRE EL FICHAJE Y LA BIOMETRIA
// Este archivo nunca ve una huella. El navegador usa WebAuthn: el telefono
// verifica al dueño del dispositivo como quiera y devuelve una FIRMA. Lo unico
// que viaja es esa firma; la huella no sale del telefono. Ver el comentario de
// la migracion 0048.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const COLS_SHIFT =
  'id, tenant_id, branch_id, staff_id, starts_at, ends_at, job, notes, status, ' +
  'published_at, swap_requested_by, swap_taken_by, created_at';

const COLS_ENTRY =
  'id, tenant_id, branch_id, staff_id, shift_id, clock_in_at, clock_out_at, ' +
  'business_day, method, verified, adjusted_by, adjusted_at, adjusted_reason, created_at';

const MENSAJES = {
  no_sos_miembro: 'No tenés acceso a este negocio.',
  no_hay_fichaje_abierto: 'No hay una entrada abierta para cerrar.',
  shift_no_overlap: 'Esa persona ya tiene un turno en ese horario.',
  shift_time_valid: 'El fin del turno tiene que ser posterior al inicio.',
  availability_time_valid: 'La hora de fin tiene que ser posterior a la de inicio.',
  absence_time_valid: 'La fecha de fin tiene que ser posterior a la de inicio.',
  entry_time_valid: 'La salida no puede ser anterior a la entrada.',
};

function traducir(msg) {
  const codigo = Object.keys(MENSAJES).find(c => msg.includes(c));
  return codigo ? MENSAJES[codigo] : msg;
}

/* ──────────────────────────── El equipo ─────────────────────────────── */

export async function fetchPersonal(tenantId, branchId = null) {
  let q = supabase.from('staff')
    .select('id, tenant_id, branch_id, name, user_id, job, hourly_cost, commission_pct, payout_alias, color, active, hired_at')
    .eq('tenant_id', tenantId).eq('active', true);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q.order('name');
  if (error) {
    console.error('fetchPersonal:', error.message);
    return [];
  }
  return data || [];
}

/* ─────────────────────────────  Turnos ──────────────────────────────── */

export async function fetchTurnosDelEquipo(tenantId, { branchId, desde, hasta } = {}) {
  let q = supabase.from('staff_shifts').select(COLS_SHIFT).eq('tenant_id', tenantId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (desde) q = q.gte('starts_at', desde);
  if (hasta) q = q.lte('starts_at', hasta);
  const { data, error } = await q.order('starts_at');
  if (error) {
    console.error('fetchTurnosDelEquipo:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Programar un turno. Nace en `scheduled`: el empleado NO lo ve hasta que se
 * publica. Sin eso, armar la semana genera un aviso por cada arrastre y nadie
 * confia en lo que ve.
 */
export async function guardarTurno(tenantId, branchId, turno) {
  const fila = {
    tenant_id: tenantId,
    branch_id: branchId,
    staff_id: turno.staffId,
    starts_at: turno.startsAt,
    ends_at: turno.endsAt,
    job: turno.job || null,
    notes: turno.notes?.trim() || null,
  };
  const q = turno.id
    ? supabase.from('staff_shifts').update(fila).eq('id', turno.id).eq('tenant_id', tenantId)
    : supabase.from('staff_shifts').insert(fila);
  const { data, error } = await q.select(COLS_SHIFT).single();
  if (error) {
    console.error('guardarTurno:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, turno: data };
}

/** Publicar la semana: recien ahi el equipo la ve. */
export async function publicarTurnos(tenantId, ids) {
  if (!ids?.length) return { ok: true, publicados: 0 };
  const { error } = await supabase.from('staff_shifts')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .in('id', ids).eq('tenant_id', tenantId);
  if (error) {
    console.error('publicarTurnos:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, publicados: ids.length };
}

export async function cancelarTurno(tenantId, id) {
  // Se cancela, no se borra: el EXCLUDE ignora los cancelados, asi que el
  // horario queda libre, y el registro de que existio se conserva.
  const { error } = await supabase.from('staff_shifts')
    .update({ status: 'cancelled' }).eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('cancelarTurno:', error.message);
    return false;
  }
  return true;
}

/* ───────────────────── Disponibilidad y ausencias ───────────────────── */

export async function fetchDisponibilidad(tenantId, staffId = null) {
  let q = supabase.from('staff_availability')
    .select('id, tenant_id, staff_id, weekday, starts_time, ends_time, kind')
    .eq('tenant_id', tenantId);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q.order('weekday').order('starts_time');
  if (error) {
    console.error('fetchDisponibilidad:', error.message);
    return [];
  }
  return data || [];
}

export async function guardarDisponibilidad(tenantId, staffId, franja) {
  const { data, error } = await supabase.from('staff_availability').insert({
    tenant_id: tenantId,
    staff_id: staffId,
    weekday: Number(franja.weekday),
    starts_time: franja.startsTime,
    ends_time: franja.endsTime,
    kind: franja.kind || 'available',
  }).select().single();
  if (error) {
    console.error('guardarDisponibilidad:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, franja: data };
}

export async function fetchAusencias(tenantId, { staffId = null, estados = null } = {}) {
  let q = supabase.from('staff_absences')
    .select('id, tenant_id, staff_id, starts_at, ends_at, kind, status, reason, decided_by, decided_at, created_at')
    .eq('tenant_id', tenantId);
  if (staffId) q = q.eq('staff_id', staffId);
  if (estados) q = q.in('status', estados);
  const { data, error } = await q.order('starts_at', { ascending: false });
  if (error) {
    console.error('fetchAusencias:', error.message);
    return [];
  }
  return data || [];
}

export async function pedirAusencia(tenantId, staffId, datos) {
  const { data, error } = await supabase.from('staff_absences').insert({
    tenant_id: tenantId,
    staff_id: staffId,
    starts_at: datos.startsAt,
    ends_at: datos.endsAt,
    kind: datos.kind || 'other',
    reason: datos.reason?.trim() || null,
  }).select().single();
  if (error) {
    console.error('pedirAusencia:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, ausencia: data };
}

export async function decidirAusencia(tenantId, id, aprobada) {
  const { error } = await supabase.from('staff_absences').update({
    status: aprobada ? 'approved' : 'rejected',
    decided_at: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('decidirAusencia:', error.message);
    return false;
  }
  return true;
}

/* ──────────────────────────── El fichaje ────────────────────────────── */

/** El fichaje abierto de cada persona: quien esta trabajando ahora. */
export async function fetchFichajesAbiertos(tenantId, branchId = null) {
  let q = supabase.from('time_entries').select(COLS_ENTRY)
    .eq('tenant_id', tenantId).is('clock_out_at', null);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchFichajesAbiertos:', error.message);
    return [];
  }
  return data || [];
}

export async function fetchFichajes(tenantId, { branchId, dia, staffId } = {}) {
  let q = supabase.from('time_entries').select(COLS_ENTRY).eq('tenant_id', tenantId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (dia) q = q.eq('business_day', dia);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q.order('clock_in_at', { ascending: false });
  if (error) {
    console.error('fetchFichajes:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Fichar entrada.
 *
 * `metodo` es como se verifico:
 *   webauthn  passkey del telefono. Es el unico que prueba quien es.
 *   pin       codigo. Se puede prestar.
 *   manual    lo cargo el encargado. No prueba nada, y por eso queda marcado.
 *
 * Tocar "entrar" dos veces devuelve el fichaje que ya estaba: que ya entro no
 * es un error del empleado, y frenarlo lo empuja a pedir la carga a mano, que
 * es justo el camino sin verificar.
 */
export async function ficharEntrada(tenantId, staffId, {
  branchId = null, metodo = 'manual', verificado = false, lat = null, lng = null,
} = {}) {
  const { data, error } = await supabase.rpc('clock_in', {
    p_tenant_id: tenantId,
    p_staff_id: staffId,
    p_branch_id: branchId,
    p_method: metodo,
    p_verified: !!verificado,
    p_lat: lat,
    p_lng: lng,
    p_client_request_id: claveDeIdempotencia('fichaje', [tenantId, staffId, metodo]),
  });
  if (error) {
    console.error('ficharEntrada:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('fichaje');
  return { ok: true, fichaje: data };
}

export async function ficharSalida(tenantId, staffId, { lat = null, lng = null } = {}) {
  const { data, error } = await supabase.rpc('clock_out', {
    p_tenant_id: tenantId,
    p_staff_id: staffId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    console.error('ficharSalida:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, fichaje: data };
}

/**
 * Corregir un fichaje a mano. Queda MARCADO con quien y por que: un registro
 * de horas editable sin rastro es la palabra del encargado, no un registro.
 */
export async function corregirFichaje(tenantId, id, { entrada, salida, motivo }) {
  if (!motivo?.trim()) {
    return { __error: 'sin_motivo', message: 'Poné por qué lo corregís.' };
  }
  const patch = {
    adjusted_at: new Date().toISOString(),
    adjusted_reason: motivo.trim(),
  };
  if (entrada) patch.clock_in_at = entrada;
  if (salida) patch.clock_out_at = salida;

  const { error } = await supabase.from('time_entries')
    .update(patch).eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('corregirFichaje:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true };
}

/* ─────────────────────────── Costo laboral ──────────────────────────── */

/**
 * Cuanto costo el personal contra lo que se vendio, en un dia operativo.
 *
 * Es la cuenta que 6e existe para poder hacer. "Trabajaron 8 horas" no es
 * informacion; "el personal costo el 12% de lo vendido" si, y es lo unico que
 * permite decidir un horario sin corazonadas.
 *
 * Las horas salen de lo FICHADO, no de lo programado: lo programado es una
 * intencion.
 */
export async function fetchCostoLaboral(branchId, dia) {
  const { data, error } = await supabase.rpc('labor_cost_vs_sales', {
    p_branch_id: branchId,
    p_day: dia,
  });
  if (error) {
    console.error('fetchCostoLaboral:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}
