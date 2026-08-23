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
// ── EL CORREO DE TRABAJO (Cloudflare Email Routing) ──
// El equipo no tiene casillas: tiene ALIAS en el dominio de la empresa que
// reenvian al correo personal de cada uno. Antes eso se creaba a mano en el
// panel de Cloudflare por cada persona; ahora lo crea esta funcion.
//
// Cloudflare exige que el DUENIO del correo personal confirme el destino con
// un clic. Eso NO lo puede hacer la API — es justamente la proteccion contra
// que cualquiera desvie correo a una casilla ajena. Consecuencia directa: el
// alta es de DOS pasos y la persona recibe DOS mails (el de Cloudflare para
// confirmar, y despues el de la invitacion a la consola).
//
// Y ese orden no es cosmetico. Mientras el destino no este confirmado, el
// alias existe y NO entrega nada: una invitacion mandada antes se pierde en
// silencio y ademas vence a las 24 horas, asi que cuando la persona confirma,
// el link que la esperaba ya caduco. Por eso `sumar` se niega a invitar a una
// direccion que todavia no recibe correo.
//
// verify_jwt=false: la autorizacion la hace el cuerpo con el token de quien
// llama (bug #6 de CLAUDE.md).
//
// Body: { accion?: 'sumar' | 'resetear' | 'correos' | 'crear_correo'
//                | 'reenviar_confirmacion', ... }
// (sin `accion` se comporta como antes: `{email}` da de alta, `{email,
// resetear:true}` manda link de clave nueva.)

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
// proposito en tres lados —el CHECK de la tabla, `src/modules/rolesDeConsola.js`
// y aca—: cada uno protege algo distinto. El CHECK impide guardar basura, el
// modulo decide que se dibuja, y esto da un mensaje en vez de un error de
// constraint. Lo que un puesto PUEDE hacer se declara solo en el modulo.
const PUESTOS_VALIDOS = ["administrador", "ventas", "soporte", "marketing"];
const PUESTO_POR_DEFECTO = "soporte";

/** El dominio es lo que hay despues de la ULTIMA arroba. */
function dominioDe(email: string): string {
  const partes = email.split("@");
  return partes.length < 2 ? "" : partes[partes.length - 1].toLowerCase();
}

/* ═══════════════════════ Cloudflare Email Routing ═══════════════════════ */

const CF_API = "https://api.cloudflare.com/client/v4";

// El token canonico es CLOUDFLARE_API_TOKEN. Los otros nombres se aceptan para
// no obligar a renombrar un secreto que ya este cargado: renombrarlo es un
// paso manual mas donde equivocarse, y el sintoma seria "no se pudo crear el
// correo" sin decir por que.
const NOMBRES_DEL_TOKEN = ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CLOUDFLARE_TOKEN"];

function tokenDeCloudflare(): string | null {
  for (const nombre of NOMBRES_DEL_TOKEN) {
    const v = (Deno.env.get(nombre) || "").trim();
    if (v) return v;
  }
  return null;
}

class ErrorDeCloudflare extends Error {
  status: number;
  /** Los codigos de Cloudflare. 10000 es "Authentication error". */
  codigos: number[];
  constructor(message: string, status = 502, codigos: number[] = []) {
    super(message);
    this.status = status;
    this.codigos = codigos;
  }
}

/**
 * Que estaba haciendo la llamada y con que permiso del token.
 *
 * Cuando a un token le falta un permiso, Cloudflare contesta
 * "Authentication error" a secas: no dice cual, ni sobre que recurso. Ese
 * mensaje solo no alcanza, porque el alta usa CUATRO permisos distintos y se
 * cae en el medio — paso de verdad: el destino se creo, la persona confirmo,
 * y la regla murio ahi con un mensaje que no decia nada.
 */
type Operacion = { que: string; permiso: string };

const PERMISOS = {
  zona: { que: "buscar el dominio", permiso: "Zone → Zone: Read" },
  leerDestinos: {
    que: "leer los destinos",
    permiso: "Account → Email Routing Addresses: Read",
  },
  crearDestino: {
    que: "crear el destino del reenvío",
    permiso: "Account → Email Routing Addresses: Edit",
  },
  borrarDestino: {
    que: "borrar el destino sin confirmar",
    permiso: "Account → Email Routing Addresses: Edit",
  },
  leerReglas: {
    que: "leer los reenvíos",
    permiso: "Zone → Email Routing Rules: Read",
  },
  crearRegla: {
    que: "crear el reenvío",
    permiso: "Zone → Email Routing Rules: Edit",
  },
} as const;

/** Cloudflare dice "Authentication error" tanto para 403 como dentro de un 200. */
function pareceFaltaDePermiso(status: number, msg: string) {
  return status === 403 || status === 401
    || /authentication error|not authorized|permission|forbidden/i.test(msg);
}

async function cf(token: string, path: string, init: RequestInit = {}, op?: Operacion) {
  let r: Response;
  try {
    r = await fetch(`${CF_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    throw new ErrorDeCloudflare(`No se pudo hablar con Cloudflare: ${e}`, 502);
  }

  const body = await r.json().catch(() => null);
  if (!body?.success) {
    // El mensaje de Cloudflare se propaga tal cual. Es lo unico que distingue
    // "al token le falta permiso" de "ese destino no esta confirmado", y son
    // dos problemas con arreglos completamente distintos. Lo que le agregamos
    // es el contexto que Cloudflare no da: en que paso se cayo y que permiso
    // necesita ese paso.
    const errores = (body?.errors || []) as { message?: string; code?: number }[];
    const codigos = errores.map((e) => Number(e?.code)).filter(Boolean);
    // El CODIGO importa mas que el texto: 10000 es "Authentication error" y
    // es el unico que significa "el token no puede hacer esto". Todo lo demas
    // —validacion, duplicados, limites— tiene codigo propio y otro arreglo.
    const crudo = errores.map((e) => e?.message).filter(Boolean).join(" · ")
      || `respondió ${r.status}`;
    const conCodigo = codigos.length ? `${crudo} [${codigos.join(", ")}]` : crudo;

    if (op && pareceFaltaDePermiso(r.status, crudo)) {
      throw new ErrorDeCloudflare(
        `no pudo ${op.que} (${conCodigo}). Al token le falta el permiso `
          + `«${op.permiso}», o ese permiso no alcanza a este dominio.`,
        403, codigos,
      );
    }
    throw new ErrorDeCloudflare(op ? `${op.que}: ${conCodigo}` : conCodigo, 502, codigos);
  }
  return body.result;
}

/**
 * La zona y la cuenta del dominio.
 *
 * Se pueden fijar por entorno para un token con permisos minimos: buscar la
 * zona por nombre necesita Zone:Read, que un token de solo Email Routing no
 * tiene por que tener.
 */
async function zonaDe(token: string, dominio: string) {
  const zoneId = (Deno.env.get("CLOUDFLARE_ZONE_ID") || "").trim();
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "").trim();
  if (zoneId && accountId) return { zoneId, accountId };

  const zonas = await cf(token, `/zones?name=${encodeURIComponent(dominio)}`,
    {}, PERMISOS.zona);
  const z = (zonas || [])[0];
  if (!z?.id || !z?.account?.id) {
    throw new ErrorDeCloudflare(
      `El dominio ${dominio} no aparece en esta cuenta de Cloudflare.`, 404);
  }
  return { zoneId: z.id as string, accountId: z.account.id as string };
}

/** Pagina hasta agotar. El tope existe para no colgarse si la API se rompe. */
async function todasLasPaginas(token: string, base: string, op: Operacion) {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await cf(token, `${base}${base.includes("?") ? "&" : "?"}per_page=50&page=${page}`,
      {}, op);
    const lote = Array.isArray(r) ? r : [];
    out.push(...lote);
    if (lote.length < 50) break;
  }
  return out;
}

async function destinosDe(token: string, accountId: string) {
  const crudos = await todasLasPaginas(
    token, `/accounts/${accountId}/email/routing/addresses`, PERMISOS.leerDestinos);
  return crudos.map((d: Record<string, unknown>) => ({
    email: String(d.email || "").toLowerCase(),
    // `verified` viene como fecha cuando esta confirmado, y null cuando no.
    confirmado: !!d.verified,
    tag: String(d.tag || ""),
  }));
}

type Regla = { tag: string; alias: string; destinos: string[]; activa: boolean };

function normalizarRegla(r: Record<string, any>): Regla | null {
  const matcher = (r.matchers || []).find(
    (m: Record<string, unknown>) => m?.field === "to" && m?.type === "literal");
  const accion = (r.actions || []).find(
    (a: Record<string, unknown>) => a?.type === "forward");
  if (!matcher || !accion) return null; // reglas de drop o de worker: no nos hablan
  return {
    tag: String(r.tag || r.id || ""),
    alias: String(matcher.value || "").toLowerCase(),
    destinos: (accion.value || []).map((v: unknown) => String(v).toLowerCase()),
    activa: r.enabled !== false,
  };
}

async function reglasDe(token: string, zoneId: string) {
  const crudas = await todasLasPaginas(
    token, `/zones/${zoneId}/email/routing/rules`, PERMISOS.leerReglas);
  // El predicado no es adorno: `filter(Boolean)` deja el `| null` en el tipo,
  // y el que consume esto lo terminaba tapando con un `!`.
  return crudas.map(normalizarRegla).filter((r): r is Regla => r !== null);
}

/**
 * El catch-all: la regla que se lleva todo lo que no matchea ninguna otra.
 *
 * DEVUELVE `ilegible` Y NO MIENTE. La version anterior se tragaba cualquier
 * error y contestaba "apagado", asi que un token sin permiso para leerlo
 * producia un diagnostico que decia "catch-all: apagado" con total seguridad
 * — y con el catch-all encendido el correo llega igual sin ninguna regla. Eso
 * mando a buscar el problema donde no estaba.
 *
 * "No hay catch-all" y "no lo puedo leer" son dos cosas distintas y ahora se
 * distinguen.
 */
async function catchAllDe(token: string, zoneId: string) {
  try {
    const r = await cf(token, `/zones/${zoneId}/email/routing/rules/catch_all`);
    const accion = (r?.actions || []).find(
      (a: Record<string, unknown>) => a?.type === "forward");
    return {
      activo: r?.enabled === true && !!accion,
      ilegible: false,
      destinos: (accion?.value || []).map((v: unknown) => String(v).toLowerCase()),
    };
  } catch (err) {
    return {
      activo: false,
      ilegible: true,
      motivo: String((err as ErrorDeCloudflare)?.message || err),
      destinos: [] as string[],
    };
  }
}

/** Todo el estado del correo del dominio, de una. */
async function estadoDelDominio(token: string, dominio: string) {
  const { zoneId, accountId } = await zonaDe(token, dominio);
  const [destinos, reglas, catchAll] = await Promise.all([
    destinosDe(token, accountId),
    reglasDe(token, zoneId),
    catchAllDe(token, zoneId),
  ]);
  return { zoneId, accountId, dominio, destinos, reglas, catchAll };
}

/**
 * Si a esa direccion le llega el correo HOY.
 *
 * Es la misma regla que `src/modules/correoDeEquipo.js` aplica en la pantalla,
 * escrita dos veces a proposito: alla decide que boton mostrar, aca decide si
 * sale un mail. La pantalla se puede saltear; esta no.
 */
function recibeMail(email: string, estado: {
  destinos: { email: string; confirmado: boolean }[];
  reglas: { alias: string; destinos: string[]; activa: boolean }[];
  catchAll: { activo: boolean; destinos: string[] };
}) {
  const dir = email.toLowerCase();
  const confirmados = new Set(
    estado.destinos.filter((d) => d.confirmado).map((d) => d.email));

  const regla = estado.reglas.find((r) => r.alias === dir && r.activa);
  if (regla) return regla.destinos.some((d) => confirmados.has(d));

  return estado.catchAll.activo && estado.catchAll.destinos.some((d) => confirmados.has(d));
}

/* ═══════════════════════════════ handler ═══════════════════════════════ */

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
    // Vale igual para el correo: crear un alias es crear una identidad de la
    // empresa, y ademas decide a que casilla ajena se desvia correo.
    const { data: caller } = await supabase.from("platform_admins")
      .select("rol").eq("user_id", callerId).maybeSingle();
    if (caller?.rol !== "owner") {
      return json({ error: "Sólo el dueño de la plataforma puede dar de alta" }, 403);
    }

    const body = await req.json();
    const accion = String(body.accion || (body.resetear === true ? "resetear" : "sumar"));

    /* ── 2. Los dominios de la empresa ── */
    const { data: dominios } = await supabase.from("staff_dominios").select("dominio");
    const permitidos = (dominios || []).map((d: { dominio: string }) => d.dominio);
    if (permitidos.length === 0) {
      return json({ error: "No hay ningún dominio de empresa configurado." }, 500);
    }

    /* ═══════ Acciones sobre el CORREO de trabajo ═══════ */

    if (accion === "correos" || accion === "crear_correo"
      || accion === "reenviar_confirmacion" || accion === "diagnostico") {
      const cfToken = tokenDeCloudflare();
      if (!cfToken) {
        return json({
          error: "Falta el token de Cloudflare en los secretos de la función "
            + `(${NOMBRES_DEL_TOKEN[0]}). Necesita permiso de Email Routing.`,
        }, 503);
      }

      const dominio = permitidos.includes(String(body.dominio || "").toLowerCase())
        ? String(body.dominio).toLowerCase()
        : permitidos[0];

      /* Que puede y que no puede hacer el token, medido.
       *
       * Existe porque adivinar sale caro: el alta se cayo con "Authentication
       * error" a secas y no habia forma de saber en cual de las cinco
       * llamadas. Esto corre las cinco y dice cual falla.
       *
       * LA SONDA DE ESCRITURA NO CREA NADA. Manda un POST a proposito
       * invalido (cuerpo vacio): si al token le falta el permiso, Cloudflare
       * contesta 10000 ANTES de mirar el cuerpo; si lo tiene, contesta un
       * error de validacion. Los dos casos se distinguen por el codigo, y
       * ninguno deja una regla dando vueltas.
       */
      if (accion === "diagnostico") {
        const pasos: Record<string, unknown>[] = [];
        const probar = async (nombre: string, fn: () => Promise<unknown>) => {
          try {
            const r = await fn();
            pasos.push({ paso: nombre, ok: true, detalle: r });
            return r;
          } catch (err) {
            const e = err as ErrorDeCloudflare;
            pasos.push({
              paso: nombre, ok: false,
              error: String(e?.message || err),
              codigos: e?.codigos || [],
            });
            return null;
          }
        };

        const porEntorno = !!(Deno.env.get("CLOUDFLARE_ZONE_ID") || "").trim()
          && !!(Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || "").trim();

        const zona = await probar("1. encontrar la zona", async () => {
          const z = await zonaDe(cfToken, dominio);
          return { ...z, origen: porEntorno ? "secretos de la función" : "búsqueda por nombre" };
        }) as { zoneId: string; accountId: string } | null;

        if (zona) {
          await probar("2. leer los destinos (cuenta)",
            async () => ({ cantidad: (await destinosDe(cfToken, zona.accountId)).length }));
          await probar("3. leer los reenvíos (zona)",
            async () => ({ cantidad: (await reglasDe(cfToken, zona.zoneId)).length }));
          await probar("4. leer el catch-all (zona)",
            () => catchAllDe(cfToken, zona.zoneId));
          await probar("5. sonda: ¿puede ESCRIBIR reenvíos? (no crea nada)", async () => {
            try {
              await cf(cfToken, `/zones/${zona.zoneId}/email/routing/rules`,
                { method: "POST", body: "{}" }, PERMISOS.crearRegla);
            } catch (err) {
              const e = err as ErrorDeCloudflare;
              if (e?.codigos?.includes(10000) || e?.status === 403) throw err;
              // Cualquier otro error significa que Cloudflare llego a mirar el
              // cuerpo: el permiso esta.
              return { escribe: true, cloudflareDijo: e?.message };
            }
            // No deberia pasar: un POST vacio no puede salir bien.
            return { escribe: true, raro: "el POST vacío no falló" };
          });
        }

        const fallo = pasos.find((p) => !p.ok);
        return json({
          ok: true, dominio, pasos,
          resumen: fallo
            ? `Se cae en «${fallo.paso}». ${fallo.error}`
            : "El token puede hacer todo lo que el alta necesita.",
        });
      }

      /* Leer el estado y devolverlo tal cual: la pantalla decide que mostrar. */
      if (accion === "correos") {
        const e = await estadoDelDominio(cfToken, dominio);
        return json({
          ok: true, dominio,
          reglas: e.reglas, catchAll: e.catchAll,
          // Los destinos salen sin el `tag`: es un identificador interno de
          // Cloudflare que la pantalla no usa y que no tiene por que viajar.
          destinos: e.destinos.map((d) => ({ email: d.email, confirmado: d.confirmado })),
        });
      }

      /* Reenviar la confirmacion a un destino que sigue sin confirmar. */
      if (accion === "reenviar_confirmacion") {
        const personal = String(body.personal || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personal)) {
          return json({ error: "Ese correo personal no parece válido" }, 400);
        }
        const e = await estadoDelDominio(cfToken, dominio);
        const destino = e.destinos.find((d) => d.email === personal);
        if (!destino) return json({ error: "Ese correo no está cargado como destino." }, 404);
        if (destino.confirmado) {
          return json({ ok: true, yaEstaba: true, message: "Ese correo ya está confirmado." });
        }

        // Cloudflare no expone un "reenviar": la unica forma es borrar y
        // volver a crear. Se hace SOLO con destinos sin confirmar, que no
        // entregan nada — borrar uno confirmado si romperia reenvios que hoy
        // funcionan.
        await cf(cfToken, `/accounts/${e.accountId}/email/routing/addresses/${destino.tag}`,
          { method: "DELETE" }, PERMISOS.borrarDestino);
        await cf(cfToken, `/accounts/${e.accountId}/email/routing/addresses`,
          { method: "POST", body: JSON.stringify({ email: personal }) },
          PERMISOS.crearDestino);
        return json({
          ok: true,
          message: `Le mandamos otro mail a ${personal} para que confirme.`,
        });
      }

      /* Crear (o retomar) el correo de trabajo.
       *
       * ── SIMPLE Y SIN FRENOS (21/ago, decision de Ricky) ──
       * Antes frenaba de dos formas y las dos molestaban mas de lo que
       * protegian: si Cloudflare no dejaba crear la REGLA cortaba el alta, y si
       * el destino ya estaba cargado no mandaba nada y tampoco decia por que —
       * parecia que el boton no hacia nada.
       *
       * Ahora hace lo minimo y lo CUENTA:
       *   1. si el destino no existe, lo crea. Eso es lo unico que dispara el
       *      mail de confirmacion;
       *   2. intenta la regla y, si no puede, sigue igual;
       *   3. devuelve el estado real, para que la pantalla diga que paso.
       *
       * Quien decide si se avanza es el duenio mirando Cloudflare, y es el
       * unico que puede: la API no puede confirmar un destino por su duenio, y
       * el catch-all —que hace llegar el correo sin ninguna regla— no siempre
       * se puede leer con este token. */
      const alias = String(body.alias || "").trim().toLowerCase();
      const personal = String(body.personal || "").trim().toLowerCase();

      if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(alias) || alias.length > 64) {
        return json({ error: "Ese alias no sirve como dirección de correo." }, 400);
      }
      if (!/^[^@s]+@[^@s]+.[^@s]+$/.test(personal)) {
        return json({ error: "Ese correo personal no parece válido" }, 400);
      }
      if (permitidos.includes(dominioDe(personal))) {
        // Un alias que reenvia al dominio de la empresa reenvia a otro alias:
        // no hay casilla real al final y el correo da vueltas o se pierde.
        return json({
          error: "El correo personal no puede ser del dominio de la empresa.",
        }, 400);
      }

      const email = `${alias}@${dominio}`;
      let e = await estadoDelDominio(cfToken, dominio);

      const reglaExistente = e.reglas.find((r) => r.alias === email);
      if (reglaExistente && !reglaExistente.destinos.includes(personal)) {
        return json({
          error: `${email} ya reenvía a ${reglaExistente.destinos[0]}. `
            + "Cambiarlo se hace en Cloudflare, a propósito: redirigir el correo "
            + "de alguien es la forma más silenciosa de robarle la cuenta.",
        }, 409);
      }

      /* 1. El destino. Crearlo es lo UNICO que dispara el mail de confirmacion. */
      const yaEstaba = e.destinos.some((d) => d.email === personal);
      if (!yaEstaba) {
        await cf(cfToken, `/accounts/${e.accountId}/email/routing/addresses`,
          { method: "POST", body: JSON.stringify({ email: personal }) },
          PERMISOS.crearDestino);
        e = await estadoDelDominio(cfToken, dominio);
      }

      const confirmado = e.destinos.some((d) => d.email === personal && d.confirmado);

      /* 2. La regla, BEST EFFORT. Si el token no la puede escribir no se frena
       *    nada: el correo puede estar llegando igual por catch-all, y quien
       *    mira Cloudflare sabe mejor que esta funcion si el alias anda. */
      let reglaCreada = false;
      let reglaFallo: string | null = null;
      if (!reglaExistente && confirmado) {
        try {
          await cf(cfToken, `/zones/${e.zoneId}/email/routing/rules`, {
            method: "POST",
            body: JSON.stringify({
              name: `Dico · ${email}`,
              enabled: true,
              matchers: [{ type: "literal", field: "to", value: email }],
              actions: [{ type: "forward", value: [personal] }],
            }),
          }, PERMISOS.crearRegla);
          reglaCreada = true;
        } catch (err) {
          reglaFallo = String((err as ErrorDeCloudflare)?.message || err);
          console.warn("staff-invite: la regla no se pudo crear:", reglaFallo);
        }
      }

      /* 3. El estado real, sin inventar. */
      const message = !yaEstaba
        ? `Le mandamos un mail a ${personal} para que confirme el reenvío.`
        : confirmado
          ? `${personal} ya está confirmado en Cloudflare.`
          : `${personal} ya estaba cargado y sin confirmar. No se manda otro mail `
            + "automáticamente: usá Reenviar si no le llegó.";

      return json({
        ok: true, email, personal,
        yaEstaba, confirmado,
        regla: !!reglaExistente || reglaCreada,
        reglaFallo,
        paso: confirmado ? "listo" : "esperando_confirmacion",
        message,
      });
    }

    /* ═══════ Acciones sobre la CUENTA ═══════ */

    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "Ese email no parece válido" }, 400);
    }

    /* ── 3. Tiene que ser del dominio de la empresa ── */
    if (!permitidos.includes(dominioDe(email))) {
      return json({
        error: `A la consola sólo entran los correos de la empresa `
          + `(${permitidos.map((d: string) => "@" + d).join(", ")}).`,
      }, 400);
    }

    /* ── 4. Resetear la clave de alguien que ya esta ── */
    // El duenio manda el link; la contraseña la elige la persona. Nadie mas la
    // ve, ni siquiera quien la pidio.
    if (accion === "resetear") {
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

    /* ── 5. La invitacion sale SIN chequear el reenvio ──
     * Habia un guard que consultaba Cloudflare y frenaba si la direccion no
     * figuraba recibiendo correo. Se saco: se equivocaba en el caso normal.
     * El correo puede estar llegando por CATCH-ALL —una regla que se lleva
     * todo lo que no matchea ninguna otra— y este token no siempre puede leer
     * el catch-all, asi que el guard veia "no recibe" donde si recibia y
     * bloqueaba un alta perfectamente sana.
     *
     * Si el mail no llega, el remedio esta a mano: el boton Reenviar de la
     * pantalla de Equipo. Eso es mas barato que un chequeo que se equivoca. */

    /* ── 6. La cuenta ── */
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

    /* ── 7. Al equipo, con su puesto ── */
    // `rol: 'staff'` explicito, y solo al crear: un upsert que pisara el rol
    // convertiria al duenio en staff si alguien lo reinvitara por error, y la
    // plataforma quedaria sin nadie que pueda repartir accesos. El puesto va
    // en el mismo insert y por el mismo motivo no se pisa al reinvitar: para
    // cambiarlo esta `cambiar_puesto`, que es una accion aparte y deliberada.
    //
    // El puesto se valida ACA ademas de en el CHECK de la tabla: un puesto
    // invalido tiene que dar un mensaje, no un error de constraint.
    const puesto = String(body.puesto || PUESTO_POR_DEFECTO).toLowerCase().trim();
    if (!PUESTOS_VALIDOS.includes(puesto)) {
      return json({ error: `«${puesto}» no es un puesto de la consola.` }, 400);
    }

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
    if (err instanceof ErrorDeCloudflare) {
      console.error("staff-invite: Cloudflare", err.message);
      return json({ error: `Cloudflare: ${err.message}` }, err.status);
    }
    console.error("staff-invite error:", err);
    return json({ error: "No se pudo dar de alta" }, 500);
  }
});
