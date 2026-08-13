// api/manifest.js — manifest PWA por tenant (Vercel serverless).
//
// El manifest estatico que emite vite (/manifest.json) lleva el nombre y el
// icono del client del BUILD. En el edificio todos los tenants comparten ese
// build, asi que "Agregar a pantalla de inicio" instalaba siempre el mismo
// local. Este endpoint lo resuelve por tenant.
//
// El slug sale del query (?slug=) o, si no viene, del Host: asi el manifest
// tambien es correcto cuando el browser lo pide sin pasar por nuestro JS.

const PLATFORM_ROOTS = ['divianco.app'];

function slugFromHost(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  for (const root of PLATFORM_ROOTS) {
    if (h === root || h === `www.${root}`) return null;
    if (h.endsWith(`.${root}`)) {
      const prefix = h.slice(0, -(root.length + 1));
      if (!prefix.includes('.') && prefix !== 'www') return prefix;
    }
  }
  return null;
}

function contrastOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#111111' : '#ffffff';
}

function letterIcon(letter, bg) {
  const ch = String(letter || 'H').trim().charAt(0).toUpperCase() || 'H';
  const fg = contrastOn(bg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">`
    + `<rect width="512" height="512" rx="112" fill="${bg}"/>`
    + `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="${fg}"`
    + ` font-family="system-ui,-apple-system,Segoe UI,sans-serif"`
    + ` font-size="300" font-weight="700">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const slug = url.searchParams.get('slug') || slugFromHost(req.headers.host);

  // Sin tenant (raiz de la plataforma): manifest de Hermes, no de un local.
  let name = 'Hermes';
  let color = '#0f0e0d';
  let letter = 'H';

  if (slug) {
    try {
      const base = process.env.VITE_SUPABASE_URL;
      const key = process.env.VITE_SUPABASE_ANON_KEY;
      const r = await fetch(`${base}/rest/v1/rpc/get_catalog`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_tenant_slug: slug }),
      });
      if (r.ok) {
        const data = await r.json();
        const s = data?.settings || {};
        if (s.biz_name) {
          name = s.biz_name;
          color = s.logo_color || color;
          letter = s.logo_letter || name.charAt(0);
        }
      }
    } catch {
      // Se cae al manifest generico: un manifest de mas vale mas que un 500
      // que rompe la instalacion de la PWA.
    }
  }

  const icon = letterIcon(letter, color);
  const manifest = {
    name,
    short_name: name.slice(0, 12),
    start_url: '/',
    display: 'standalone',
    theme_color: color,
    background_color: color,
    icons: [
      { src: icon, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: icon, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  // Cachea en el edge pero permite refrescar rapido si el tenant cambia su
  // marca: 5 min fresco, 1 dia sirviendo el viejo mientras revalida.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(JSON.stringify(manifest));
}
