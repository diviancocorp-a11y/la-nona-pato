// submit-order del EDIFICIO (multi-tenant).
//
// Por que no se reuso supabase/functions/submit-order tal cual: esa version
// resuelve todo contra el modelo single-tenant (settings id=1, recipes,
// customers, recipe_ingredients), y ninguna de esas tablas existe aca.
// Diferencias de fondo:
//   - recibe tenant_slug y resuelve tenant_id; TODA escritura lo lleva
//   - la config sale de tenants.settings jsonb, no de una tabla settings
//   - valida precios contra products (no recipes)
//   - cupones scopeados por tenant (unique (tenant_id, upper(code)))
//   - unit_cost se CONGELA aca al crear el pedido (Etapa 4): sale de la
//     receta actual (product_ingredients x ingredients.cost). Si despues
//     cambia el costo de un insumo, lo que costo producir ESTE pedido no
//     cambia. Un producto sin receta queda en 0 y complete_order lo
//     reintenta al completar.
//
// Se despliega con verify_jwt=false (bug #6 de CLAUDE.md): las keys
// sb_publishable_ no son JWT y el gateway las rechazaria para invitados.
// La proteccion real es el rate limit por IP + validacion server-side.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function getClientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Rate limit por IP, ANTES de tocar la DB de negocio ──────────
    const clientIp = getClientIp(req);
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `submit-order:${clientIp}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (allowed === false) {
      return jsonRes({ error: "Demasiados pedidos. Espera un momento antes de intentar de nuevo." }, 429, { "Retry-After": "60" });
    }

    const body = await req.json();

    // ── Tenant: sin esto no se escribe nada ─────────────────────────
    const tenantSlug = (body.tenant_slug || "").trim().toLowerCase();
    if (!tenantSlug) return jsonRes({ error: "Falta tenant_slug" }, 400);

    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, settings")
      .eq("slug", tenantSlug)
      .single();
    if (tenantErr || !tenant) return jsonRes({ error: "Local no encontrado" }, 404);

    const tenantId = tenant.id;
    const cfg = tenant.settings || {};

    // ── Deal del dia por categoria (misma logica que el legacy) ─────
    const catGroups = cfg.cat_groups || [];
    const dailyDeals = cfg.daily_deals || {};
    const dealPct = cfg.deal_pct ?? 15;
    const subToParent: Record<string, string> = {};
    for (const g of catGroups) {
      for (const s of (g.subs || [])) subToParent[s] = g.name;
    }
    function hasDealToday(category: string) {
      const parentCat = subToParent[category] || category;
      const now = new Date();
      const argentinaOffset = -3 * 60;
      const argentinaTime = new Date(now.getTime() + (argentinaOffset + now.getTimezoneOffset()) * 60000);
      const dayOfWeek = argentinaTime.getDay();
      const dealDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      return (dailyDeals[String(dealDay)] || []).includes(parentCat);
    }

    // ── Datos del cliente ───────────────────────────────────────────
    const customer = (body.customer || "").trim().slice(0, 200);
    const phone = (body.phone || "").replace(/\D/g, "").slice(0, 20);
    const email = body.email ? body.email.trim().toLowerCase().slice(0, 200) : null;
    if (!customer || !phone) {
      return jsonRes({ error: "Faltan datos: nombre y telefono son obligatorios" }, 400);
    }

    const delivery = ["retiro", "envio"].includes(body.delivery) ? body.delivery : "retiro";

    // ── Medio de pago: el snapshot lo arma el server (anti-spoof) ────
    const paymentAccounts = Array.isArray(cfg.payment_accounts) ? cfg.payment_accounts : [];
    let payment = "efectivo";
    let paymentAccountId: string | null = null;
    let paymentAccountSnapshot: Record<string, string> | null = null;
    if (body.payment_account_id) {
      const acc = paymentAccounts.find((a: Record<string, unknown>) =>
        a.id === body.payment_account_id
        && a.active !== false
        && (a.scope ?? "ambos") !== "proveedores");
      if (!acc) return jsonRes({ error: "Cuenta de pago no valida" }, 400);
      payment = "transferencia";
      paymentAccountId = acc.id;
      paymentAccountSnapshot = {
        id: acc.id, label: acc.label || "", banco: acc.banco || "",
        titular: acc.titular || "", alias: acc.alias || "", cbu: acc.cbu || "",
      };
    } else if (["efectivo", "transferencia", "mercadopago", "tarjeta"].includes(body.payment)) {
      payment = body.payment;
    }
    // MercadoPago nace pending_payment: mp-webhook la pasa a 'new' al aprobar.
    const isMP = payment === "mercadopago";

    const note = body.note ? String(body.note).trim().slice(0, 500) : null;
    const isGift = body.is_gift === true;
    const giftNote = body.gift_note ? String(body.gift_note).trim().slice(0, 300) : "";
    const deliveryDate = body.delivery_date || null;
    const userId = body.user_id || null;
    const address = body.address ? String(body.address).trim().slice(0, 500) : null;

    // Costo de envio clampeado server-side: el server no conoce la distancia
    // (el geocoding es client-side) pero ningun envio puede salir mas que el
    // escalon mas caro que configuro el tenant.
    const pricingTable = Array.isArray(cfg.delivery_pricing) ? cfg.delivery_pricing : [];
    const maxDeliveryCost = pricingTable.length > 0
      ? Math.max(...pricingTable.map((s: Record<string, unknown>) => Number(s?.cost) || 0))
      : 50000;
    const deliveryCost = delivery === "envio"
      ? Math.max(0, Math.min(maxDeliveryCost, Math.round(Number(body.delivery_cost) || 0)))
      : 0;

    const tipPct = Math.max(0, Math.min(100, Number(body.tip_pct) || 0));

    // ── Items: se revalidan TODOS los precios contra la DB ──────────
    const items = body.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return jsonRes({ error: "El pedido debe tener entre 1 y 50 productos" }, 400);
    }
    // recipeId es el nombre historico del campo en el front; aca es product id.
    const productIds = [...new Set(items.map((it: Record<string, unknown>) => it.recipeId || it.productId))];

    // El filtro por tenant_id es lo que impide pedir un producto de OTRO local.
    const { data: dbProducts, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price, category, active")
      .eq("tenant_id", tenantId)
      .in("id", productIds);
    if (prodErr || !dbProducts) return jsonRes({ error: "Error al obtener productos" }, 500);

    const productMap: Record<string, Record<string, unknown>> = {};
    for (const p of dbProducts) productMap[p.id] = p;

    let serverSubtotal = 0;
    const validatedItems = [];
    for (const item of items) {
      const pid = item.recipeId || item.productId;
      const prod = productMap[pid];
      if (!prod) return jsonRes({ error: `Producto no encontrado: ${pid}` }, 400);
      if (!prod.active) return jsonRes({ error: "Uno de los productos no esta disponible" }, 400);
      const qty = Math.max(1, Math.min(999, Math.round(item.qty || 1)));
      const basePrice = Number(prod.price) || 0;
      const unitPrice = hasDealToday(prod.category as string)
        ? Math.round(basePrice * (1 - dealPct / 100))
        : basePrice;
      const subtotal = qty * unitPrice;
      serverSubtotal += subtotal;
      validatedItems.push({ productId: pid, name: prod.name, qty, unitPrice, subtotal });
    }

    // ── Cupon (scopeado al tenant) ──────────────────────────────────
    let validDiscount = 0;
    let validCouponId: string | null = null;
    if (body.coupon_code) {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("id, discount_pct, expires_at, email")
        .eq("tenant_id", tenantId)
        .eq("code", String(body.coupon_code).toUpperCase().trim())
        .eq("used", false)
        .maybeSingle();
      if (coupon) {
        const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
        const emailMatch = !coupon.email || !email || coupon.email.toLowerCase() === email;
        if (!isExpired && emailMatch) {
          validDiscount = Math.round(serverSubtotal * (Number(coupon.discount_pct) / 100));
          validCouponId = coupon.id;
        }
      }
    }

    const tipAmount = Math.round(serverSubtotal * tipPct / 100);
    const finalTotal = Math.max(0, serverSubtotal - validDiscount) + tipAmount + deliveryCost;

    // ── Insert ──────────────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        tenant_id: tenantId,
        status: isMP ? "pending_payment" : "new",
        channel: "catalog",
        customer_name: customer,
        customer_phone: phone,
        customer_email: email,
        delivery,
        delivery_address: address,
        delivery_cost: deliveryCost,
        delivery_date: deliveryDate,
        payment,
        payment_account_id: paymentAccountId,
        payment_account_snapshot: paymentAccountSnapshot,
        note,
        is_gift: isGift,
        gift_note: giftNote,
        subtotal: serverSubtotal,
        discount: validDiscount,
        tip_pct: tipPct,
        tip_amount: tipAmount,
        total: finalTotal,
        coupon_id: validCouponId,
        user_id: userId,
      })
      .select("id")
      .single();
    if (orderError || !order) {
      console.error("Error creando pedido:", orderError);
      return jsonRes({ error: "Error al crear el pedido" }, 500);
    }

    if (validCouponId) {
      await supabase.from("coupons")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("id", validCouponId)
        .eq("tenant_id", tenantId);
    }

    // ── Costo congelado por producto (Etapa 4) ──────────────────────
    // La receta ACTUAL de cada producto pedido: sum(qty_insumo x costo).
    // Best-effort a proposito: si esta consulta falla, el pedido sale igual
    // con costo 0 — complete_order lo recalcula al completar. Un cliente no
    // puede quedarse sin comprar porque el costeo interno fallo.
    const unitCostByProduct: Record<string, number> = {};
    try {
      const { data: recipeLines } = await supabase
        .from("product_ingredients")
        .select("product_id, qty, ingredients(cost)")
        .eq("tenant_id", tenantId)
        .in("product_id", productIds);
      for (const line of (recipeLines || [])) {
        const cost = Number((line.ingredients as Record<string, unknown>)?.cost) || 0;
        const pid = line.product_id as string;
        unitCostByProduct[pid] = (unitCostByProduct[pid] || 0) + (Number(line.qty) || 0) * cost;
      }
    } catch (e) {
      console.warn("costeo de items (non-blocking):", (e as Error)?.message);
    }

    const orderItems = validatedItems.map((it) => ({
      tenant_id: tenantId,
      order_id: order.id,
      product_id: it.productId,
      name_snapshot: it.name,
      qty: it.qty,
      unit_price: it.unitPrice,
      unit_cost: Math.round((unitCostByProduct[it.productId] || 0) * 100) / 100,
      subtotal: it.subtotal,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      console.error("Error creando items:", itemsError);
      // Sin transaccion entre inserts: si fallan los items, la orden huerfana
      // se borra a mano para no dejar un pedido vacio en el panel.
      await supabase.from("orders").delete().eq("id", order.id);
      return jsonRes({ error: "Error al crear los items" }, 500);
    }

    // Push al admin: best-effort. El tenant_id NO es opcional — sin el,
    // send-push no sabe a que negocio avisarle y corta con 400 (nunca manda
    // a todos, que seria notificarle a los clientes de otro local).
    if (!isMP) {
      try {
        await supabase.functions.invoke("send-push", {
          body: {
            tenant_id: tenantId,
            title: "Nuevo pedido",
            body: `${customer || "Cliente"} - $${finalTotal}`,
            url: "/admin?tab=orders",
            target: { role: "admin" },
          },
        });
      } catch (e) {
        console.warn("send-push admin (non-blocking):", (e as Error)?.message);
      }
    }

    return jsonRes({
      ok: true,
      orderId: order.id,
      total: finalTotal,
      discount: validDiscount,
      tip: tipAmount,
      delivery_cost: deliveryCost,
    });
  } catch (err) {
    console.error("submit-order error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
