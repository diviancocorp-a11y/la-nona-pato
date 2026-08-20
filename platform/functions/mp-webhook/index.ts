// mp-webhook — MercadoPago avisa que un pago cambio de estado.
//
// ── EL PROBLEMA QUE NO TIENE EL LEGACY ──
// Alla hay UNA cuenta de MP, asi que el webhook agarra "la" integracion y
// listo. Aca hay una por negocio y la notificacion **no dice de quien es**:
// trae un id de pago y nada mas. Y para preguntarle a MP por ese pago hace
// falta... el token del negocio. Es circular.
//
// Se rompe con el `?tenant=` que `mp-preference` puso en la notification_url.
// Esa pista NO se cree: se usa para elegir con que token preguntar, y despues
// se verifica que el pedido que MP devuelve sea de ese mismo negocio. Si no
// coincide, se descarta. Asi, alguien que golpee esta URL con el slug de otro
// no consigue nada: el pedido no le va a pertenecer.
//
// ── IDEMPOTENCIA ──
// MP reintenta la misma notificacion varias veces, y con razon: no sabe si
// llegamos a procesarla. El pedido se promueve SOLO si todavia estaba
// esperando el pago, asi que el aviso al negocio sale una sola vez.
//
// ── LA FIRMA ──
// Si el negocio configuro el secreto, se valida el HMAC que MP manda en
// `x-signature`. Si no lo configuro, se sigue igual pero queda en el log: la
// proteccion de fondo es que el pago se consulta contra la API de MP, asi que
// una notificacion inventada no sobrevive a la consulta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** El id del pago, en los tres formatos que MP usa segun la epoca. */
function sacarPaymentId(req: Request, body: Record<string, unknown>): string | null {
  const data = body?.data as Record<string, unknown> | undefined;
  if (body?.type === "payment" && data?.id) return String(data.id);
  if (body?.topic === "payment" && body?.resource) {
    const m = String(body.resource).match(/payments\/(\d+)/);
    if (m) return m[1];
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.searchParams.get("data.id");
  const topic = url.searchParams.get("topic") || url.searchParams.get("type");
  if (id && topic === "payment") return id;
  return null;
}

/**
 * La firma de MP: `x-signature: ts=<ts>,v1=<hmac>`, calculada sobre
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` con el secreto del negocio.
 */
async function firmaValida(
  req: Request, paymentId: string, secreto: string,
): Promise<boolean> {
  const sig = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const partes = Object.fromEntries(
    sig.split(",").map((p) => p.split("=").map((x) => x.trim())),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const esperado = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return esperado === v1;
}

Deno.serve(async (req) => {
  // MP no manda preflight: POST directo.
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json().catch(() => ({}));
    const paymentId = sacarPaymentId(req, body);

    // Otros topicos (merchant_order, subscriptions) no se procesan. Se responde
    // 200 igual: un error haria que MP reintente para siempre algo que nunca
    // vamos a atender.
    if (!paymentId) return new Response("OK", { status: 200 });

    const slug = new URL(req.url).searchParams.get("tenant");
    if (!slug) {
      console.error("mp-webhook: notificacion sin ?tenant=");
      return new Response("OK", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tenant } = await supabase.from("tenants")
      .select("id, slug").eq("slug", slug).maybeSingle();
    if (!tenant) return new Response("OK", { status: 200 });

    const { data: integ } = await supabase.from("payment_integrations")
      .select("access_token, webhook_secret")
      .eq("tenant_id", tenant.id).eq("provider", "mercadopago")
      .eq("is_active", true).maybeSingle();

    if (!integ?.access_token) {
      console.error("mp-webhook: el negocio no tiene MP conectado", slug);
      return new Response("OK", { status: 200 });
    }

    if (integ.webhook_secret) {
      const ok = await firmaValida(req, paymentId, integ.webhook_secret);
      if (!ok) {
        console.error("mp-webhook: firma invalida", slug, paymentId);
        return new Response("Invalid signature", { status: 401 });
      }
    } else {
      console.warn("mp-webhook: sin secreto de firma configurado", slug);
    }

    /* ── El pago, preguntado a MP ── */
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    });
    if (!res.ok) {
      // 502 para que MP reintente: puede ser un problema momentaneo de su lado.
      console.error("mp-webhook: no se pudo leer el pago", paymentId, res.status);
      return new Response("Payment fetch failed", { status: 502 });
    }
    const pago = await res.json();

    const orderId = pago.external_reference;
    if (!orderId) return new Response("OK", { status: 200 });

    const { data: order } = await supabase.from("orders")
      .select("id, tenant_id, status, paid_at, customer_name, total")
      .eq("id", orderId).maybeSingle();

    // ACA se verifica la pista del `?tenant=`. Si el pedido no es de ese
    // negocio, la notificacion no se procesa.
    if (!order || order.tenant_id !== tenant.id) {
      console.error("mp-webhook: el pedido no es de ese negocio", orderId, slug);
      return new Response("OK", { status: 200 });
    }

    const updates: Record<string, unknown> = {
      payment_external_id: String(pago.id),
      payment_status: pago.status,
    };

    // Se promueve solo si todavia esperaba el pago. Es lo que hace que el
    // aviso al negocio salga UNA vez aunque MP notifique cinco.
    let avisar = false;
    if (pago.status === "approved") {
      if (!order.paid_at) updates.paid_at = new Date().toISOString();
      if (order.status === "pending_payment") {
        updates.status = "new";
        avisar = true;
      }
    }

    const { error: updErr } = await supabase.from("orders")
      .update(updates).eq("id", order.id).eq("tenant_id", tenant.id);
    if (updErr) {
      console.error("mp-webhook: no se pudo actualizar el pedido", updErr);
      return new Response("Update failed", { status: 500 });
    }

    if (avisar) {
      try {
        await supabase.functions.invoke("send-push", {
          body: {
            tenant_slug: tenant.slug,
            title: "Nuevo pedido pagado",
            body: `${order.customer_name || "Cliente"} · $${order.total ?? ""}`,
            url: "/admin?tab=orders",
            target: { role: "admin" },
          },
        });
      } catch (e) {
        // Que no llegue el push no puede hacer que MP reintente: el pedido ya
        // esta cobrado y promovido, que es lo que importa.
        console.warn("mp-webhook: push (no bloqueante):", (e as Error)?.message);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("mp-webhook error:", err);
    // 200 a proposito: si devolvieramos 500, MP reintentaria indefinidamente
    // un error que es nuestro. Queda en el log.
    return new Response("OK", { status: 200 });
  }
});
