// src/services/paymentIntegrations.js
// Helpers para gestionar conexiones OAuth a pasarelas (MercadoPago, Modo, Stripe).
//
// La tabla payment_integrations guarda el access_token del comerciante. Solo el
// admin (authenticated) puede leer/escribir. Las edge functions usan service_role
// para acceder sin RLS al token (lo que mantiene el secret oculto del frontend).

import { supabase } from "../lib/supabase";
import { captureException } from "../lib/observability.js";
import business from "@business";
import { getTenantSlugSync } from "../lib/activeTenant";

// ── DUAL ──
// El legacy cobra con UNA cuenta de MP (la del negocio, sin tenant_id). El
// edificio tiene una POR negocio, asi que sus functions necesitan saber de
// quien es el cobro. Son functions distintas y no un parametro de mas: la del
// edificio ademas verifica que el pedido pertenezca a ese negocio.
const esPlataforma = () => business?.platform === true;

/**
 * Devuelve la integración activa de un provider, o null si no hay.
 * Solo devolvemos campos seguros para el frontend (NO access_token).
 */
export async function fetchActiveIntegration(provider) {
  const { data, error } = await supabase
    .from("payment_integrations")
    .select("id, provider, external_user_id, public_key, scopes, expires_at, is_active, connected_at, metadata")
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    console.error("fetchActiveIntegration:", error.message);
    return null;
  }
  return data;
}

/**
 * Desactiva (soft-delete) la integración activa de un provider.
 * Útil para "Desconectar MercadoPago".
 */
export async function disconnectIntegration(provider) {
  const { error } = await supabase
    .from("payment_integrations")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("is_active", true);
  if (error) { console.error("disconnectIntegration:", error.message); return false; }
  return true;
}

/**
 * Versión PÚBLICA de fetchActiveIntegration: usable desde el catálogo (anon).
 * Llama a edge function mp-status que devuelve solo campos seguros
 * (NUNCA access_token). Si MP no está conectado, devuelve { active: false }.
 *
 * Usar esto en lugar de fetchActiveIntegration cuando NO hay sesión auth.
 */
export async function fetchMpStatusPublic() {
  try {
    const body = esPlataforma() ? { tenant_slug: getTenantSlugSync() } : {};
    const { data, error } = await supabase.functions.invoke("mp-status", { body });
    if (error) {
      console.warn("fetchMpStatusPublic:", error.message);
      return { active: false };
    }
    // El edificio contesta `conectado`; el legacy, `active`. Se normaliza aca
    // para que el catalogo no tenga que saber contra cual esta hablando.
    if (esPlataforma()) {
      return { active: !!data?.conectado, ...(data || {}) };
    }
    return data || { active: false };
  } catch (e) {
    console.warn("fetchMpStatusPublic exception:", e);
    // Reporte a Sentry: si MP API falla, queremos saber cuántas veces y por qué
    captureException(e, { tags: { source: 'fetchMpStatusPublic' } });
    return { active: false };
  }
}


/**
 * Conexión manual de MercadoPago (sin OAuth).
 *
 * MP no permite OAuth para apps de tipo "Integración propia" (que es el default
 * del nuevo wizard MP). Por eso pedimos al admin que copie su Access Token
 * productivo y lo pegue acá. Patrón canónico de Checkout Pro multi-tenant.
 *
 * Llama a la edge function mp-connect-manual que valida el token con MP
 * (GET /users/me) y persiste en payment_integrations.
 *
 * @param {string} accessToken - Access Token productivo del comerciante
 * @param {string} [publicKey] - Public Key opcional
 * @returns {Promise<{ok, integration, mp_account, error}>}
 */
export async function connectMercadoPagoManual({ accessToken, publicKey }) {
  if (!accessToken?.trim()) {
    return { ok: false, error: "Access Token requerido" };
  }
  const { data, error } = await supabase.functions.invoke("mp-connect-manual", {
    body: { access_token: accessToken.trim(), public_key: publicKey?.trim() || null },
  });
  if (error) {
    console.error("connectMercadoPagoManual:", error.message);
    return { ok: false, error: error.message };
  }
  return data || { ok: false, error: "Respuesta vacía" };
}

// ─── DEPRECATED: OAuth flow ──────────────────────────────────────────────
// Se mantiene como código zombie por si MP eventualmente nos habilita
// apps de tipo "Plataforma de terceros" para flujo OAuth limpio.
// Hoy NO se usa porque MP rechaza OAuth para apps "Integración propia".

/**
 * @deprecated Usar connectMercadoPagoManual. OAuth no funciona con apps
 * de tipo "Integracion propia" (default del nuevo panel MP).
 * Lo consume MpCallback.jsx (ruta legacy del callback OAuth).
 */
export async function completeMercadoPagoOAuth({ code, redirectUri }) {
  const { data, error } = await supabase.functions.invoke("mp-oauth-callback", {
    body: { code, redirect_uri: redirectUri },
  });
  if (error) { console.error("completeMercadoPagoOAuth:", error.message); return { ok: false, error: error.message }; }
  return data || { ok: false };
}

/**
 * Crea una preference MP para una orden y devuelve init_point.
 * Llamar desde el Catalog público cuando el cliente eligió pagar con MP.
 */
export async function createMpPreference(orderId) {
  const fn = esPlataforma() ? "mp-preference" : "create-payment-preference";
  // El importe NO viaja: lo saca la function de la base. Si viniera de aca,
  // cualquiera pagaria $1 un pedido de $20.000.
  const body = esPlataforma()
    ? { tenant_slug: getTenantSlugSync(), order_id: orderId }
    : { orderId };

  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) { console.error("createMpPreference:", error.message); return null; }
  return data;
}
