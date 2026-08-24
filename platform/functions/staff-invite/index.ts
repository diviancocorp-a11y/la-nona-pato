// staff-invite — dar de alta a alguien del equipo de Divianco.
//
// ── POR QUE NO ALCANZA CON QUE SE REGISTRE ──
// El alta publica de `divianco.app/registro` termina en `signup_tenant()`, que
// crea un NEGOCIO. Un empleado que se registrara por ahi se llevaba un tenant
// fantasma: vacio, con un slug tomado, contando en las metricas y esperando a
// que el barrido de dormidos lo limpie. Y no hacia falta equivocarse en el
// alta: `destinoTrasLogin()` corre en TODO login.
//
// (La otra mitad de esa defensa esta en la migracion: `signup_tenant` no crea
// nada si quien llama es staff. Esto evita el caso; aquello lo hace imposible.)
//
// ── LA CONTRASEÑA NO PASA POR ACA ──
// Se usa `inviteUserByEmail`: la persona recibe un mail y elige su propia
// contraseña. Nadie mas la conoce — ni quien la da de alta, ni esta funcion,
// ni la base. Mandar una contraseña temporal por chat o por mail es la forma
// mas comun de que termine anotada en un papel.
//
// ── SE ENTRA CON EL CORREO PERSONAL (0057) ──
// Hubo una version que creaba un alias en el dominio de la empresa via
// Cloudflare Email Routing. Se descarto: el alias necesita una ROUTING RULE
// para entregar, y ese permiso no esta en el token. Sin la regla el alias
// existe, no entrega, y la invitacion se pierde en silencio y vence a las 24
// horas. Cuatro intentos, ninguno cerro el ciclo.
//
// El correo de trabajo sigue siendo una buena idea; lo que se descarto es que
// sea REQUISITO para dar de alta. La cuenta de la consola y el correo de
// trabajo son dos cosas distintas y ahora no se estorban.
//
// verify_jwt=false: la autorizacion la hace el cuerpo con el token de quien
// llama (bug #6 de CLAUDE.md).
//
// Body: { email, puesto?, origin?, resetear? }

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

// Los cuatro puestos de la consola (migracion 0054). La lista esta duplicada a
// proposito con el CHECK de la tabla y con `src/modules/rolesDeConsola.js`:
// cada copia protege algo distinto. El CHECK impide guardar basura, el modulo
// decide que se dibuja, y esto da un mensaje en vez de un error de constraint.
// Lo que un puesto PUEDE hacer se declara SOLO en el modulo.
const PUESTOS_VALIDOS = ["administrador", "ventas", "soporte", "marketing"];
const PUESTO_POR_DEFECTO = "soporte";

/**
 * Un correo con forma de correo. UNA sola constante, y por un motivo concreto:
 * estaba escrito a mano en tres lugares y en una edicion uno perdio las barras
 * invertidas — `[^@\s]` quedo como `[^@s]`, una clase que excluye la LETRA s.
 * Rechazaba cualquier direccion con una s adentro y decia "no parece valido".
 *
 * No valida que exista: eso lo dice el mail que llega o no llega. Ataja un
 * tipeo obvio antes de crear una cuenta.
 */
const ES_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    //
    // ESTA es la proteccion del alta. Antes habia ademas una lista de dominios
    // permitidos (`staff_dominios`), que se saco en 0057: filtraba la FORMA del
    // correo, no quien lo daba de alta.
    const { data: caller } = await supabase.from("platform_admins")
      .select("rol").eq("user_id", callerId).maybeSingle();
    if (caller?.rol !== "owner") {
      return json({ error: "Sólo el dueño de la plataforma puede dar de alta" }, 403);
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!ES_EMAIL.test(email)) {
      return json({ error: "Ese correo no parece válido." }, 400);
    }

    /* ── 2. Mandarle un link para elegir contraseña nueva ── */
    // El duenio manda el link; la contraseña la elige la persona. Nadie mas la
    // ve, ni siquiera quien lo pidio. Sirve para dos cosas: alguien que se
    // olvido la clave, y alguien a quien la invitacion no le llego.
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

    /* ── 3. El puesto ── */
    // Se valida ACA ademas del CHECK de la tabla: un puesto invalido tiene que
    // dar un mensaje, no un error de constraint.
    const puesto = String(body.puesto || PUESTO_POR_DEFECTO).toLowerCase().trim();
    if (!PUESTOS_VALIDOS.includes(puesto)) {
      return json({ error: `«${puesto}» no es un puesto de la consola.` }, 400);
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
        return json({
          error: invErr?.message
            ? `No se pudo enviar la invitación: ${invErr.message}`
            : "No se pudo enviar la invitación",
        }, 502);
      }
      userId = inv.user.id;
      invitado = true;
    }

    /* ── 5. Al equipo, con su puesto ── */
    // `rol: 'staff'` explicito, y solo al crear: un upsert que pisara el rol
    // convertiria al duenio en staff si alguien lo reinvitara por error, y la
    // plataforma quedaria sin nadie que pueda repartir accesos. El puesto no se
    // pisa al reinvitar por el mismo motivo: para cambiarlo esta
    // `cambiar_puesto`, que es una accion aparte y deliberada.
    const { error: upErr } = await supabase.from("platform_admins")
      .upsert({ user_id: userId, email, rol: "staff", puesto },
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
