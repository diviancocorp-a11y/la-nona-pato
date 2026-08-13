// src/lib/tenantHost.js
// Resolucion de tenant a partir del hostname (edificio multi-tenant).
//
// Con *.divianco.app apuntando al proyecto, un MISMO build sirve a todos los
// tenants: quien decide que catalogo se muestra es el hostname, no el build.
//
// Tres formas de entrar:
//   1. <slug>.divianco.app  -> subdominio de plataforma. Se parsea aca mismo,
//      sin round-trip a la DB: pasa en CADA carga y no puede costar latencia
//      antes del primer paint.
//   2. divianco.app (o www) -> raiz. No hay tenant: es la landing + signup.
//   3. micomercio.com.ar    -> dominio propio del cliente. No se puede deducir
//      del host, hay que preguntarle a la DB (RPC get_tenant_by_host, 0014).
//
// En local y en las URLs *.vercel.app no hay subdominio de tenant util, asi
// que se cae al slug del build (business.slug) y el dev sigue funcionando
// como siempre.

// Dominios raiz de la plataforma. Un host que termina en alguno de estos y
// tiene UNA etiqueta adelante es un subdominio de tenant.
export const PLATFORM_ROOTS = ['divianco.app'];

// Subdominios que nunca son un tenant aunque matcheen la forma. Espeja la
// lista de tenants_slug_reserved en la migracion 0014: si divergen, alguien
// podria registrar un slug que el front despues no resuelve.
export const RESERVED_SUBDOMAINS = new Set([
  'www', 'admin', 'api', 'app', 'mail', 'smtp', 'imap', 'pop', 'ftp',
  'blog', 'docs', 'help', 'support', 'status', 'cdn', 'static', 'assets',
  'dev', 'test', 'staging', 'demo', 'preview', 'localhost',
  'hermes', 'divianco', 'grupodivianco', 'panel', 'dashboard',
  'login', 'signup', 'register', 'account', 'billing', 'pay', 'checkout',
]);

/** Saca el puerto y normaliza a minusculas. */
export function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

/**
 * Clasifica un hostname.
 *
 * @param {string} host - location.hostname (con o sin puerto)
 * @returns {{ kind: 'tenant'|'root'|'unknown', slug: string|null }}
 *   - tenant : subdominio de plataforma valido; slug listo para usar
 *   - root   : la raiz de la plataforma -> landing/signup, sin tenant
 *   - unknown: no es de la plataforma (dominio propio, localhost, *.vercel.app).
 *              Hay que resolverlo por DB o caer al slug del build.
 */
export function classifyHost(host) {
  const h = normalizeHost(host);
  if (!h) return { kind: 'unknown', slug: null };

  for (const root of PLATFORM_ROOTS) {
    if (h === root) return { kind: 'root', slug: null };

    if (h.endsWith(`.${root}`)) {
      const prefix = h.slice(0, -(root.length + 1));
      // Solo UNA etiqueta: a.b.divianco.app no es un tenant valido. El cert
      // wildcard tampoco cubre multi-nivel, asi que ni llegaria hasta aca.
      if (prefix.includes('.')) return { kind: 'unknown', slug: null };
      // www.divianco.app es la raiz, no un tenant llamado "www".
      if (prefix === 'www') return { kind: 'root', slug: null };
      if (RESERVED_SUBDOMAINS.has(prefix)) return { kind: 'unknown', slug: null };
      return { kind: 'tenant', slug: prefix };
    }
  }

  return { kind: 'unknown', slug: null };
}

/**
 * Slug del tenant deducible SIN tocar la DB.
 * null significa "no se sabe todavia" (raiz, dominio propio o local), no
 * "no hay tenant" — el caller decide si preguntar a la DB o usar el fallback.
 */
export function tenantSlugFromHost(host) {
  const { kind, slug } = classifyHost(host);
  return kind === 'tenant' ? slug : null;
}

/** true si el host es la raiz de la plataforma (landing + signup). */
export function isPlatformRoot(host) {
  return classifyHost(host).kind === 'root';
}
