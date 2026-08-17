// api/og.js — og: tags por tenant, solo para bots de vista previa.
//
// El index.html del build lleva los meta del CLIENT horneado: compartir
// cualquier tenant por WhatsApp mostraba la marca equivocada. Renderizar el
// head por tenant para TODOS los visitantes exigiria SSR; pero el unico que
// lee og: sin ejecutar JS es el bot de la vista previa. Asi que vercel.json
// rutea aca SOLO a esos bots (match por User-Agent) y los humanos siguen
// recibiendo la SPA estatica de siempre.
//
// Googlebot NO esta en la lista a proposito: ejecuta JS y servirle una
// pagina distinta que a los humanos es cloaking.
//
// Mismo patron que api/manifest.js: slug por Host, get_catalog con la anon
// key, y ante cualquier falla una respuesta generica de Dico — una vista
// previa de mas vale mas que un 500.

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

function esc(s) {
  return String(s || '').replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}

export default async function handler(req, res) {
  const host = req.headers.host || 'divianco.app';
  const slug = slugFromHost(host);

  // Sin tenant (raiz): la marca de la plataforma.
  let title = 'Dico';
  let description = 'Tu negocio online en minutos: catálogo, pedidos y números reales.';
  let image = null;
  let color = '#0f0e0d';

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
          title = s.biz_name;
          description = s.slogan || `Mirá el catálogo de ${s.biz_name} y hacé tu pedido online.`;
          image = s.cover_url || s.logo_url || null;
          color = s.logo_color || color;
        }
      }
    } catch {
      // Cae a la marca generica.
    }
  }

  const url = `https://${host}/`;
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="${esc(color)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(title)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}
</head>
<body>
<h1>${esc(title)}</h1>
<p>${esc(description)}</p>
<a href="${esc(url)}">${esc(url)}</a>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Igual que el manifest: 5 min fresco, un dia stale mientras revalida.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
