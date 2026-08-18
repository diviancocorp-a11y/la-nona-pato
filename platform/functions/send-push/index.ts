// send-push del EDIFICIO (multi-tenant).
//
// Por que no se reuso supabase/functions/send-push: esa version resuelve los
// destinatarios sin tenant (manda a TODA la tabla) y autoriza contra
// `admin_users`, que en el edificio no existe. Las dos cosas son fatales aca:
// sin tenant, un negocio le notificaria a los clientes de otro.
//
// Body: { tenant_id | tenant_slug, title, body, url?, icon?, target?: { role?, user_id?, phone? } }
//
// AUTH — solo pasan dos:
//   (a) el service role (invocaciones internas: submit-order)
//   (b) un JWT de alguien que es MIEMBRO del tenant al que se le manda
// La anon key es publica (viaja en el bundle), asi que sin esto cualquiera
// podria hacerle broadcast a los clientes de cualquier local.
//
// verify_jwt=false: la autorizacion la hace el cuerpo, no el gateway (bug #6
// de CLAUDE.md — las keys sb_publishable_ no son JWT y el gateway las rechaza).
//
// Env (secrets del proyecto): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT. UNA sola por plataforma: VAPID identifica al servidor que
// manda, no al negocio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    const { tenant_id, tenant_slug, title, body, url, icon, target } = await req.json();
    if (!title || !body) return json({ error: "title y body son obligatorios" }, 400);

    // ── A que negocio ─────────────────────────────────────────────
    let tenantId = tenant_id || null;
    if (!tenantId && tenant_slug) {
      const { data } = await supabase.from("tenants").select("id")
        .eq("slug", String(tenant_slug).trim().toLowerCase()).maybeSingle();
      tenantId = data?.id || null;
    }
    // Sin tenant no se manda NADA. Un fallback a "todos" seria un push
    // cruzado entre negocios, que es el peor error posible de esta funcion.
    if (!tenantId) return json({ error: "Falta tenant_id o tenant_slug" }, 400);

    // ── Autorizacion ──────────────────────────────────────────────
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    let autorizado = false;
    if (token && token === serviceKey) {
      autorizado = true;
    } else if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      const uid = userData?.user?.id;
      if (uid) {
        const { data: miembro } = await supabase.from("tenant_members")
          .select("user_id").eq("tenant_id", tenantId).eq("user_id", uid).maybeSingle();
        if (miembro) autorizado = true;
      }
    }
    if (!autorizado) return json({ error: "No autorizado" }, 401);

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:hola@divianco.app";
    if (!vapidPublic || !vapidPrivate) {
      // Explicito y no en silencio: sin claves no hay push y hay que saberlo.
      return json({ error: "VAPID no configurado en este proyecto" }, 500);
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    // ── Destinatarios, SIEMPRE dentro del tenant ──────────────────
    let q = supabase.from("push_subscriptions").select("*").eq("tenant_id", tenantId);
    const t = target || { role: "customer" };
    if (t.user_id) q = q.eq("user_id", t.user_id);
    else if (t.phone) q = q.eq("phone", t.phone);
    else if (t.role) q = q.eq("role", t.role);

    const { data: subs, error: subErr } = await q;
    if (subErr) throw subErr;
    if (!subs?.length) return json({ ok: true, sent: 0, message: "Sin suscriptores" });

    const payload = JSON.stringify({
      title, body,
      url: url || "/",
      icon: icon || "/icons/icon-192.png",
    });

    let sent = 0, failed = 0;
    const muertos: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          payload,
        );
        sent++;
      } catch (e) {
        // 404/410 = el browser desinstalo la app o revoco el permiso. La
        // suscripcion ya no sirve y se limpia sola: si no, la tabla crece
        // para siempre con endpoints que siempre fallan.
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) muertos.push(sub.endpoint);
        failed++;
      }
    }));

    if (muertos.length > 0) {
      await supabase.from("push_subscriptions").delete().in("endpoint", muertos);
    }

    return json({ ok: true, sent, failed, limpiados: muertos.length, total: subs.length });
  } catch (err) {
    console.error("send-push error:", err);
    return json({ error: (err as Error)?.message || "Error interno" }, 500);
  }
});
