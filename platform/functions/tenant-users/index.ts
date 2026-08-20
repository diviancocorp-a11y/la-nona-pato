// tenant-users — el equipo de UN negocio del edificio.
//
// Body: { tenant_slug, action: 'list'|'create'|'set_role'|'remove', ... }
//
// ── 6f: roles[] y sucursal ──
// `tenant_members` paso a (tenant_id, user_id, branch_id, roles[]): una fila
// por persona y sucursal, con varios roles. La columna `role` quedo deprecada
// y la mantiene un trigger, asi que aca SIEMPRE se escribe `roles`: escribir
// `role` no dispara ese trigger y deja las dos versiones diciendo cosas
// distintas.
// Solo un OWNER de ESE negocio pasa. Es edge function y no tabla directa
// porque hacen falta dos cosas que el cliente no puede: leer los emails de
// auth.users y crear cuentas.
//
// ── UN AGUJERO DEL LEGACY QUE NO SE PORTA ──
// `admin-users` (legacy), al agregar a alguien cuyo email YA tiene cuenta,
// le PISA LA CONTRASENA con la que escribe quien lo agrega. En una app de un
// solo negocio el dano esta acotado a ese negocio. Aca seria mucho peor:
// cualquier dueno podria escribir el email de otra persona de la plataforma,
// "agregarla a su equipo", y quedarse con su contrasena — o sea tomarle la
// cuenta, incluidos los negocios que ella administra.
// Regla: si el email YA tiene cuenta, NUNCA se le toca la contrasena. Se lo
// suma al equipo y entra con la que ya usaba.
//
// verify_jwt=false: la autorizacion la hace el cuerpo (bug #6 de CLAUDE.md).

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

const VALIDOS = [
  "owner", "manager", "cashier", "attendant", "kitchen", "marketer", "accountant",
];

/**
 * Normaliza lo que llega a un array de roles validos.
 *
 * Acepta la forma vieja (`role: 'owner'|'staff'`) para no romper a un cliente
 * sin deployar: 'staff' era "todo menos gestionar el equipo", y su equivalente
 * mas cercano hoy es `manager`. Bajarlo a `attendant` le sacaria accesos que
 * ya tenia.
 */
function ROLES(body: Record<string, unknown>): string[] {
  const crudos = Array.isArray(body.roles)
    ? body.roles
    : [body.role === "owner" ? "owner" : body.role === "staff" ? "manager" : body.role];
  const limpios = [...new Set(
    crudos.map((r) => String(r || "").trim()).filter((r) => VALIDOS.includes(r)),
  )];
  return limpios.length ? limpios : ["attendant"];
}

/** null = todas las sucursales (el caso del duenio). */
const BRANCH = (b: unknown) => (typeof b === "string" && b.trim() ? b.trim() : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "No autorizado" }, 401);
    const { data: userData } = await supabase.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) return json({ error: "No autorizado" }, 401);

    const body = await req.json();
    const tenantSlug = String(body.tenant_slug || "").trim().toLowerCase();
    if (!tenantSlug) return json({ error: "Falta tenant_slug" }, 400);

    const { data: tenant } = await supabase.from("tenants")
      .select("id, name").eq("slug", tenantSlug).maybeSingle();
    if (!tenant) return json({ error: "Negocio no encontrado" }, 404);

    // Owner de ESTE negocio. Serlo de otro no sirve de nada aca.
    // Owner en CUALQUIERA de sus filas: quien es duenio no deja de serlo por
    // tener ademas un rol acotado a una sucursal.
    const { data: callerRows } = await supabase.from("tenant_members")
      .select("roles").eq("tenant_id", tenant.id).eq("user_id", callerId);
    const esOwner = (callerRows || []).some((r) => (r.roles || []).includes("owner"));
    if (!esOwner) {
      return json({ error: "Solo los dueños pueden gestionar el equipo" }, 403);
    }

    const action = body.action;

    /* ─────────────────────────── list ─────────────────────────── */
    if (action === "list") {
      const { data: rows, error } = await supabase.from("tenant_members")
        .select("user_id, role, roles, branch_id, created_at")
        .eq("tenant_id", tenant.id).order("created_at");
      if (error) throw error;

      // Una persona puede tener varias filas (una por sucursal). Se devuelve
      // una entrada por persona, con sus roles juntos: la pantalla lista
      // gente, no filas.
      const porUsuario = new Map<string, Record<string, unknown>>();
      for (const r of rows || []) {
        const previo = porUsuario.get(r.user_id);
        if (previo) {
          previo.roles = [...new Set([...(previo.roles as string[]), ...(r.roles || [])])];
          (previo.branch_ids as (string | null)[]).push(r.branch_id);
          continue;
        }
        porUsuario.set(r.user_id, {
          user_id: r.user_id,
          role: r.role,
          roles: r.roles || [],
          branch_ids: [r.branch_id],
          created_at: r.created_at,
        });
      }

      const users = [];
      for (const u0 of porUsuario.values()) {
        const { data: u } = await supabase.auth.admin.getUserById(u0.user_id as string);
        users.push({
          ...u0,
          email: u?.user?.email || "(sin email)",
          last_sign_in_at: u?.user?.last_sign_in_at || null,
        });
      }
      return json({ ok: true, users });
    }

    /* ────────────────────────── create ────────────────────────── */
    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const roles = ROLES(body);
      const branchId = BRANCH(body.branch_id);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Ese email no parece válido" }, 400);

      // O(1) por indice. El legacy trae las primeras 200 cuentas y busca en
      // memoria: en una plataforma, el que queda afuera de esas 200 aparece
      // como inexistente y se le crea una cuenta duplicada.
      const { data: existingId } = await supabase.rpc("find_user_id_by_email", { p_email: email });

      let userId: string | null = existingId || null;
      let reused = !!existingId;

      if (!userId) {
        if (password.length < 8) return json({ error: "La contraseña necesita al menos 8 caracteres" }, 400);
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email, password, email_confirm: true,
        });
        if (createErr || !created?.user) {
          return json({ error: createErr?.message || "No se pudo crear la cuenta" }, 500);
        }
        userId = created.user.id;
      }
      // Si ya existia NO se toca su contrasena: ver la nota de arriba.

      const { error: upsertErr } = await supabase.from("tenant_members").upsert(
        { tenant_id: tenant.id, user_id: userId, branch_id: branchId, roles },
        { onConflict: "tenant_id,user_id,branch_id" },
      );
      if (upsertErr) throw upsertErr;

      return json({
        ok: true, user_id: userId, email, roles, branch_id: branchId, reused,
        message: reused
          ? "Esa persona ya tenía cuenta: entra con la contraseña que ya usaba."
          : undefined,
      });
    }

    /* ──────────────────── set_role / remove ───────────────────── */
    if (action === "set_role" || action === "remove") {
      const targetId = String(body.user_id || "");
      if (!targetId) return json({ error: "Falta user_id" }, 400);

      // Nunca dejar el negocio sin dueño: sin esto, un owner puede sacarse a
      // si mismo y el negocio queda sin nadie que pueda administrarlo.
      const { data: owners } = await supabase.from("tenant_members")
        .select("user_id").eq("tenant_id", tenant.id).contains("roles", ["owner"]);
      const ownerIds = [...new Set((owners || []).map((o) => o.user_id))];
      const sacaAlUltimo = ownerIds.length === 1 && ownerIds[0] === targetId
        && (action === "remove" || !ROLES(body).includes("owner"));
      if (sacaAlUltimo) return json({ error: "No podés dejar el negocio sin dueño" }, 400);

      if (action === "set_role") {
        const roles = ROLES(body);
        // Se escribe `roles` y no `role`: es lo que dispara el trigger que
        // mantiene la columna vieja al dia.
        const { error } = await supabase.from("tenant_members").update({ roles })
          .eq("tenant_id", tenant.id).eq("user_id", targetId);
        if (error) throw error;
        return json({ ok: true, user_id: targetId, roles });
      }

      // Quita el acceso a ESTE negocio. La cuenta sigue existiendo: puede ser
      // duena de otro local o clienta del catalogo.
      const { error } = await supabase.from("tenant_members").delete()
        .eq("tenant_id", tenant.id).eq("user_id", targetId);
      if (error) throw error;
      return json({ ok: true, removed: targetId });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (err) {
    console.error("tenant-users error:", err);
    return json({ error: (err as Error)?.message || "Error interno" }, 500);
  }
});
