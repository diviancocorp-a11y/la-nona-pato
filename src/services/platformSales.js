// src/services/platformSales.js
// Ventas del edificio (tabla `sales` + RPC `complete_order`, migracion 0032).
// ETAPA 4.
//
// `sales` existe en las dos bases; la del edificio suma `tenant_id`,
// `order_id` y `payment_method`. Por eso este archivo esta en PLATFORM_PATHS
// (scripts/check-supabase-columns.mjs).
//
// Completar un pedido NO pasa por la tabla sino por RPC: cambia el estado y
// asienta una venta por item, y eso es varias filas y es plata. En el legacy
// es un bucle de createSale desde el navegador (useOrderWorkflow) — si el
// navegador se cierra en el medio, quedan ventas de un pedido sin completar.

import { supabase } from '../lib/supabase';

const COLS = 'id, tenant_id, date, recipe_id, qty, unit_price, unit_cost, total, order_id, payment_method, created_at';

export { COLS as SELECT_COLS };

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/**
 * Las ventas del tenant, de la mas nueva a la mas vieja. Sin ventana de
 * fechas por el mismo motivo que fetchExpenses: el resumen mensual deja
 * navegar a CUALQUIER mes anterior. Cuando un negocio acumule años, esto
 * necesita paginado (el helper ya existe en services/finance.js).
 */
export async function fetchSales(tenantId) {
  exigirTenant(tenantId, 'fetchSales');
  const { data, error } = await supabase
    .from('sales')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchSales:', error.message); return []; }
  return data || [];
}

/** Devuelve array de errores (vacio = ok). */
export function validateSale(s) {
  const errs = [];
  if (!s?.recipe_id) errs.push('Falta elegir el producto');

  // Number('') y Number(null) son 0: un vacio no puede pasar como venta gratis.
  const qty = s?.qty === '' || s?.qty == null ? NaN : Number(s.qty);
  if (!Number.isFinite(qty) || qty <= 0) errs.push('La cantidad tiene que ser mayor a 0');

  const precio = s?.unit_price === '' || s?.unit_price == null ? NaN : Number(s.unit_price);
  if (!Number.isFinite(precio) || precio <= 0) errs.push('El precio tiene que ser mayor a 0');

  return errs;
}

/**
 * Registra una venta MANUAL (sin pedido). Una sola fila: no necesita RPC.
 * El `unit_cost` lo calcula el panel con la receta actual y viaja congelado —
 * si despues cambia el costo del insumo, esta venta no cambia.
 */
export async function createSale(tenantId, s) {
  exigirTenant(tenantId, 'createSale');
  const errs = validateSale(s);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const qty = Number(s.qty);
  const unitPrice = Number(s.unit_price);
  const { data, error } = await supabase
    .from('sales')
    .insert({
      tenant_id: tenantId,
      date: s.date || new Date().toISOString().slice(0, 10),
      recipe_id: s.recipe_id,
      qty,
      unit_price: unitPrice,
      unit_cost: Number(s.unit_cost) || 0,
      total: Number(s.total) || qty * unitPrice,
      payment_method: s.payment_method || null,
    })
    .select(COLS)
    .single();

  if (error) {
    console.error('createSale:', error.message);
    return { __error: 'db', message: error.message };
  }
  return data;
}

/* ────────────────────── Completar un pedido ──────────────────────── */

const MENSAJES_COMPLETAR = {
  pedido_no_encontrado: 'No se encontró el pedido',
  ya_completado: 'El pedido ya estaba completado',
  pedido_cancelado: 'Un pedido cancelado no se puede completar',
  ya_tiene_ventas: 'Este pedido ya tiene sus ventas registradas',
};

/**
 * Marca el pedido como completado y asienta sus ventas, todo en una
 * transaccion (RPC `complete_order`, security invoker — la RLS decide).
 * Devuelve `{ ok: true, sales }` o `{ __error, message }`.
 */
export async function completeOrder(orderId) {
  if (!orderId) return { __error: 'validation', message: 'Falta el pedido' };

  const { data, error } = await supabase.rpc('complete_order', { p_order_id: orderId });

  if (error) {
    console.error('completeOrder:', error.message);
    const codigo = Object.keys(MENSAJES_COMPLETAR).find(c => error.message.includes(c));
    return { __error: codigo || 'db', message: MENSAJES_COMPLETAR[codigo] || error.message };
  }
  return { ok: true, sales: data || [] };
}

/* ──────────────── Adaptadores para las pantallas legacy ──────────── */
//
// SalesView y MonthSummary son pantallas del legacy y hablan su idioma:
// `recipes` con `sale_price`, pedidos con `customer` y `order_items` con
// `recipe_id`. Estas funciones puras traducen el modelo del edificio a ese
// idioma UNA vez, en el borde — asi las pantallas se reusan sin tocarles la
// logica (regla de oro del PLAN-ERP).

/**
 * products + recetas (Map product_id -> lineas {ingredient_id, qty}) en el
 * shape de `recipes` del legacy: sale_price y lineas con `quantity`.
 */
export function productosComoRecetas(products, recetas) {
  return (products || []).map(p => ({
    id: p.id,
    name: p.name,
    sale_price: Number(p.price) || 0,
    ingredients: (recetas?.get?.(p.id) || []).map(l => ({
      ingredient_id: l.ingredient_id,
      quantity: Number(l.qty) || 0,
    })),
  }));
}

/**
 * Pedidos del edificio en el shape que espera SalesView: `customer`, `date`,
 * `payment` y `order_items` con `recipe_id`. Solo tiene sentido pasarle los
 * COMPLETADOS; los items llegan aparte (Map order_id -> items) porque el
 * panel no los carga junto con la lista.
 */
export function pedidosParaVentas(orders, itemsPorPedido) {
  return (orders || []).map(o => ({
    id: o.id,
    status: o.status,
    customer: o.customer_name || 'Sin nombre',
    phone: o.customer_phone || '',
    payment: o.payment || '—',
    total: Number(o.total) || 0,
    date: (o.created_at || '').slice(0, 10),
    completedAt: o.created_at || '',
    order_items: (itemsPorPedido?.get?.(o.id) || []).map(it => ({
      recipe_id: it.product_id,
      quantity: Number(it.qty) || 1,
      unit_price: Number(it.unit_price) || 0,
      name_snapshot: it.name_snapshot,
    })),
  }));
}
