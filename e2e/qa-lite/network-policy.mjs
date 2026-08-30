import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const FONT_FILES = Object.freeze({
  'dm-sans-400-normal.woff2': 'dm-sans/files/dm-sans-latin-ext-400-normal.woff2',
  'dm-sans-500-normal.woff2': 'dm-sans/files/dm-sans-latin-ext-500-normal.woff2',
  'dm-sans-600-normal.woff2': 'dm-sans/files/dm-sans-latin-ext-600-normal.woff2',
  'dm-sans-700-normal.woff2': 'dm-sans/files/dm-sans-latin-ext-700-normal.woff2',
  'dm-serif-display-400-normal.woff2': 'dm-serif-display/files/dm-serif-display-latin-ext-400-normal.woff2',
  'instrument-serif-400-normal.woff2': 'instrument-serif/files/instrument-serif-latin-ext-400-normal.woff2',
  'instrument-serif-400-italic.woff2': 'instrument-serif/files/instrument-serif-latin-ext-400-italic.woff2',
  'inter-400-normal.woff2': 'inter/files/inter-latin-ext-400-normal.woff2',
  'inter-500-normal.woff2': 'inter/files/inter-latin-ext-500-normal.woff2',
  'inter-600-normal.woff2': 'inter/files/inter-latin-ext-600-normal.woff2',
  'inter-700-normal.woff2': 'inter/files/inter-latin-ext-700-normal.woff2',
  'source-serif-4-400-normal.woff2': 'source-serif-4/files/source-serif-4-latin-ext-400-normal.woff2',
  'source-serif-4-400-italic.woff2': 'source-serif-4/files/source-serif-4-latin-ext-400-italic.woff2',
  'source-serif-4-600-normal.woff2': 'source-serif-4/files/source-serif-4-latin-ext-600-normal.woff2',
  'jetbrains-mono-400-normal.woff2': 'jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff2',
  'jetbrains-mono-500-normal.woff2': 'jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2',
});

export function classifyRequest(rawUrl) {
  const url = new URL(rawUrl);
  if (['data:', 'blob:'].includes(url.protocol)) return { action: 'continue' };
  if (url.hostname === 'fonts.googleapis.com') return { action: 'font-css' };
  if (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/qa-lite/')) {
    const name = url.pathname.split('/').pop() || '';
    return FONT_FILES[name] ? { action: 'font-binary', name } : { action: 'block' };
  }
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return { action: 'continue' };
  return { action: 'block' };
}

export function fontFixturePath(repoRoot, name) {
  const relative = FONT_FILES[name];
  if (!relative) throw new Error(`Fixture de fuente desconocido: ${name}`);
  const root = resolve(repoRoot, 'node_modules', '@fontsource');
  const path = resolve(root, relative);
  if (!path.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
    throw new Error('Fixture de fuente fuera de @fontsource');
  }
  if (!existsSync(path)) throw new Error(`No existe el fixture de fuente local: ${name}`);
  return path;
}
