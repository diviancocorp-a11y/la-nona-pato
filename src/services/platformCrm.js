// src/services/platformCrm.js
// Clientes del edificio. ETAPA 5a.
//
// SIN tabla nueva, y eso es una correccion al plan: el CRM del legacy no lee
// una tabla de clientes — agrega sobre `orders` (services/crm.js), y los
// pedidos del edificio ya traen nombre, telefono, email y direccion. Las
// tablas `addresses` y `favorites` que listaba el plan son de OTRA mitad: la
// cuenta del comprador en el catalogo (AuthContext/MyAccount), que es la
// Etapa 5b. Mismo caso que `purchases` en la Etapa 3: antes de portar una
// tabla, mirar quien la escribe.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';

const COLS = 'customer_name, customer_phone, customer_email, total, status, created_at, delivery_address';

export { COLS as SELECT_COLS };

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/**
 * Agrega pedidos en clientes, con el shape que espera CRM.jsx (el del
 * legacy: name/phone/email). Funcion pura, misma logica que el
 * fetchCustomerStats viejo: la clave es telefono > email > nombre, y la
 * direccion es la del pedido MAS RECIENTE que tenga una.
 *
 * `birth_date` y `age` quedan en null: el flujo de cumpleanos (tabla
 * customers + edge function birthday-gift) no existe en el edificio.
 */
export function agregarClientes(pedidos) {
  const map = {};
  for (const o of pedidos || []) {
    const key = o.customer_phone || o.customer_email || o.customer_name;
    if (!key) continue;
    if (!map[key]) {
      map[key] = {
        name: o.customer_name || '',
        phone: o.customer_phone || '',
        email: o.customer_email || '',
        orders: 0,
        total: 0,
        last_order: '',
        // La PRIMERA compra, para poder calcular cada cuanto vuelve cada uno.
        // Sin esto solo se puede decir "hace mucho que no viene", que no
        // distingue al que compra cada semana del que compra cada trimestre
        // (Dico, oportunidad `fuera-de-frecuencia`).
        first_order: '',
        address: '',
        birth_date: null,
      };
    }
    const c = map[key];
    c.orders++;
    c.total += (o.total || 0);
    if (!c.name && o.customer_name) c.name = o.customer_name;
    if (!c.phone && o.customer_phone) c.phone = o.customer_phone;
    if (!c.email && o.customer_email) c.email = o.customer_email;
    if (o.delivery_address && (!c.last_order || o.created_at > c.last_order)) {
      c.address = o.delivery_address;
    }
    if (o.created_at > c.last_order) c.last_order = o.created_at;
    if (!c.first_order || o.created_at < c.first_order) c.first_order = o.created_at;
  }

  const ahora = new Date();
  for (const c of Object.values(map)) {
    c.days_since_last_order = c.last_order
      ? Math.floor((ahora - new Date(c.last_order)) / (1000 * 60 * 60 * 24))
      : null;
    c.age = null;
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Los clientes del tenant, agregados desde TODOS sus pedidos no cancelados.
 * Consulta propia (sin limite) a proposito: el panel carga los ultimos 100
 * pedidos para la operacion diaria, pero el CRM necesita la historia entera
 * o el "total gastado" de un cliente viejo mentiria.
 */
export async function fetchCustomerStats(tenantId) {
  exigirTenant(tenantId, 'fetchCustomerStats');
  const { data, error } = await supabase
    .from('orders')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
  if (error) { console.error('fetchCustomerStats:', error.message); return []; }
  return agregarClientes(data || []);
}

/**
 * Pedidos del edificio en el idioma que habla CRM.jsx (customer/phone/email).
 * Los usa para la tendencia por cliente y el desglose de medios de pago.
 * Funcion pura, misma familia que pedidosParaVentas.
 */
export function pedidosParaCrm(orders) {
  return (orders || []).map(o => ({
    customer: o.customer_name || '',
    phone: o.customer_phone || '',
    email: o.customer_email || '',
    total: Number(o.total) || 0,
    status: o.status,
    payment: o.payment,
    created_at: o.created_at,
  }));
}
