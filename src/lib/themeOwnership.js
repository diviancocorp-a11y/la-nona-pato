import { isPlatformRoot } from './tenantHost';

export const THEME_OWNERS = Object.freeze({
  PLATFORM: 'platform',
  ADMIN: 'admin',
  CATALOG: 'catalog',
});

const PLATFORM_PATHS = /^\/(registro|consola|bienvenido|entrar)(?:\/|$)/;
const ADMIN_PATHS = /^\/(admin(?:\/|$)|mp-callback$)/;

/**
 * Resolves the visual authority before any runtime theme is applied.
 * Unknown paths follow the host: platform 404s stay platform-owned while
 * tenant/custom-domain 404s remain tenant-owned.
 */
export function resolveThemeOwner({ pathname = '/', hostname = '' } = {}) {
  if (ADMIN_PATHS.test(pathname)) return THEME_OWNERS.ADMIN;
  if (PLATFORM_PATHS.test(pathname)) return THEME_OWNERS.PLATFORM;
  if (pathname === '/') {
    return isPlatformRoot(hostname) ? THEME_OWNERS.PLATFORM : THEME_OWNERS.CATALOG;
  }
  return isPlatformRoot(hostname) ? THEME_OWNERS.PLATFORM : THEME_OWNERS.CATALOG;
}

/**
 * Marks the active document surface and removes catalog-only state when a
 * platform/admin route owns the page. Component tokens stay scoped locally.
 */
export function applyThemeOwner(owner) {
  if (typeof document === 'undefined') return owner;
  const normalized = Object.values(THEME_OWNERS).includes(owner)
    ? owner
    : THEME_OWNERS.PLATFORM;

  document.body.setAttribute('data-ui-owner', normalized);

  if (normalized !== THEME_OWNERS.CATALOG) {
    document.body.removeAttribute('data-cp-theme');
    document.body.style.background = '';
    document.documentElement.style.background = '';
  }

  return normalized;
}
