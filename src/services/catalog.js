// src/services/catalog.js
import { supabase } from '../lib/supabase';
import { OrderInputSchema, CouponValidateSchema, validateInput } from '../lib/schemas/index.js';
import { setGuestUser } from '../lib/guestUser.js';
import { resolveTenantSlug } from '../lib/activeTenant.js';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';
import business from '@business';

/**
 * Trae los datos que necesita el catálogo público:
 * - La configuración del negocio (nombre, logo, color)
 * - Los productos/recetas que tienen visible = true
 *
 * Retorna: { settings: {...}, products: [...] }
 * Si hay error, retorna null
 */
/**
 * Fetch catalog data: settings + visible products + server time.
 * Direct Supabase queries — la edge function get-catalog no se deployó,
 * y las queries directas son suficientemente rápidas con los indexes.
 */
export async function fetchCatalog() {
  try {
    // Plataforma multi-tenant (edificio): un solo RPC devuelve settings+products
    // ya con el shape que espera catalog-pro. El resto del archivo (modelo viejo
    // single-tenant sobre `recipes`) queda intacto para los clients legacy.
    if (business.platform) {
      // El tenant sale del HOSTNAME, no del build: un mismo bundle sirve a
      // todos. business.slug queda solo como fallback de dev/preview.
      const slug = await resolveTenantSlug();
      if (!slug) {
        // Raiz de la plataforma (divianco.app): no hay catalogo que mostrar,
        // va la landing. No es un error.
        return null;
      }
      const { data, error } = await supabase.rpc('get_catalog', { p_tenant_slug: slug });
      if (error || !data) {
        console.error('get_catalog RPC error:', error?.message);
        return null;
      }
      return {
        settings: data.settings || {},
        products: data.products || [],
        serverNow: data.serverNow || new Date().toISOString(),
      };
    }

    const { data: settingsRows, error: settErr } = await supabase
      .from('settings')
      .select('*')
      .limit(1);

    if (settErr) {
      console.error('Error cargando settings:', settErr.message);
      return null;
    }

    const settings = settingsRows?.[0] || {
      biz_name: business.name,
      logo_letter: business.logoLetter,
      logo_color: business.logoColor,
      cover_url: business.defaultSettings.cover_url,
    };

    // Defense in depth: si alguna columna nueva no existe en un tenant,
    // intentar el select completo PRIMERO; si falla, fallback al minimo
    // garantizado. Asi el catalogo nunca queda vacio por una migration
    // no aplicada en algun tenant.
    let products = null;
    let prodErr = null;
    {
      const res = await supabase
        .from('recipes')
        .select('id, name, category, sale_price, image_url, description, related_ids, is_vegetarian, requires_age_gate, is_combo, discount_pct, sold_out_override, created_at')
        .eq('visible', true)
        .eq('is_archived', false)
        .order('category', { ascending: true });
      products = res.data;
      prodErr = res.error;
    }
    if (prodErr) {
      console.warn('Fetch productos con columnas extra fallo, fallback al minimo:', prodErr.message);
      const res = await supabase
        .from('recipes')
        .select('id, name, category, sale_price, image_url, description, related_ids')
        .eq('visible', true)
        .eq('is_archived', false)
        .order('category', { ascending: true });
      products = res.data;
      if (res.error) {
        console.error('Error cargando productos:', res.error.message);
        return null;
      }
    }

    // Enriquecer con sale_count desde la vista materializada (silently fail).
    try {
      const { data: counts } = await supabase
        .from('recipe_sale_counts')
        .select('recipe_id, sale_count');
      if (counts && Array.isArray(counts)) {
        const byId = new Map(counts.map(c => [c.recipe_id, c.sale_count]));
        for (const p of products || []) {
          p.sale_count = byId.get(p.id) || 0;
        }
      }
    } catch (e) {
      // Si la vista no existe en este tenant, no rompemos el catalogo.
      console.warn('recipe_sale_counts no disponible:', e?.message);
    }

    let serverNow = new Date().toISOString();
    try {
      const { data: timeData, error: timeErr } = await supabase.rpc('get_server_time');
      if (!timeErr && timeData) serverNow = timeData;
    } catch {
      console.warn('get_server_time RPC no disponible, usando hora local');
    }

    return { settings, products: products || [], serverNow };
  } catch (err) {
    console.error('Error inesperado en fetchCatalog:', err);
    return null;
  }
}

// Lo que hace que dos envios sean "el mismo pedido": quien, como y que. No
// entra el timestamp a proposito — si entrara, un reintento seria un pedido
// nuevo y la garantia no serviria para nada.
function firmaDelPedido(p) {
  return [
    p.phone, p.delivery, p.payment, p.address,
    (p.items || []).map(i => [i.recipeId, i.qty]),
    p.coupon_code, p.tip_pct, p.delivery_cost,
  ];
}

/**
 * Envía un pedido nuevo via Edge Function server-side.
 * El servidor calcula precios, valida cupones y gestiona el CRM.
 * El cliente solo envía: nombre, teléfono, items (recipeId + qty), y preferencias de entrega/pago.
 *
 * SEGURIDAD: El cliente NO envía precios. Los precios se calculan server-side
 * usando el catálogo de la DB + deals del día. Esto previene manipulación de precios.
 *
 * @param {Object} orderData - Los datos del pedido:
 *   { customer, phone, email, delivery, payment, note, items: [{recipeId, qty}],
 *     coupon_code?, is_gift?, gift_note?, delivery_date?, user_id?,
 *     address?, delivery_cost?, tip_pct? }
 *
 * @returns {{ ok: boolean, orderId: string|null }}
 */
export async function submitOrder(orderData) {
  try {
    // Validar inputs con Zod antes de enviar al servidor
    const validation = validateInput(OrderInputSchema, orderData, 'submitOrder');
    if (!validation.ok) {
      console.error('submitOrder validation failed:', validation.errors);
      return { ok: false, orderId: null, errors: validation.errors };
    }
    const validated = validation.data;

    // Edificio multi-tenant: sin tenant_slug la function rechaza el pedido
    // (400). Sale del hostname igual que el catalogo — si el pedido se armo
    // mirando cochi.divianco.app, tiene que entrar en cochi. Los clients
    // legacy no lo mandan y su submit-order lo ignora.
    const tenantSlug = business.platform ? await resolveTenantSlug() : null;

    // Llamar a la Edge Function que calcula todo server-side
    const { data, error } = await supabase.functions.invoke('submit-order', {
      body: {
        ...(tenantSlug ? { tenant_slug: tenantSlug } : {}),
        customer: validated.customer,
        phone: validated.phone,
        email: validated.email,
        delivery: validated.delivery,
        payment: validated.payment,
        payment_account_id: validated.payment_account_id || null,
        note: validated.note,
        items: validated.items.map(item => ({ recipeId: item.recipeId, qty: item.qty })),
        coupon_code: validated.coupon_code || null,
        is_gift: validated.is_gift || false,
        gift_note: validated.gift_note || '',
        delivery_date: validated.delivery_date || null,
        user_id: validated.user_id || null,
        // address y delivery_cost DEBEN ir validados (Zod) — ver bug Zod-strip #5
        address: validated.address || null,
        delivery_cost: validated.delivery_cost || 0,
        tip_pct: validated.tip_pct || 0,
        client_request_id: claveDeIdempotencia('checkout', firmaDelPedido(validated)),
      },
    });

    if (error) {
      // FunctionsHttpError: el mensaje util del server (429 rate limit,
      // "producto no disponible", "cuenta de pago no valida") viene en
      // error.context — propagarlo para que el checkout lo muestre (Sprint 4).
      let serverMsg = null;
      try {
        if (error.context && typeof error.context.json === 'function') {
          const body = await error.context.json();
          serverMsg = body?.error || null;
        }
      } catch { /* body no-json: usamos generico */ }
      console.error('submitOrder edge function error:', serverMsg || error);
      return { ok: false, orderId: null, error: serverMsg };
    }

    if (!data?.ok) {
      console.error('submitOrder server error:', data?.error);
      return { ok: false, orderId: null, error: data?.error || null };
    }

    // El pedido entro (o ya estaba). Lo proximo que arme este cliente es un
    // pedido nuevo, aunque repita exactamente los mismos items.
    reiniciarClave('checkout');

    // Upsert al CRM (tabla customers) con dedup-aware: busca por phone
    // primero, despues por email. Centraliza la identidad para el guest
    // y reusa la misma fila si el cliente vuelve con otro metodo.
    let customerId = null;
    try {
      const { data: cid } = await supabase.rpc('upsert_customer', {
        p_phone: validated.phone || null,
        p_email: validated.email || null,
        p_name:  validated.customer || null,
        p_birth_date: orderData.birth_date || null,
      });
      customerId = cid || null;
    } catch (e) {
      console.warn('upsert_customer fallo (no bloquea):', e?.message);
    }

    // Persistir identidad guest: el usuario ya tiene al menos 1 pedido,
    // queda "registrado" para ver ranking/preferencias sin volver a loguearse.
    setGuestUser({
      id: customerId,
      name: validated.customer,
      phone: validated.phone,
      email: validated.email,
    });

    // Sync backup de clientes — diferido 5s para no bloquear UI post-pedido
    setTimeout(() => syncCustomerBackup(), 5000);

    // Notificar cliente nuevo via Edge Function (silencioso, no bloquea)
    supabase.functions.invoke('notify-new-customer', {
      body: { orderId: data.orderId },
    }).catch(() => {}); // fire-and-forget

    return { ok: true, orderId: data.orderId };

  } catch (err) {
    console.error('Error inesperado en submitOrder:', err);
    return { ok: false, orderId: null };
  }
}

// ─── SYNC CUSTOMER BACKUP (automático, silencioso) ───
// Consolida clientes desde orders y sube CSV al bucket privado "backups"
// Se ejecuta después de cada pedido exitoso. Si falla, no bloquea nada.
async function syncCustomerBackup() {
  try {
    const { data: orders } = await supabase
      .from('orders')
      .select('customer, phone, email, total, status, created_at, delivery, payment, delivery_address')
      .order('created_at', { ascending: false });
    if (!orders || orders.length === 0) return;

    // Consolidar clientes únicos
    const map = {};
    orders.forEach(o => {
      const key = (o.phone || o.email || o.customer || '').toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = {
        nombre: '', telefono: '', email: '',
        pedidos: 0, total_gastado: 0, ultimo_pedido: '',
        direccion: '', metodo_pago: '', metodo_entrega: ''
      };
      const c = map[key];
      c.pedidos++;
      c.total_gastado += (o.total || 0);
      if (!c.nombre && o.customer) c.nombre = o.customer;
      if (!c.telefono && o.phone) c.telefono = o.phone;
      if (!c.email && o.email) c.email = o.email;
      if (!c.direccion && o.address) c.direccion = o.address;
      if (o.created_at > c.ultimo_pedido) {
        c.ultimo_pedido = o.created_at;
        c.metodo_pago = o.payment || '';
        c.metodo_entrega = o.delivery || '';
      }
    });

    const customers = Object.values(map).sort((a, b) => b.total_gastado - a.total_gastado);

    // Generar CSV con BOM para Excel
    const esc = (v) => {
      const s = String(v || '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const hdr = 'Nombre,Teléfono,Email,Pedidos,Total Gastado,Último Pedido,Dirección,Método Pago,Método Entrega';
    const rows = customers.map(c =>
      [esc(c.nombre), esc(c.telefono), esc(c.email), c.pedidos, c.total_gastado,
       esc(c.ultimo_pedido?.split('T')[0] || ''), esc(c.direccion), esc(c.metodo_pago), esc(c.metodo_entrega)].join(',')
    );
    const csv = '\uFEFF' + hdr + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    // Subir al bucket privado "backups" (sobreescribe el anterior)
    await supabase.storage
      .from('backups')
      .upload('clientes/clientes_export.csv', blob, { upsert: true, contentType: 'text/csv' });
  } catch (e) {
    // Silencioso — nunca debe bloquear el flujo del pedido
    console.warn('syncCustomerBackup (non-blocking):', e?.message || e);
  }
}

export async function validateCouponPublic(code, email) {
  try {
    const validation = validateInput(CouponValidateSchema, { code, email }, 'validateCouponPublic');
    if (!validation.ok) return null;
    const { code: cleanCode, email: cleanEmail } = validation.data;

    const { data, error } = await supabase
      .from('coupons')
      .select('id, code, discount_pct, email, used, expires_at')
      .eq('code', cleanCode.toUpperCase().trim())
      .eq('used', false)
      .single();
    if (error || !data) return null;
    if (data.email && cleanEmail && data.email.toLowerCase() !== cleanEmail.toLowerCase()) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
    return { id: data.id, discount_pct: data.discount_pct };
  } catch (err) {
    console.error('Error en validateCouponPublic:', err);
    return null;
  }
}
