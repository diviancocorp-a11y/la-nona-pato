// src/lib/slugify.js
// Nombre del negocio -> slug candidato para el subdominio.
//
// El slug ES el subdominio (<slug>.divianco.app), asi que tiene que cumplir
// las mismas reglas que el CHECK de tenants (migracion 0014): minusculas,
// numeros y guiones, sin empezar ni terminar en guion, entre 2 y 40.
//
// Se sugiere, no se impone: el dueño puede escribir el suyo. La validacion
// de verdad la hace el server (slug_available + el CHECK), porque esto corre
// en el cliente y no es garantia de nada.

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])$/;

// Reexportada, NO duplicada: la fuente del lado JS es tenantHost.js. Tener
// dos copias significaba que el form podia aceptar un slug que el resolver
// de hostname despues no reconoce como tenant.
export { RESERVED_SUBDOMAINS as RESERVED } from './tenantHost';
import { RESERVED_SUBDOMAINS as RESERVED } from './tenantHost';

/**
 * "Pizzería Doña Rosa" -> "pizzeria-dona-rosa"
 * Saca tildes y ñ porque un subdominio con caracteres no-ASCII se convierte
 * en punycode (xn--...) y el dueño ve una URL que no reconoce.
 */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // tildes
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // todo lo demas es separador
    .replace(/^-+|-+$/g, '')           // sin guiones en los bordes
    .slice(0, 40)
    .replace(/-+$/, '');               // el slice pudo dejar uno colgando
}

/**
 * Valida en el cliente para dar feedback inmediato.
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function validateSlug(slug) {
  const s = String(slug || '');
  if (!s) return { ok: false, reason: 'Elegí una dirección para tu local' };
  if (s.length < 2) return { ok: false, reason: 'Muy corta: mínimo 2 caracteres' };
  if (s.length > 40) return { ok: false, reason: 'Muy larga: máximo 40 caracteres' };
  if (!SLUG_RE.test(s)) {
    return { ok: false, reason: 'Solo minúsculas, números y guiones (sin guion al principio ni al final)' };
  }
  if (RESERVED.has(s)) return { ok: false, reason: 'Esa dirección está reservada por la plataforma' };
  return { ok: true, reason: null };
}
