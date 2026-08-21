// staff-invite — dar de alta a alguien del equipo de Divianco.
//
// ── POR QUE NO ALCANZA CON QUE SE REGISTRE ──
// El alta publica de `divianco.app/registro` termina en `signup_tenant()`, que
// crea un NEGOCIO. Un empleado que se registrara por ahi se llevaba un tenant
// fantasma: vacio, con un slug tomado, contando en las metricas y esperando a
// que el barrido de dormidos lo limpie. Y no hacia falta equivocarse en el
// alta: `destinoTrasLogin()` corre en TODO login.
//
// (La otra mitad de esa defensa esta en la migracion: `signup_tenant` ahora no
// crea nada si quien llama es staff. Esto evita el caso; aquello lo hace
// imposible.)
//
// ── LA CONTRASEÑA NO PASA POR ACA ──
// Se usa `inviteUserByEmail`: la persona recibe un mail y elige su propia
// contraseña. Nadie mas la conoce — ni quien la da de alta, ni esta funcion,
// ni la base. Mandar una contraseña temporal por chat o por mail es la forma
// mas comun de que termine anotada en un papel.
//
// verify_jwt=false: la autorizacion la hace el cuerpo con el token de quien
// llama (bug #6 de CLAUDE.md).
//
// Body: { email }

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

/** El dominio es lo que hay despues de la ULTIMA arroba. */
function dominioDe(email: string): string {
  const partes = email.split("@");
  return partes.length < 2 ? "" : partes[partes.length - 1].toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /* ── 1. Quien llama tiene que ser el DUENIO ── */
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "No autorizado" }, 401);
    const { data: userData } = await supabase.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) return json({ error: "No autorizado" }, 401);

    // Duenio, no staff: entrar a la consola y repartir el acceso son dos
    // permisos distintos. Si cualquier staff pudiera invitar, el acceso seria
    // transitivo y bastaria una cuenta comprometida para abrir la puerta.
    const { data: caller } = await supabase.from("platform_admins")
      .select("rol").eq("user_id", callerId).maybeSingle();
    if (caller?.rol !== "owner") {
      return json({ error: "Sólo el dueño de la plataforma puede dar de alta" }, 403);
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Ese email no parece válido" }, 400);
    }

    /* ── 2. Tiene que ser del dominio de la empresa ── */
    const { data: dominios } = await supabase.from("staff_dominios").select("dominio");
    const permitidos = (dominios || []).map((d) => d.dominio);
    if (!permitidos.includes(dominioDe(email))) {
      return json({
        error: `A la consola sólo entran los correos de la empresa `
          + `(${permitidos.map((d) => "@" + d).join(", ")}).`,
      }, 400);
    }

    /* ── 3. Resetear la clave de alguien que ya esta ── */
    // El duenio manda el link; la contraseña la elige la persona. Nadie mas la
    // ve, ni siquiera quien la pidio.
    if (body.resetear === true) {
      const { error: recErr } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${body.origin || "https://divianco.app"}/consola` },
      });
      if (recErr) {
        console.error("staff-invite: no se pudo generar el link", recErr);
        return json({ error: "No se pudo mandar el link" }, 502);
      }
      return json({ ok: true, email, message: "Link enviado." });
    }

    /* ── 4. La cuenta ── */
    // Si ya existe no se la toca: se la suma al equipo y entra con la
    // contraseña que ya usaba. Reinvitar le pisaria la sesion a alguien que
    // estaba trabajando.
    const { data: existente } = await supabase.rpc("find_user_id_by_email", { p_email: email });

    let userId: string | null = existente || null;
    let invitado = false;

    if (!userId) {
      const redirectTo = `${body.origin || "https://divianco.app"}/consola`;
      const { data: inv, error: invErr } = await supabase.auth.admin
        .inviteUserByEmail(email, { redirectTo });
      if (invErr || !inv?.user) {
        console.error("staff-invite: no se pudo invitar", invErr);
        return json({ error: "No se pudo enviar la invitación" }, 502);
      }
      userId = inv.user.id;
      invitado = true;
    }

    /* ── 4. Al equipo ── */
    // `rol: 'staff'` explicito, y solo al crear: un upsert que pisara el rol
    // convertiria al duenio en staff si alguien lo reinvitara por error, y la
    // plataforma quedaria sin nadie que pueda repartir accesos.
    const { error: upErr } = await supabase.from("platform_admins")
      .upsert({ user_id: userId, email, rol: "staff" },
        { onConflict: "user_id", ignoreDuplicates: true });
    if (upErr) throw upErr;

    return json({
      ok: true,
      email,
      invitado,
      message: invitado
        ? "Le mandamos un mail para que elija su contraseña."
        : "Ya tenía cuenta: entra con la contraseña que ya usaba.",
    });
  } catch (err) {
    console.error("staff-invite error:", err);
    return json({ error: "No se pudo dar de alta" }, 500);
  }
});
