// src/services/platformCaja.js
// Turno de caja, cobro, comanda de salon y propinas (0046 y 0047).
//
// Todo va por RPC y no por insert directo, y no es burocracia: un pago suelto
// no queda atado al turno abierto, asi que no entra en ningun arqueo y aparece
// como faltante al cerrar. La RPC es la que sabe a que turno pertenece.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const COLS_SESION =
  'id, tenant_id, branch_id, opened_by, opened_at, opening_amount, closed_at, ' +
  'closed_by, closing_amount, expected_amount, difference, status, notes, business_day';

const MENSAJES = {
  no_sos_miembro: 'No tenés acceso a este negocio.',
  sin_sucursal: 'El negocio no tiene sucursal.',
  turno_no_encontrado: 'No se encontró ese turno de caja.',
  monto_invalido: 'El monto tiene que ser mayor a cero.',
  mesa_ocupada: 'Esa mesa ya tiene una cuenta abierta.',
  mesa_de_otro_negocio: 'Esa mesa no es de este negocio.',
  pedido_no_encontrado: 'No se encontró el pedido.',
  tipo_invalido: 'Tipo de propina inválido.',
  // 0063: el tope de cobro vive en la RPC. Si llega hasta aca es porque el
  // monto se paso por otro camino que la pantalla de cobro, o porque otra
  // caja cobro el saldo en el medio.
  monto_supera_el_saldo: 'No se puede cobrar más que lo que falta del pedido.',
  pedido_ya_saldado: 'Ese pedido ya está pago.',
};

function traducir(msg) {
  const codigo = Object.keys(MENSAJES).find(c => msg.includes(c));
  return codigo ? MENSAJES[codigo] : msg;
}

/* ────────────────────────── Turno de caja ───────────────────────────── */

/** El turno abierto de una sucursal, o null si no hay ninguno. */
export async function fetchTurnoAbierto(tenantId, branchId) {
  let q = supabase.from('cash_sessions').select(COLS_SESION)
    .eq('tenant_id', tenantId).eq('status', 'open');
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error('fetchTurnoAbierto:', error.message);
    return null;
  }
  return data;
}

/** Los ultimos turnos cerrados, para ver el historial de arqueos. */
export async function fetchTurnos(tenantId, branchId, { limit = 30 } = {}) {
  let q = supabase.from('cash_sessions').select(COLS_SESION)
    .eq('tenant_id', tenantId).order('opened_at', { ascending: false }).limit(limit);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchTurnos:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Abrir el turno. Si ya hay uno abierto lo devuelve en vez de fallar: que ya
 * este abierto no es un error del cajero — probablemente lo dejo abierto el
 * turno anterior, y mostrarle un error lo dejaria sin poder trabajar.
 */
export async function abrirTurno(tenantId, branchId, montoInicial = 0, notas = null) {
  const { data, error } = await supabase.rpc('open_cash_session', {
    p_tenant_id: tenantId,
    p_branch_id: branchId || null,
    p_opening_amount: Number(montoInicial) || 0,
    p_notes: notas || null,
  });
  if (error) {
    console.error('abrirTurno:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, turno: data };
}

/** Cuanto DEBERIA haber en el cajon ahora. Solo efectivo: lo de tarjeta no
 *  esta ahi, y sumarlo haria que el arqueo diera mal siempre. */
export async function esperadoEnCaja(sessionId) {
  const { data, error } = await supabase.rpc('cash_session_expected', {
    p_session_id: sessionId,
  });
  if (error) {
    console.error('esperadoEnCaja:', error.message);
    return null;
  }
  return Number(data) || 0;
}

/**
 * Cerrar el turno con lo que el cajero CONTO.
 * La diferencia se guarda, no se corrige: un faltante es informacion, y
 * hacerlo cerrar en cero convertiria el arqueo en un tramite.
 */
export async function cerrarTurno(sessionId, montoContado, notas = null) {
  const { data, error } = await supabase.rpc('close_cash_session', {
    p_session_id: sessionId,
    p_closing_amount: Number(montoContado) || 0,
    p_notes: notas || null,
  });
  if (error) {
    console.error('cerrarTurno:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, turno: data };
}

/* ──────────────────────────── Cobrar ────────────────────────────────── */

export async function fetchMediosDePago(tenantId) {
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, tenant_id, name, kind, surcharge_pct, discount_pct, active')
    .eq('tenant_id', tenantId).eq('active', true).order('name');
  if (error) {
    console.error('fetchMediosDePago:', error.message);
    return [];
  }
  return data || [];
}

/** Lo que falta cobrar de un pedido. Decide si se puede cerrar la cuenta. */
export async function saldoDelPedido(orderId) {
  const { data, error } = await supabase.rpc('order_balance', { p_order_id: orderId });
  if (error) {
    console.error('saldoDelPedido:', error.message);
    return null;
  }
  return Number(data) || 0;
}

/**
 * Cobrar. Varios pagos del mismo pedido = cuenta dividida; no hace falta
 * partir el pedido, que romperia el vinculo con la mesa y con las ventas.
 *
 * Idempotente porque el boton de cobrar es el que mas se toca dos veces.
 */
export async function cobrar(tenantId, orderId, methodId, monto) {
  const { data, error } = await supabase.rpc('register_payment', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_method_id: methodId,
    p_amount: Number(monto),
    p_client_request_id: claveDeIdempotencia('cobro', [tenantId, orderId, methodId, Number(monto)]),
  });
  if (error) {
    // Sin reiniciar la clave: el reintento por red caida tiene que llevar la
    // misma para no cobrar dos veces.
    console.error('cobrar:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('cobro');
  return { ok: true, pago: data };
}

export async function fetchPagosDePedido(orderId) {
  const { data, error } = await supabase
    .from('payments')
    .select('id, tenant_id, order_id, method_id, amount, paid_at')
    .eq('order_id', orderId).order('paid_at');
  if (error) {
    console.error('fetchPagosDePedido:', error.message);
    return [];
  }
  return data || [];
}

/* ───────────────────────── Comanda de salon ─────────────────────────── */

/** Pasar la cuenta a otra mesa. Operacion de todos los dias en un salon. */
export async function moverCuentaDeMesa(tenantId, orderId, resourceId) {
  const { data, error } = await supabase.rpc('move_order_to_resource', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_resource_id: resourceId,
  });
  if (error) {
    console.error('moverCuentaDeMesa:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  return { ok: true, pedido: data };
}

/* ──────────────────────────── Propinas ──────────────────────────────── */

/**
 * Asentar una propina.
 *
 *   employee_direct     al alias del mozo (Dicotip). No pasa por la caja.
 *   employee_pool       entra al local y se reparte.
 *   merchant_collected  la cobra el local.
 *
 * La directa se registra igual para que el negocio tenga la estadistica, pero
 * nace liquidada: esa plata nunca entro.
 */
export async function registrarPropina(tenantId, {
  orderId, kind = 'employee_direct', monto, staffId = null, source = 'pos',
}) {
  const { data, error } = await supabase.rpc('register_tip', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_kind: kind,
    p_amount: Number(monto),
    p_staff_id: staffId,
    p_source: source,
    p_client_request_id: claveDeIdempotencia('propina', [tenantId, orderId, kind, Number(monto), staffId]),
  });
  if (error) {
    console.error('registrarPropina:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('propina');
  return { ok: true, propina: data };
}

/* ───────────────── Dicotip: el QR del ticket (publico) ──────────────── */

/**
 * Lo que ve quien escanea el QR impreso en el ticket.
 * Por SLUG y no por id de negocio: lo abre alguien SIN sesion y el slug ya
 * viaja en la URL.
 */
export async function fetchDestinoPropina(tenantSlug, orderId) {
  const { data, error } = await supabase.rpc('get_tip_target', {
    p_tenant_slug: tenantSlug,
    p_order_id: orderId,
  });
  if (error) {
    console.error('fetchDestinoPropina:', error.message);
    return null;
  }
  return data;
}

/** Dejar la resena desde el QR. Anonima y una por pedido. */
export async function dejarResena(tenantSlug, orderId, rating, comentario = null) {
  const { data, error } = await supabase.rpc('submit_service_review', {
    p_tenant_slug: tenantSlug,
    p_order_id: orderId,
    p_rating: Number(rating),
    p_comment: comentario || null,
    p_client_request_id: claveDeIdempotencia('resena', [tenantSlug, orderId]),
  });
  if (error) {
    console.error('dejarResena:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('resena');
  return { ok: true, ...(data || {}) };
}

/** Como viene atendiendo cada uno: lo que factura y como lo califican. */
export async function fetchResenas(tenantId, { staffId = null, limit = 50 } = {}) {
  let q = supabase.from('service_reviews')
    .select('id, tenant_id, branch_id, order_id, staff_id, rating, comment, created_at')
    .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchResenas:', error.message);
    return [];
  }
  return data || [];
}
