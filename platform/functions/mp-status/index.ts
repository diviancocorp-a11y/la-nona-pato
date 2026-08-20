// mp-status — si este negocio puede cobrar con MercadoPago, y con que cuenta.
//
// Existe para que el panel NUNCA tenga que leer `payment_integrations`. Esa
// tabla no tiene policies a proposito (0051): el access_token no sale de las
// edge functions. Esto devuelve lo que la pantalla necesita para decir
// "conectado a tal cuenta" y nada mas.
//
// Tambien lo usa el checkout para saber si ofrecer MercadoPago como medio: un
// boton de pago que lleva a un error es peor que no tener el boton.
//
// Body: { tenant_slug }

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
    if (!slug) return json({ error: "Falta tenant_slug" }, 400);

    const { data: tenant } = await supabase.from("tenants")
      .select("id").eq("slug", slug).maybeSingle();
    if (!tenant) return json({ error: "Negocio no encontrado" }, 404);

    // Sin sesion: el catalogo publico necesita saber si ofrecer el medio, y
    // "este local cobra con MP" no es informacion sensible. El token no sale
    // de aca en ningun caso.
    const { data: i } = await supabase.from("payment_integrations")
      .select("public_key, mp_nickname, live_mode, connected_at, webhook_secret")
      .eq("tenant_id", tenant.id).eq("provider", "mercadopago")
      .eq("is_active", true).maybeSingle();

    if (!i) return json({ ok: true, conectado: false });

    return json({
      ok: true,
      conectado: true,
      cuenta: i.mp_nickname || null,
      live_mode: i.live_mode,
      // La public key SI es publica: es la que usa el checkout en el browser.
      public_key: i.public_key || null,
      desde: i.connected_at,
      // Se dice si hay firma configurada, no cual es.
      firma_configurada: !!i.webhook_secret,
    });
  } catch (err) {
    console.error("mp-status error:", err);
    return json({ error: "Error interno" }, 500);
  }
});
