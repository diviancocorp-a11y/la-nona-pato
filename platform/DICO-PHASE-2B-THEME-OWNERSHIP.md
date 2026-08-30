# DICO Phase 2B — propiedad de tema

Fecha: 30/ago/2026
Base: `066d82027cea4beb124ac634912a460e16f84011`

## Decisión

El documento tiene una autoridad visual explícita mediante
`body[data-ui-owner]`:

| Owner | Superficie | Autoridad |
| --- | --- | --- |
| `platform` | landing, registro, acceso y consola | tokens DICO `--ds-*` |
| `admin` | Admin y POS | límite `.ag-root`; light/dark son clases locales |
| `catalog` | catálogo y páginas del tenant | límite `.cp-root` + `data-cp-theme` |

`resolveThemeOwner()` resuelve la autoridad por ruta y host. El mismo estado
mínimo se escribe antes del primer paint en `index.html` para evitar que un
tema tenant almacenado contamine `/registro` o `/admin`.

## Garantías

1. `main.jsx` ya no carga `theme_config` globalmente.
2. El runtime legacy de `services/theme.js` sólo se ejecuta bajo owner
   `catalog` y sus variables se limpian al abandonar esa superficie.
3. `useTheme.js` no fuerza `data-theme=light` ni un fondo terracota global.
4. Los tokens `--ag-*` nacen en el owner `admin` y en `.ag-root`, nunca en
   `:root`; esto cubre login, loaders, callbacks y diálogos además del shell.
5. Los selectores de tema del catálogo exigen simultáneamente
   `data-ui-owner="catalog"` y `data-cp-theme`.
6. Un intento de `applyCatalogTheme()` dentro de Admin no escribe en el DOM.
7. No cambia `theme_config`, DB, RLS, auth, seeds ni comportamiento comercial.

## Tipografía aprobada en paralelo

- UI DICO: Overused Grotesk variable 300–900, SIL OFL 1.1.
- Soul/editorial: Butler Free Roman y Medium, EULA v2.00 (19/feb/2026).
- Los tres WOFF2 están autoalojados, sin transformaciones, con hashes y
  licencias en `public/fonts/dico`.
- `/registro` adopta la dupla nueva. Admin y catálogo conservan por ahora sus
  adaptadores tipográficos para que Phase 2B sea neutral fuera del canary.

## Gate de salida

- Pruebas unitarias de resolución y aislamiento de owners.
- Tests completos, TypeScript y build.
- Verificación en navegador de `/registro`, Admin y catálogo.
- Confirmar que cambiar Admin light/dark no modifica `data-cp-theme`.
- Confirmar que Overused Grotesk y Butler cargan desde el mismo origen y no
  generan requests externas.
