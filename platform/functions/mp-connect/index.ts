// mp-connect — conectar la cuenta de MercadoPago de UN negocio.
//
// El negocio copia su Access Token productivo desde el panel de MP y lo pega.
// No hay OAuth porque MP no lo habilita para las apps de tipo "Integracion
// propia", que es lo que crea su wizard por default.
//
// ── EL AGUJERO DEL LEGACY QUE NO SE PORTA ──
// `mp-connect-manual` (legacy) NO verifica quien la llama: acepta un token de
// cualquiera y lo guarda. En una app de un solo negocio el dano esta acotado.
// Aca seria de otra escala: cualquiera podria apuntar el cobro de OTRO negocio
// a su propia cuenta de MP y quedarse con la plata de sus ventas, sin tocar
// nada mas. Por eso aca lo primero que se hace es verificar que quien llama sea
// OWNER de ese negocio.
//
// Es la unica funcion del edificio donde eso importa tanto: las demas exponen
// datos, esta redirige dinero.
//
// verify_jwt=false: la autorizacion la hace el cuerpo, con el token del
// usuario. Las keys `sb_publishable_` no son JWT y el gateway las rechaza
// (bug #6 de CLAUDE.md).
//
// Body: { tenant_slug, access_token, public_key?, webhook_secret? }

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

    /* ── 1. Quien sos ── */
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "No autorizado" }, 401);
    const { data: userData } = await supabase.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) return json({ error: "No autorizado" }, 401);

    const body = await req.json();
    const slug = String(body.tenant_slug || "").trim().toLowerCase();
    if (!slug) return json({ error: "Falta tenant_slug" }, 400);

    const { data: tenant } = await supabase.from("tenants")
      .select("id, name, country").eq("slug", slug).maybeSingle();
    if (!tenant) return json({ error: "Negocio no encontrado" }, 404);

    /* ── 2. Sos duenio de ESTE negocio ── */
    const { data: filas } = await supabase.from("tenant_members")
      .select("roles").eq("tenant_id", tenant.id).eq("user_id", callerId);
    const esOwner = (filas || []).some((f) => (f.roles || []).includes("owner"));
    if (!esOwner) {
      return json({ error: "Solo el dueño puede conectar la cuenta de cobro" }, 403);
    }

    /* ── 3. Argentina, por ahora ── */
    // El adaptador es por pais (6a) y solo AR esta probado. Decirlo antes es
    // mejor que dejar que el negocio conecte y descubra que no cobra.
    if ((tenant.country || "AR") !== "AR") {
      return json({
        error: "Por ahora el cobro con MercadoPago está disponible sólo en Argentina.",
      }, 400);
    }

    const accessToken = String(body.access_token || "").trim();
    if (!accessToken) return json({ error: "Falta el Access Token" }, 400);

    /* ── 4. Que el token sea de verdad, y de quien dice ── */
    // Se pregunta a MP en vez de confiar en el formato: un token con la forma
    // correcta pero revocado dejaria el negocio "conectado" y sin cobrar, y
    // eso se descubre recien con el primer cliente esperando.
    const meRes = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meRes.ok) {
      if (meRes.status === 401) {
        return json({
          error: "Ese token no es válido o fue revocado. Copialo de nuevo desde "
            + "MercadoPago → Tus integraciones → Credenciales de producción.",
        }, 400);
      }
      return json({ error: "MercadoPago no respondió. Probá de nuevo en un minuto." }, 502);
    }

    const mp = await meRes.json();

    // Los tokens de prueba empiezan con TEST-. No se rechazan —sirven para
    // probar— pero el negocio tiene que saber que NO esta cobrando de verdad.
    const liveMode = !accessToken.startsWith("TEST-");

    if (mp.site_id && mp.site_id !== "MLA") {
      return json({
        error: `Esa cuenta de MercadoPago es de otro país (${mp.site_id}). `
          + "Por ahora sólo funciona con cuentas de Argentina.",
      }, 400);
    }

    /* ── 5. Guardar. Una sola activa por negocio ── */
    await supabase.from("payment_integrations")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenant.id).eq("provider", "mercadopago").eq("is_active", true);

    const { error: insErr } = await supabase.from("payment_integrations").insert({
      tenant_id: tenant.id,
      provider: "mercadopago",
      access_token: accessToken,
      public_key: String(body.public_key || "").trim() || null,
      webhook_secret: String(body.webhook_secret || "").trim() || null,
      external_user_id: String(mp.id || ""),
      mp_nickname: mp.nickname || null,
      mp_email: mp.email || null,
      live_mode: liveMode,
      is_active: true,
      metadata: { site_id: mp.site_id || null, connection_type: "manual" },
    });
    if (insErr) throw insErr;

    // Nunca se devuelve el token, ni siquiera a quien lo acaba de pegar: no
    // hace falta para nada y cada lugar por el que pasa es un lugar donde se
    // puede filtrar.
    return json({
      ok: true,
      cuenta: {
        nickname: mp.nickname || null,
        email: mp.email || null,
        live_mode: liveMode,
      },
      aviso: liveMode
        ? null
        : "Conectaste un token de PRUEBA: los pagos no van a ser reales.",
    });
  } catch (err) {
    console.error("mp-connect error:", err);
    return json({ error: "No se pudo conectar la cuenta" }, 500);
  }
});
