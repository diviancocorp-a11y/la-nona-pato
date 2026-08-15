// platform/scripts/_env.mjs
// Carga variables de entorno desde .env.scripts (en la raiz del repo) si existe.
//
// Por que existe: las variables exportadas viven en UNA terminal y no
// sobreviven a la siguiente. Copiar dos `export`/`$env:` y despues el comando
// funciona solo si los tres corren en la misma sesion — si cada uno abre su
// shell, el script recibe el entorno vacio y responde "Faltan SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY", que se lee como "la clave esta mal" cuando en
// realidad nunca llego.
//
// .env.scripts esta cubierto por `.env*` en .gitignore: no se puede commitear
// por accidente. Se usa ese nombre y no .env.local porque ese ya es del
// Vercel CLI.
//
// Precedencia: lo que YA este exportado en el entorno gana. El archivo es el
// fallback, no la autoridad — asi un `SUPABASE_URL=... node script.mjs` puntual
// sigue pudiendo pisar el archivo.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_FILE = join(ROOT, '.env.scripts');

export function cargarEnvDeArchivo(file = ENV_FILE) {
  if (!existsSync(file)) return false;
  let contenido;
  try {
    contenido = readFileSync(file, 'utf-8');
  } catch {
    return false;
  }
  for (const linea of contenido.split(/\r?\n/)) {
    if (!linea.trim() || linea.trim().startsWith('#')) continue;
    const m = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const clave = m[1];
    // Comillas opcionales; se sacan solo si abren y cierran.
    const valor = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
  return true;
}

// El archivo se crea con un placeholder para que solo haya que reemplazar una
// linea. Si llega sin reemplazar, el error natural seria un 401 de la API
// ("Invalid API key"), que manda a revisar la clave en vez de al archivo.
const PLACEHOLDER = /^REEMPLAZAR/i;

export function esPlaceholder(valor) {
  return typeof valor === 'string' && PLACEHOLDER.test(valor.trim());
}

/** Mensaje de error util: dice las dos formas de cargar las credenciales. */
export function faltanCredenciales(vars) {
  return [
    `Faltan ${vars.join(' / ')}.`,
    '',
    'Dos formas de cargarlas:',
    `  1) Crear ${ENV_FILE} con una linea por variable (queda fuera de git):`,
    '       SUPABASE_URL=https://wwwzdgprsooyjgkuyoav.supabase.co',
    '       SUPABASE_SERVICE_ROLE_KEY=...',
    '  2) Exportarlas y correr el script EN LA MISMA terminal.',
  ].join('\n');
}
