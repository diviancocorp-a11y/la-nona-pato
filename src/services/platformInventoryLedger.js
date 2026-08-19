// src/services/platformInventoryLedger.js
// El libro del stock (migracion 0042) y las sucursales (0041).
//
// Por que existe este archivo y no se metio en platformInventory.js: aquel
// lee y escribe `ingredients`, que es el NUMERO. Este lee el LIBRO, que es
// otra fuente. Mientras conviven —y conviven a proposito hasta que el libro
// este comparado contra el numero viejo— tenerlos separados hace obvio cual
// se esta usando en cada pantalla.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const MENSAJES = {
  no_sos_miembro: 'No tenés acceso a este negocio.',
  insumo_de_otro_negocio: 'Ese insumo no es de este negocio.',
  variante_de_otro_negocio: 'Esa variante no es de este negocio.',
  sucursal_de_otro_negocio: 'Esa sucursal no es de este negocio.',
  falta_tenant: 'Falta el negocio.',
};

function traducir(msg) {
  const codigo = Object.keys(MENSAJES).find(c => msg.includes(c));
  return codigo ? MENSAJES[codigo] : msg;
}

/* ───────────────────────────── Sucursales ───────────────────────────── */

/** Los locales del negocio. Todo tenant tiene al menos uno (0041). */
export async function fetchBranches(tenantId) {
  const { data, error } = await supabase
    .from('branches')
    .select('id, tenant_id, name, address, phone, timezone, day_cutoff_hour, is_default, active')
    .eq('tenant_id', tenantId)
    .order('is_default', { ascending: false })
    .order('name');
  if (error) {
    console.error('fetchBranches:', error.message);
    return [];
  }
  return data || [];
}

/**
 * La sucursal por defecto: a donde va lo que no dice sucursal.
 * Es la unica que existe hasta que el negocio cree la segunda, y por eso el
 * panel no muestra selector mientras `fetchBranches` devuelva una sola.
 */
export async function fetchDefaultBranch(tenantId) {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name, timezone, day_cutoff_hour')
    .eq('tenant_id', tenantId)
    .eq('is_default', true)
    .maybeSingle();
  if (error) {
    console.error('fetchDefaultBranch:', error.message);
    return null;
  }
  return data;
}

/* ────────────────────────────── El libro ────────────────────────────── */

/**
 * Saldos por sucursal, del libro y no de `ingredients.stock`.
 * @returns {Promise<Array>} filas de inventory_balances
 */
export async function fetchBalances(tenantId, branchId = null) {
  let q = supabase
    .from('inventory_balances')
    .select('tenant_id, branch_id, ingredient_id, variant_id, qty, updated_at')
    .eq('tenant_id', tenantId);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchBalances:', error.message);
    return [];
  }
  return data || [];
}

/** Los ultimos movimientos, para la pantalla de "que paso con el stock". */
export async function fetchMovements(tenantId, { ingredientId, branchId, limit = 100 } = {}) {
  let q = supabase
    .from('inventory_movements')
    .select('id, tenant_id, branch_id, ingredient_id, variant_id, kind, qty, unit_cost, reference_type, reference_id, note, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (ingredientId) q = q.eq('ingredient_id', ingredientId);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchMovements:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Por que el stock dice lo que dice: el desglose por tipo de movimiento.
 * Es la pregunta que antes no se podia contestar.
 * @returns {Promise<Array<{kind: string, total: number, movimientos: number}>>}
 */
export async function fetchStockExplicado(tenantId, ingredientId, branchId = null) {
  const { data, error } = await supabase.rpc('stock_explicado', {
    p_tenant_id: tenantId,
    p_ingredient_id: ingredientId,
    p_branch_id: branchId,
  });
  if (error) {
    console.error('fetchStockExplicado:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ajuste manual de stock: lo que sale de un conteo fisico.
 * La cantidad va FIRMADA — negativa saca, positiva agrega — porque el libro
 * guarda el signo y no lo deriva del tipo.
 */
export async function ajustarStock({
  tenantId, ingredientId = null, variantId = null, branchId = null,
  qty, note = null,
}) {
  const cantidad = Number(qty);
  if (!cantidad) return { __error: 'cantidad_invalida', message: 'La cantidad no puede ser 0.' };

  const { data, error } = await supabase.rpc('register_stock_movement', {
    p_tenant_id: tenantId,
    p_kind: 'adjustment',
    p_qty: cantidad,
    p_ingredient_id: ingredientId,
    p_variant_id: variantId,
    p_branch_id: branchId,
    p_unit_cost: null,
    p_reference_type: 'manual',
    p_reference_id: null,
    p_note: note || null,
    p_client_request_id: claveDeIdempotencia(
      'ajuste', [tenantId, ingredientId, variantId, branchId, cantidad, note || null]),
  });

  if (error) {
    // Sin reiniciar la clave: un reintento por red caida tiene que llevar la
    // misma para no ajustar dos veces.
    console.error('ajustarStock:', error.message);
    return { __error: 'db', message: traducir(error.message) };
  }
  reiniciarClave('ajuste');
  return { ok: true, movimiento: data };
}
