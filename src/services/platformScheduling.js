// src/services/platformScheduling.js
// Recursos reservables, mapa del salon, reservas y lista de espera (0045).
//
// Es el lado "resource booking" del scheduling. El "workforce scheduling"
// —turnos, disponibilidad y ausencias del personal— va aparte (6e): comparten
// la matematica de intervalos, no la entidad. Una mesa no pide vacaciones.
//
// La garantia de no-solapamiento NO vive aca: vive en el EXCLUDE constraint de
// `appointments`. Este archivo solo evita OFRECER lo que va a rebotar; si dos
// dispositivos reservan la misma mesa en el mismo instante, el que pierde
// recibe el error de la base y eso esta bien.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const COLS_RESOURCE =
  'id, tenant_id, branch_id, kind, name, zone, capacity, min_party, max_party, ' +
  'combinable, pos_x, pos_y, shape, width, height, active, created_at';

const COLS_APPT =
  'id, tenant_id, branch_id, staff_id, resource_id, service_id, customer_name, ' +
  'customer_phone, starts_at, ends_at, status, notes, source, party_size, ' +
  'deposit_amount, deposit_status, cancellation_policy, created_at';

const MENSAJES = {
  appt_no_overlap_resource: 'Esa mesa ya está reservada en ese horario.',
  appt_no_overlap: 'Ese profesional ya tiene un turno en ese horario.',
  appt_algo_reservado: 'La reserva necesita una mesa o un profesional.',
  resources_nombre_por_sucursal: 'Ya hay otra con ese nombre en este local.',
  resources_party_coherente: 'El máximo de personas no puede ser menor que el mínimo.',
  appt_time_valid: 'El fin tiene que ser posterior al inicio.',
};

function traducir(msg) {
  const codigo = Object.keys(MENSAJES).find(c => msg.includes(c));
  return codigo ? MENSAJES[codigo] : msg;
}

/* ─────────────────────────── Recursos y mapa ─────────────────────────── */

/** Las mesas, sillas o estaciones de un local. */
export async function fetchResources(tenantId, branchId = null, { soloActivos = true } = {}) {
  let q = supabase.from('resources').select(COLS_RESOURCE).eq('tenant_id', tenantId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (soloActivos) q = q.eq('active', true);
  const { data, error } = await q.order('zone', { nullsFirst: true }).order('name');
  if (error) {
    console.error('fetchResources:', error.message);
    return [];
  }
  return data || [];
}

/**
 * El nombre que sigue: "12" -> "13", "Barra 3" -> "Barra 4".
 *
 * Vive aca y no en el editor porque quien arma el borrador es el panel, y el
 * editor va lazy: importarla de ahi arrastraria el componente entero al chunk
 * principal y el lazy no serviria de nada.
 *
 * Devuelve vacio si el ultimo nombre no termina en numero ("Barra", "VIP"):
 * inventar "Barra2" seria peor que dejar que lo escriba la persona.
 */
export function siguienteNombre(recursos = []) {
  const nombres = recursos.map(r => String(r.name || '')).filter(Boolean);
  if (!nombres.length) return '1';
  const m = nombres[nombres.length - 1].match(/^(.*?)(\d+)$/);
  if (!m) return '';
  const [, prefijo, num] = m;
  // Se respeta el relleno de ceros: "mesa 09" sigue en "mesa 10".
  return `${prefijo}${String(Number(num) + 1).padStart(num.length, '0')}`;
}

/** Alta o edicion. Sin id crea; con id actualiza. */
export async function saveResource(tenantId, branchId, recurso) {
  const fila = {
    tenant_id: tenantId,
    branch_id: branchId,
    kind: recurso.kind || 'table',
    name: String(recurso.name || '').trim(),
    zone: recurso.zone?.trim() || null,
    capacity: Number(recurso.capacity) || 1,
    min_party: recurso.min_party ? Number(recurso.min_party) : null,
    max_party: recurso.max_party ? Number(recurso.max_party) : null,
    combinable: !!recurso.combinable,
    // El plano es opcional: la agenda funciona sin dibujarlo.
    pos_x: recurso.pos_x ?? null,
    pos_y: recurso.pos_y ?? null,
    shape: recurso.shape || null,
    width: recurso.width ?? null,
    height: recurso.height ?? null,
    active: recurso.active !== false,
  };
  if (!fila.name) return { __error: 'sin_nombre', message: 'Poné un nombre.' };

  const q = recurso.id
    ? supabase.from('resources').update(fila).eq('id', recurso.id).eq('tenant_id', tenantId)
    : supabase.from('resources').insert(fila);
  const { data, error } = await q.select(COLS_RESOURCE).single();

  if (error) {
    console.error('saveResource:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, resource: data };
}

/**
 * Guarda SOLO la posicion en el plano. Existe aparte de saveResource porque el
 * editor del mapa arrastra y suelta: mandar la fila entera en cada gesto
 * pisaria cambios de capacidad o zona hechos en otra pestaña.
 */
export async function moveResource(tenantId, id, { pos_x, pos_y }) {
  const { error } = await supabase
    .from('resources')
    .update({ pos_x, pos_y })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('moveResource:', error.message);
    return false;
  }
  return true;
}

/** Baja logica: se desactiva, no se borra. Las reservas viejas la referencian. */
export async function archiveResource(tenantId, id) {
  const { error } = await supabase
    .from('resources').update({ active: false })
    .eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('archiveResource:', error.message);
    return false;
  }
  return true;
}

/* ───────────────────────────── Reservas ─────────────────────────────── */

/** Reservas de una franja. Para el mapa: que mesa esta ocupada ahora. */
export async function fetchAppointments(tenantId, { branchId, desde, hasta } = {}) {
  let q = supabase.from('appointments').select(COLS_APPT).eq('tenant_id', tenantId);
  if (branchId) q = q.eq('branch_id', branchId);
  if (desde) q = q.gte('starts_at', desde);
  if (hasta) q = q.lte('starts_at', hasta);
  const { data, error } = await q.order('starts_at');
  if (error) {
    console.error('fetchAppointments:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Que ofrecer para una franja. Viene ordenado por el que menos capacidad
 * desperdicia: sentar a 2 en la mesa de 8 un viernes es perder la mesa de 8.
 */
export async function fetchAvailable(branchId, startsAt, endsAt, {
  kind = null, partySize = null, zone = null,
} = {}) {
  const { data, error } = await supabase.rpc('available_resources', {
    p_branch_id: branchId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_kind: kind,
    p_party_size: partySize,
    p_zone: zone,
  });
  if (error) {
    console.error('fetchAvailable:', error.message);
    return [];
  }
  return data || [];
}

/** Reservar. La mesa o el profesional: al menos uno. */
export async function createAppointment(tenantId, datos) {
  const fila = {
    tenant_id: tenantId,
    branch_id: datos.branchId || null,   // el trigger lo completa si falta
    resource_id: datos.resourceId || null,
    staff_id: datos.staffId || null,
    service_id: datos.serviceId || null,
    customer_name: datos.customerName?.trim() || null,
    customer_phone: datos.customerPhone?.trim() || null,
    starts_at: datos.startsAt,
    ends_at: datos.endsAt,
    party_size: datos.partySize ? Number(datos.partySize) : null,
    source: datos.source || 'panel',
    notes: datos.notes?.trim() || null,
    status: datos.status || 'booked',
    client_request_id: claveDeIdempotencia('reserva', [
      tenantId, datos.resourceId || null, datos.staffId || null,
      datos.startsAt, datos.endsAt, datos.customerPhone || null,
    ]),
  };

  const { data, error } = await supabase
    .from('appointments').insert(fila).select(COLS_APPT).single();

  if (error) {
    console.error('createAppointment:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('reserva');
  return { ok: true, appointment: data };
}

/**
 * Mover el estado. El flujo real de un salon:
 *   booked -> confirmed -> arrived -> in_service -> done
 * con no_show y cancelled como salidas.
 */
export async function setAppointmentStatus(tenantId, id, status) {
  const { error } = await supabase
    .from('appointments').update({ status })
    .eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('setAppointmentStatus:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true };
}

/* ──────────────────────────── Utilizacion ───────────────────────────── */

/**
 * Horas-recurso disponibles vs vendidas.
 *
 * Es la cuenta que separa un POS de una herramienta de gestion: "vendiste
 * $850.000" no dice nada que el dueño no sepa; "te quedaron 12 horas
 * productivas sin vender" si.
 */
export async function fetchUtilization(branchId, dia, { horasAbierto = 10, kind = null } = {}) {
  const { data, error } = await supabase.rpc('resource_utilization', {
    p_branch_id: branchId,
    p_day: dia,
    p_open_hours: horasAbierto,
    p_kind: kind,
  });
  if (error) {
    console.error('fetchUtilization:', error.message);
    return null;
  }
  return (data && data[0]) || null;
}

/* ─────────────────────────── Lista de espera ────────────────────────── */

const COLS_WAIT =
  'id, tenant_id, branch_id, customer_name, customer_phone, party_size, ' +
  'service_id, staff_id, zone, notes, status, promised_wait_min, created_at, ' +
  'notified_at, resolved_at, resulting_appointment_id';

/** La cola de ahora. */
export async function fetchWaitlist(tenantId, branchId, { estados = ['waiting', 'notified'] } = {}) {
  const { data, error } = await supabase
    .from('waitlist_entries').select(COLS_WAIT)
    .eq('tenant_id', tenantId).eq('branch_id', branchId)
    .in('status', estados)
    .order('created_at');
  if (error) {
    console.error('fetchWaitlist:', error.message);
    return [];
  }
  return data || [];
}

/** Anotar a alguien que espera. */
export async function addToWaitlist(tenantId, branchId, datos) {
  const fila = {
    tenant_id: tenantId,
    branch_id: branchId,
    customer_name: datos.customerName?.trim() || null,
    customer_phone: datos.customerPhone?.trim() || null,
    party_size: datos.partySize ? Number(datos.partySize) : null,
    service_id: datos.serviceId || null,
    staff_id: datos.staffId || null,
    zone: datos.zone || null,
    notes: datos.notes?.trim() || null,
    promised_wait_min: datos.promisedWaitMin ? Number(datos.promisedWaitMin) : null,
    client_request_id: claveDeIdempotencia('espera', [
      tenantId, branchId, datos.customerPhone || null,
      datos.customerName || null, datos.partySize || null,
    ]),
  };
  const { data, error } = await supabase
    .from('waitlist_entries').insert(fila).select(COLS_WAIT).single();
  if (error) {
    console.error('addToWaitlist:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('espera');
  return { ok: true, entry: data };
}

/**
 * Cerrar una espera. `left` es el estado que importa medir: es demanda perdida
 * —gente que se fue sin que la atiendan— y es un dato que hoy no registra
 * nadie.
 */
export async function resolveWaitlist(tenantId, id, status, appointmentId = null) {
  const patch = { status, resolved_at: new Date().toISOString() };
  if (status === 'notified') { patch.notified_at = patch.resolved_at; delete patch.resolved_at; }
  if (appointmentId) patch.resulting_appointment_id = appointmentId;

  const { error } = await supabase
    .from('waitlist_entries').update(patch)
    .eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('resolveWaitlist:', error.message);
    return false;
  }
  return true;
}
