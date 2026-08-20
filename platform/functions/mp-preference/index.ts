// mp-preference — arma el link de pago de MercadoPago para UN pedido.
//
// El pedido ya existe (lo creo `submit-order`) en estado `pending_payment`:
// hasta que MP no confirme no hay plata, y un pedido sin plata no tiene por que
// aparecerle a la cocina.
//
// ── LOS IMPORTES NO LOS MANDA EL CLIENTE ──
// La preferencia se arma con lo que dice la BASE, no con lo que viene en el
// body. Si el precio viniera del browser, cualquiera podria pagar $1 por un
// pedido de $20.000 cambiando un numero antes de enviarlo, y el webhook lo
// aprobaria sin notar nada: para MP ese pago seria correcto.
//
// verify_jwt=false: la paga un cliente sin cuenta. La proteccion es que el
// pedido tiene que existir, estar esperando pago y ser de este negocio.
//
// Body: { tenant_slug, order_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const slug = String(body.tenant_slug || "").trim().toLowerCase();
    const orderId = String(body.order_id || "").trim();
    if (!slug || !orderId) return json({ error: "Faltan datos del pedido" }, 400);

    const { data: tenant } = await supabase.from("tenants")
      .select("id, name, slug").eq("slug", slug).maybeSingle();
    if (!tenant) return json({ error: "Negocio no encontrado" }, 404);

    /* ── El pedido, desde la base ── */
    const { data: order } = await supabase.from("orders")
      .select("id, tenant_id, total, status, customer_name, customer_phone")
      .eq("id", orderId).maybeSingle();

    // Se responde lo mismo si no existe o si es de otro negocio: distinguirlos
    // le diria a un curioso que ese id existe en algun lado.
    if (!order || order.tenant_id !== tenant.id) {
      return json({ error: "No se encontró el pedido" }, 404);
    }
    if (order.status !== "pending_payment") {
      return json({ error: "Ese pedido ya no está esperando el pago" }, 409);
    }
    const total = Number(order.total) || 0;
    if (total <= 0) return json({ error: "El pedido no tiene importe" }, 400);

    /* ── La cuenta de ESTE negocio ── */
    const { data: integ } = await supabase.from("payment_integrations")
      .select("access_token, live_mode")
      .eq("tenant_id", tenant.id).eq("provider", "mercadopago")
      .eq("is_active", true).maybeSingle();

    if (!integ?.access_token) {
      return json({ error: "Este negocio todavía no conectó MercadoPago" }, 503);
    }

    const base = `https://${tenant.slug}.divianco.app`;
    // El slug viaja en la URL del webhook porque la notificacion de MP no dice
    // de quien es. No se le CREE —del otro lado se verifica que el pedido sea
    // de ese negocio— pero evita tener que adivinar con que token consultar.
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`
      + `?tenant=${encodeURIComponent(tenant.slug)}`;

    const pref = {
      items: [{
        id: order.id,
        title: `Pedido en ${tenant.name}`,
        quantity: 1,
        currency_id: "ARS",
        unit_price: total,
      }],
      payer: {
        name: order.customer_name || undefined,
        phone: order.customer_phone
          ? { area_code: "", number: String(order.customer_phone) }
          : undefined,
      },
      // Por aca vuelve el pedido cuando el webhook pregunta por el pago.
      external_reference: order.id,
      notification_url: notificationUrl,
      back_urls: {
        success: `${base}/pedido/${order.id}?pago=ok`,
        pending: `${base}/pedido/${order.id}?pago=pendiente`,
        failure: `${base}/pedido/${order.id}?pago=error`,
      },
      auto_return: "approved",
      // Si el cliente no paga, la preferencia deja de servir. Sin esto, un link
      // viejo puede pagarse dias despues, cuando el pedido ya se cancelo.
      expires: true,
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integ.access_token}`,
        "Content-Type": "application/json",
        // MP deduplica por esta clave: dos toques al boton de pagar no crean
        // dos preferencias para el mismo pedido.
        "X-Idempotency-Key": `pref-${order.id}`,
      },
      body: JSON.stringify(pref),
    });

    if (!res.ok) {
      const detalle = await res.text();
      console.error("mp-preference: MP rechazo la preferencia", res.status, detalle);
      // El detalle de MP no se le devuelve al comprador: puede traer datos de
      // la cuenta del negocio.
      return json({ error: "No se pudo generar el link de pago" }, 502);
    }

    const data = await res.json();
    return json({
      ok: true,
      // `init_point` es produccion; el sandbox tiene el suyo. Devolver el que
      // no corresponde manda al comprador a una pantalla que no puede pagar.
      init_point: integ.live_mode ? data.init_point : data.sandbox_init_point,
      preference_id: data.id,
      live_mode: integ.live_mode,
    });
  } catch (err) {
    console.error("mp-preference error:", err);
    return json({ error: "No se pudo generar el link de pago" }, 500);
  }
});
