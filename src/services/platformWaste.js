// src/services/platformWaste.js
// Merma del edificio (tabla `waste_log` + RPC `register_waste`, migracion
// 0033). Es la pieza de la Etapa 6 que completa el P&L de la Etapa 4: la
// merma cargada a mano es perdida real de stock que no pasa por pedidos.
//
// Registrar va por RPC (criterio Etapa 3: dos filas y es plata — el asiento
// y el descuento de stock). En el legacy son dos llamadas sueltas
// (registerWaste en inventory.js): si la segunda no llega, queda merma
// asentada con el stock intacto.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const COLS = 'id, tenant_id, ingredient_id, qty, reason, note, date, created_at';

export { COLS as SELECT_COLS };

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/** La merma del tenant, de la mas nueva a la mas vieja. */
export async function fetchWaste(tenantId) {
  exigirTenant(tenantId, 'fetchWaste');
  const { data, error } = await supabase
    .from('waste_log')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchWaste:', error.message); return []; }
  return data || [];
}

const MENSAJES = {
  falta_tenant: 'Falta el negocio',
  no_sos_miembro: 'No tenés permiso para cargar mermas en este negocio',
  cantidad_invalida: 'La cantidad tiene que ser mayor a 0',
  insumo_de_otro_negocio: 'Ese insumo no es de este negocio',
};

/**
 * Asienta la merma y descuenta el stock, todo en una transaccion.
 * Mismo contrato que el legacy registerWaste (bool): WasteForm no distingue
 * de donde viene el saver. El detalle del error queda en consola (el mapa
 * MENSAJES espera al dia en que el form muestre mensajes finos).
 */
export async function registerWaste(tenantId, ingredientId, qty, reason, note) {
  exigirTenant(tenantId, 'registerWaste');

  const { error } = await supabase.rpc('register_waste', {
    p_tenant_id: tenantId,
    p_ingredient_id: ingredientId,
    p_qty: Number(qty),
    p_reason: reason || 'otro',
    p_note: note || null,
    // Idempotencia (0040): un reintento con la misma clave devuelve la merma
    // ya asentada en vez de descontar el stock dos veces. La clave sale del
    // contenido: dos roturas iguales del mismo insumo siguen siendo dos
    // mermas distintas porque la clave se reinicia al guardar bien (abajo).
    p_client_request_id: claveDeIdempotencia(
      'merma', [tenantId, ingredientId, Number(qty), reason || 'otro', note || null]),
  });

  if (error) {
    // NO se reinicia la clave: si esto fue un fallo de red, el reintento tiene
    // que llevar la misma para que el server lo reconozca como el mismo envio.
    const codigo = Object.keys(MENSAJES).find(c => error.message.includes(c));
    console.error('registerWaste:', codigo ? MENSAJES[codigo] : error.message);
    return false;
  }
  // Guardo bien: lo proximo que cargue el usuario es otra merma, aunque
  // escriba exactamente lo mismo (se rompieron dos veces, pasa).
  reiniciarClave('merma');
  return true;
}
