// src/lib/activeTenant.js
// Quien es el tenant de ESTA carga.
//
// Orden de resolucion, de mas barato a mas caro:
//   1. Subdominio de plataforma (<slug>.divianco.app) -> sincronico, sin red.
//   2. Dominio propio del cliente -> RPC get_tenant_by_host (0014). Es el
//      unico caso que paga un round-trip, y es el menos frecuente.
//   3. Fallback al slug del build (business.slug) -> local, *.vercel.app y
//      cualquier host que no sea de la plataforma. Mantiene andando el dev.
//
// El resultado se cachea por carga: el hostname no cambia sin recargar.

import business from '@business';
import { supabase } from './supabase';
import { classifyHost } from './tenantHost';

let cachedSlug;          // undefined = sin resolver todavia; null = raiz
let inflight = null;     // promesa compartida: N llamadas -> 1 sola query

/**
 * Slug sin tocar la red. Sirve para el primer render.
 * Devuelve null si el host es la raiz de la plataforma o si hace falta la DB.
 */
export function getTenantSlugSync() {
  const { kind, slug } = classifyHost(
    typeof location !== 'undefined' ? location.hostname : ''
  );
  if (kind === 'tenant') return slug;
  if (kind === 'root') return null;
  // unknown: local, preview o dominio propio. El slug del build es lo mejor
  // que tenemos sin preguntar.
  return business.slug || null;
}

/**
 * Slug definitivo. Igual al sincronico salvo en dominios propios, donde
 * pregunta a la DB una sola vez.
 * @returns {Promise<string|null>}
 */
export async function resolveTenantSlug() {
  if (cachedSlug !== undefined) return cachedSlug;
  if (inflight) return inflight;

  const host = typeof location !== 'undefined' ? location.hostname : '';
  const { kind, slug } = classifyHost(host);

  if (kind === 'tenant') { cachedSlug = slug; return cachedSlug; }
  if (kind === 'root')   { cachedSlug = null; return cachedSlug; }

  // Host desconocido. Si el build ya trae slug (dev/preview), no gastamos
  // una query: ese es el tenant que se quiere ver.
  if (business.slug) { cachedSlug = business.slug; return cachedSlug; }

  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_tenant_by_host', { p_host: host });
      cachedSlug = (!error && data?.slug) ? data.slug : null;
    } catch {
      cachedSlug = null;
    } finally {
      inflight = null;
    }
    return cachedSlug;
  })();

  return inflight;
}

/** Solo para tests: vuelve al estado sin resolver. */
export function _resetTenantCache() {
  cachedSlug = undefined;
  inflight = null;
}
