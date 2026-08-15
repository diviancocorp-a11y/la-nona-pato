// src/services/platformAdmin.js
// Capa de datos del panel del EDIFICIO (plataforma multi-tenant).
//
// Es deliberadamente delgada y NO comparte nada con los services legacy
// (recipes.js, orders.js, inventory.js), que hablan con el schema viejo
// (recipes/ingredients/settings) que en el edificio no existe.
//
// Seguridad: el aislamiento entre tenants NO lo hace este archivo, lo hacen
// las policies RLS (`tenant_id in (select private.current_user_tenants())`).
// Aca el tenant_id se manda solo porque el INSERT lo necesita para pasar el
// with_check; si alguien mandara otro, la policy lo rechaza.
//
// Nota sobre el pre-commit: `check-supabase-columns.mjs` valida las columnas
// contra scripts/supabase-schema.json, que describe el schema LEGACY. Las
// tablas del edificio que el legacy no conoce (products, tenants,
// tenant_members) el checker las saltea solo. `orders` SI existe en el legacy,
// asi que las columnas que se piden abajo son a proposito el subconjunto que
// ambos comparten. `order_items` diverge (name_snapshot, product_id), por eso
// va con select('*').

import { supabase } from '../lib/supabase';
import { resolveTenantSlug } from '../lib/activeTenant';

/* ─────────────────────── Estados de pedido ─────────────────────── */

// Vocabulario del edificio. `pending_payment` es el unico que no existe en el
// legacy: lo escribe submit-order cuando el pago va por MercadoPago y todavia
// no volvio la confirmacion.
export const PlatformOrderStatus = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  NEW: 'new',
  PREPARING: 'preparing',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const PLATFORM_ORDER_STATUSES = Object.values(PlatformOrderStatus);

// Estados que siguen "en juego" para el operador.
export const OPEN_ORDER_STATUSES = [
  PlatformOrderStatus.PENDING_PAYMENT,
  PlatformOrderStatus.NEW,
  PlatformOrderStatus.PREPARING,
  PlatformOrderStatus.ACTIVE,
];

// Que boton de avance corresponde a cada estado. null = no avanza mas.
const NEXT_STATUS = {
  [PlatformOrderStatus.PENDING_PAYMENT]: PlatformOrderStatus.NEW,
  [PlatformOrderStatus.NEW]: PlatformOrderStatus.PREPARING,
  [PlatformOrderStatus.PREPARING]: PlatformOrderStatus.ACTIVE,
  [PlatformOrderStatus.ACTIVE]: PlatformOrderStatus.COMPLETED,
  [PlatformOrderStatus.COMPLETED]: null,
  [PlatformOrderStatus.CANCELLED]: null,
};

export function nextOrderStatus(status) {
  return NEXT_STATUS[status] ?? null;
}

/* ─────────────────────── Tenant + membresia ─────────────────────── */

/**
 * Que tenant es este host y que rol tiene el usuario logueado en el.
 *
 * Una sola consulta hace las dos cosas: la policy de `tenants` solo devuelve
 * filas de tenants donde el usuario es miembro, asi que "no vino fila" ya
 * significa "no tiene acceso" — no hay que chequearlo aparte en el cliente.
 *
 * @returns {Promise<{ tenant: object|null, role: string|null, reason: string|null }>}
 *   reason: 'no-slug' (host sin tenant) | 'not-member' | 'error' | null (ok)
 */
export async function fetchMyTenant() {
  const slug = await resolveTenantSlug();
  if (!slug) return { tenant: null, role: null, reason: 'no-slug' };

  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, vertical, status, settings, tenant_members(role)')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('fetchMyTenant:', error.message);
    return { tenant: null, role: null, reason: 'error' };
  }
  if (!data) return { tenant: null, role: null, reason: 'not-member' };

  const { tenant_members: members, ...tenant } = data;
  return { tenant, role: members?.[0]?.role || null, reason: null };
}

/* ─────────────────────────── Productos ─────────────────────────── */

const PRODUCT_COLS = 'id, type, name, price, active, category, description, image_url, requires_age_gate, duration_min, stock, created_at';

/** Tipo por defecto segun el rubro. Un servicio de barberia no es un producto. */
export function defaultProductType(vertical) {
  return vertical === 'barber' ? 'service' : 'simple';
}

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLS)
    .order('category', { nullsFirst: false })
    .order('name');
  if (error) { console.error('fetchProducts:', error.message); return []; }
  return data || [];
}

/**
 * Valida lo que el formulario manda. Devuelve array de errores (vacio = ok).
 * Se valida aca y no con Zod a proposito: los schemas de src/lib/schemas
 * describen el schema legacy y estan atados al manifest del pre-commit.
 */
export function validateProduct(p) {
  const errs = [];
  if (!p?.name?.trim()) errs.push('El nombre no puede estar vacio');
  if (p?.name && p.name.trim().length > 120) errs.push('El nombre es demasiado largo');
  // Ojo con el vacio: Number('') es 0, asi que un precio en blanco pasaria
  // como gratis y el producto saldria publicado a $0 sin avisar.
  const raw = p?.price;
  const price = raw === '' || raw == null ? NaN : Number(raw);
  if (!Number.isFinite(price) || price < 0) errs.push('El precio tiene que ser un numero de 0 o mas');
  if (p?.duration_min != null && p.duration_min !== '' && !(Number(p.duration_min) > 0)) {
    errs.push('La duracion tiene que ser mayor a 0');
  }
  return errs;
}

/** Deja el payload con los tipos que espera la DB (y sin campos de UI). */
function toRow(p, tenantId) {
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    ...(p.id ? { id: p.id } : {}),
    tenant_id: tenantId,
    type: p.type || 'simple',
    name: p.name.trim(),
    price: Number(p.price) || 0,
    active: p.active !== false,
    category: p.category?.trim() || null,
    description: p.description?.trim() || null,
    image_url: p.image_url?.trim() || null,
    requires_age_gate: !!p.requires_age_gate,
    duration_min: num(p.duration_min),
    stock: num(p.stock),
  };
}

export async function upsertProduct(tenantId, product) {
  const errs = validateProduct(product);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const { data, error } = await supabase
    .from('products')
    .upsert(toRow(product, tenantId))
    .select(PRODUCT_COLS)
    .single();

  if (error) {
    console.error('upsertProduct:', error.message);
    return { __error: 'db', message: error.message };
  }
  return data;
}

export async function setProductActive(id, active) {
  const { error } = await supabase.from('products').update({ active }).eq('id', id);
  if (error) { console.error('setProductActive:', error.message); return false; }
  return true;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    console.error('deleteProduct:', error.message);
    // FK desde order_items: el producto ya se vendio y no se puede borrar.
    if (error.code === '23503') {
      return { __error: 'fk', message: 'Ese producto ya tiene pedidos. Desactivalo en vez de borrarlo.' };
    }
    return { __error: 'db', message: error.message };
  }
  return true;
}

/** Categorias existentes, para sugerir en el formulario. */
export function categoriesFrom(products) {
  return [...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ──────────────────────────── Pedidos ──────────────────────────── */

// Subconjunto compartido con el schema legacy (ver nota de arriba).
const ORDER_COLS = 'id, created_at, status, customer_name, customer_phone, customer_email, total, subtotal, discount, delivery, delivery_address, delivery_cost, delivery_date, payment, note, is_gift, gift_note, tip_amount';

export async function fetchOrders({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('fetchOrders:', error.message); return []; }
  return data || [];
}

/** Items de un pedido. select('*') porque el shape diverge del legacy. */
export async function fetchOrderItems(orderId) {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);
  if (error) { console.error('fetchOrderItems:', error.message); return []; }
  return data || [];
}

export async function setOrderStatus(id, status) {
  if (!PLATFORM_ORDER_STATUSES.includes(status)) {
    return { __error: 'validation', message: `Estado invalido: ${status}` };
  }
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) {
    console.error('setOrderStatus:', error.message);
    return { __error: 'db', message: error.message };
  }
  return true;
}
