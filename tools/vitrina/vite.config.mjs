// Config de la vitrina. Aparte del de la app a proposito: la app arranca en
// `index.html` de la raiz y tiene su propio juego de env vars.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aca = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(aca, '..', '..');

export default defineConfig({
  root: aca,
  plugins: [
    react(),
    {
      // `src/lib/supabase.js` TIRA si faltan las env vars, y ademas abriria
      // conexiones reales. La vitrina lo cambia por el fake antes de que se
      // cargue: por eso `enforce: 'pre'` y no un alias comun, que no alcanza
      // para los imports relativos de adentro de src/.
      name: 'vitrina-fake-supabase',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        // El propio fake no se intercepta a si mismo.
        if (importer && importer.includes('fake-supabase')) return null;
        // Se compara la ruta RESUELTA y no el texto del import: los archivos
        // que viven en `src/lib/` lo importan como './supabase', que no se
        // parece en nada a 'lib/supabase' y se colaba sin interceptar. El
        // sintoma era el modulo real tirando "faltan variables de entorno".
        const r = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!r) return null;
        const normal = r.id.replace(/\\/g, '/');
        return /\/src\/lib\/supabase\.js$/.test(normal)
          ? path.join(aca, 'fake-supabase.js')
          : null;
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^app\//, replacement: `${repo.replace(/\\/g, '/')}/src/` },
      // Los services del edificio bifurcan por `business.platform`, asi que sin
      // este alias no cargan. Apunta al cliente del edificio: la vitrina
      // muestra pantallas del edificio, no del legacy.
      { find: /^@business$/, replacement: path.join(repo, 'clients', 'hermes-cochi', 'business.js') },
      { find: /^@hermes\/core$/, replacement: path.join(repo, 'src') },
    ],
  },
  define: {
    // `__CLIENT__` es global inyectado en build: sin esto, cualquier pantalla
    // que lo toque explota en la vitrina.
    __CLIENT__: JSON.stringify('vitrina'),
  },
  server: { port: 5199, fs: { allow: [repo] } },
});
