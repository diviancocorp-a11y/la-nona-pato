// src/lib/tenantHead.js
// El <head> segun el tenant, en runtime.
//
// Problema: index.html se arma en BUILD time (plugin business-html-injection
// en vite.config.js), asi que el titulo, el theme-color y el favicon quedan
// horneados con los del client del build. En el edificio eso significa que
// mala-miga.divianco.app mostraba "Cochi" en la pestania, el rojo de Cochi en
// la barra del browser y el favicon de Cochi.
//
// Esto lo corrige despues de resolver el tenant. Lo que NO puede arreglar son
// las og: tags para compartir en WhatsApp/redes: los crawlers no ejecutan JS,
// leen el HTML crudo. Eso necesita render en el edge y queda pendiente.

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapa texto para meterlo en un atributo/SVG sin romperlo.
 * Una sola pasada y con clase de caracteres a proposito: escrito como
 * `.replace(/</g, ...)` encadenado, la secuencia `</g` matchea el patron de
 * etiqueta de cierre de check-file-integrity.mjs y da falso positivo de JSX.
 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

/** Color de texto legible sobre un fondo dado (luminancia relativa). */
export function contrastOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Ponderacion percentual estandar (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#111111' : '#ffffff';
}

/**
 * Favicon SVG con la inicial del negocio sobre su color.
 * Se genera en el cliente: un tenant recien creado tiene identidad visual
 * propia sin subir ningun archivo. Si despues carga un logo, gana el logo.
 */
export function letterFavicon(letter, bgColor) {
  const ch = esc(String(letter || 'H').trim().charAt(0).toUpperCase() || 'H');
  const bg = /^#[0-9a-f]{6}$/i.test(bgColor || '') ? bgColor : '#111111';
  const fg = contrastOn(bg);
  // El SVG va en template literals a proposito: check-file-integrity.mjs
  // despoja los backticks antes de buscar JSX, y con comillas simples estas
  // etiquetas se confunden con JSX en un .js.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<rect width="64" height="64" rx="14" fill="${bg}"/>`
    + `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="${fg}"`
    + ` font-family="system-ui,-apple-system,Segoe UI,sans-serif"`
    + ` font-size="38" font-weight="700">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Crea o actualiza un <meta> por atributo name/property. */
function setMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Reemplaza TODOS los <link rel=X> por uno solo apuntando a href. */
function setLink(rel, href, extra = {}) {
  if (!href) return;
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach((n) => n.remove());
  const el = document.createElement('link');
  el.setAttribute('rel', rel);
  el.setAttribute('href', href);
  for (const [k, v] of Object.entries(extra)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

/**
 * Aplica la identidad del tenant al <head>.
 * @param {Object} settings - el bloque settings que devuelve get_catalog
 */
export const CATALOG_THEMES = ['ambar', 'noche', 'carbon'];

/**
 * Tema del catalogo (paleta de superficie). ACOTADO a 3 opciones a proposito
 * — no confundir con logo_color, que es hex libre y es el acento de marca.
 *
 * En el edificio esto no llegaba nunca: quien lo aplicaba (App.jsx) lo saca
 * de fetchSettings(), que apunta a la tabla `settings` inexistente aca. Los
 * 5 tenants quedaban forzados a 'ambar'.
 */
export function applyCatalogTheme(theme) {
  if (typeof document === 'undefined') return;
  const t = CATALOG_THEMES.includes(theme) ? theme : 'ambar';
  document.body.setAttribute('data-cp-theme', t);
  // Cache para el anti-flash de index.html: la proxima carga pinta el tema
  // correcto antes de que vuelva el RPC.
  try { localStorage.setItem('cp_theme', t); } catch { /* empty */ }
  return t;
}

export function applyTenantHead(settings) {
  if (typeof document === 'undefined' || !settings) return;

  applyCatalogTheme(settings.catalog_theme);

  const name = settings.biz_name || 'Hermes';
  const color = settings.logo_color || '#111111';
  const letter = settings.logo_letter || name.charAt(0);

  document.title = settings.slogan ? `${name} — ${settings.slogan}` : name;

  if (settings.description) setMeta('name', 'description', settings.description);

  // Las dos variantes de theme-color (light/dark) traen media queries desde
  // index.html; setMeta las pisa por 'name', asi que se unifican en el color
  // del tenant. Es correcto: es SU marca en la barra del browser.
  document.head
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((n) => n.setAttribute('content', color));
  setMeta('name', 'theme-color', color);

  const icon = settings.logo_url || letterFavicon(letter, color);
  setLink('icon', icon);
  setLink('apple-touch-icon', icon);

  // El manifest estatico (/manifest.json) trae el nombre y el icono del
  // build. Se apunta al endpoint por tenant para que "Agregar a inicio"
  // instale el local correcto y no siempre el del client del build.
  if (settings.__slug) {
    setLink('manifest', `/api/manifest?slug=${encodeURIComponent(settings.__slug)}`);
  }
}
