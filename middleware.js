// middleware.js — Edge Middleware de Vercel (framework-agnostic).
//
// POR QUE EXISTE: la regla de vercel.json que ruteaba bots a /api/og por
// User-Agent NO funcionaba para la raiz, que es justo lo que la gente
// comparte. Vercel resuelve el filesystem ANTES que los rewrites y para "/"
// ya existe index.html, asi que la regla no se evaluaba nunca: WhatsApp
// seguia leyendo los meta del build (decia "Cochi" en todos los tenants).
// El middleware corre ANTES del filesystem, que es el unico lugar donde se
// puede interceptar.
//
// Googlebot NO esta en la lista a proposito: ejecuta JS y servirle una
// pagina distinta que a los humanos es cloaking.
//
// OJO AL TOCAR ESTO: corre en TODAS las visitas de documento. Si tira una
// excepcion, Vercel responde 500 y el sitio se cae entero — por eso el
// cuerpo esta envuelto en try/catch y cualquier duda termina en seguir()
// (dejar pasar), nunca en cortar.

const BOTS = /WhatsApp|facebookexternalhit|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Discordbot/i;

// Los dos contratos del runtime de Vercel. Son los mismos headers que ponen
// `next()` y `rewrite()` de @vercel/edge; se escriben a mano para no sumar
// una dependencia al build por dos lineas.
function seguir() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

function reescribirA(url) {
  return new Response(null, { headers: { 'x-middleware-rewrite': url } });
}

export default function middleware(req) {
  try {
    const ua = req.headers.get('user-agent') || '';
    if (!BOTS.test(ua)) return seguir();
    return reescribirA(new URL('/api/og', req.url).toString());
  } catch {
    // Un bug aca no puede dejar sin catalogo a un negocio: pasa de largo.
    return seguir();
  }
}

// Solo requests de documento. Todo lo que tenga extension (.js, .png, .json)
// y las rutas de API quedan afuera: no hace falta pagar una invocacion edge
// por cada asset.
export const config = {
  matcher: '/((?!api/|assets/|brand/|clients/|.*\\.).*)',
};
