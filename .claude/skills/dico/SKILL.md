---
name: dico
description: Carga el contexto completo de la plataforma Dico (edificio multi-tenant) al empezar un chat nuevo. Usar cuando el usuario escribe /dico, o cuando pide retomar el trabajo de la plataforma, el edificio, los tenants, divianco.app o el signup self-service.
---

# Retomar el trabajo en Dico

Sos el asistente de Ricky en **Dico**, la plataforma multi-tenant de Divianco.
Esta skill te pone al día. **No confíes en lo que dice acá sobre el estado
actual** — los datos concretos se leen de las fuentes vivas, porque cambian.
Lo que sí es estable son las decisiones y el porqué, que están más abajo.

## Paso 1 — Leer el estado real (hacelo SIEMPRE, en paralelo)

1. `platform/HANDOFF.md` — **empezá por la sección 0**, que es la más reciente.
   Es el documento de continuidad entre sesiones.
2. `CLAUDE.md` — convenciones del repo y bugs recurrentes con sus workarounds.
3. `git log --oneline -15` y `git status --short` — qué se hizo último y si
   quedó algo sin commitear.

Después, según lo que vayas a tocar:
- Migraciones aplicadas: `ls platform/migrations/`
- Estado de la base: MCP de Supabase, proyecto **`wwwzdgprsooyjgkuyoav`**
  (`hermes-platform`). Es free tier y **se auto-pausa por inactividad**: si
  `get_project` dice `INACTIVE`, hay que `restore_project` y esperar minutos.

## Paso 2 — Decirle a Ricky dónde está parado

Resumile en pocas líneas: última tarea cerrada, qué quedó pendiente y si hay
algo sin commitear. No le recites la arquitectura: ya la conoce.

---

## Lo que no se deduce leyendo código

### Qué es esto
Pivot de un SaaS gastronómico single-tenant a **plataforma multi-rubro**
(gastro / barbería / retail) sobre UNA base con RLS por `tenant_id`.

- **Divianco** = la empresa. **Dico** = el producto. No son intercambiables:
  en textos legales y copyright va Divianco; en marketing y producto, Dico.
- Dominio: **`divianco.app`** + wildcard `*.divianco.app`. Cada tenant vive en
  `<slug>.divianco.app`. `dico.app` está tomado por un tercero.

### Las decisiones grandes y por qué
- **Un solo proyecto Vercel para todos los tenants**, con el tenant resuelto
  en RUNTIME por hostname. Un proyecto por cliente hacía imposible el alta
  self-service: cada registro habría necesitado carpeta + proyecto + envs +
  deploy manual.
- **Orden de trabajo**: checkout → runtime + wildcard + signup → *recién
  después* ERP y migración de los 3 tenants legacy. Migrar los legacy es
  reconstruir el ERP entero (recetas, stock, compras, gastos, CRM): meses. Un
  cliente nuevo arranca vacío y no necesita nada de eso, así que el signup
  puede salir mucho antes.
- **Slugs con vencimiento**: un tenant que a los 45 días no cargó ni un
  producto pasa a `dormant` y su slug se libera. Ataca la ocupación del
  namespace (el daño caro) sin poner fricción en el alta. Corre solo con
  pg_cron, 4am UTC.
- **`catalog_theme`** está ACOTADO a 3 (ambar/noche/carbon) y **`logo_color`**
  es hex LIBRE. No son lo mismo y no se pisan.

### Infraestructura
| Qué | Dónde |
|---|---|
| Base del edificio | Supabase `wwwzdgprsooyjgkuyoav` |
| Front | Vercel `hermes-platform` (nombre viejo, no renombrar) |
| Correo | Resend, dominio `send.divianco.app`, SMTP en Supabase Auth |
| DNS | Cloudflare, zona `divianco.app` |
| Legacy dormidos | 3 proyectos Supabase + 3 Vercel, sin migrar |

Los nombres `hermes-*` de la infraestructura **se dejan como están**:
renombrarlos rompe deploys a cambio de nada, no los ve ningún cliente.

### Trampas que ya nos costaron tiempo
- **Deploy a producción va por CLI**, no por git:
  `npx vercel --prod --scope diviancocorp-a11ys-projects --yes`.
  El trabajo vive en la rama `platform/runtime-tenant`; `main` es el legacy y
  pushear ahí redeploya los 3 tenants viejos.
- **`NODE_ENV=production` global en la máquina de Ricky** se come las
  devDependencies. Prefijar todo con `NODE_ENV=` vacío:
  `NODE_ENV= CLIENT=hermes-cochi npm run build` y `NODE_ENV=test npx vitest run`.
- **Cloudflare no proxea wildcards en plan free**: el registro `A *` tiene que
  quedar en DNS only (nube gris) o los subdominios de tenants dejan de
  resolver.
- **Los slugs reservados viven en 2 lugares** (`src/lib/tenantHost.js` y la
  función SQL `is_reserved_slug`). Hay un test que los compara parseando la
  migración; si agregás uno, tocá los dos y actualizá a qué migración apunta
  `src/test/reservedSlugsSync.test.js`.
- **`check-file-integrity.mjs` da falsos positivos de "JSX en .js"** con SVG
  en strings. Ya se arregló el caso de las URLs (`//` de protocolo), pero los
  literales de regex con `<` siguen disparándolo: escribí `/[<]/g`, no `/</g`.
- **El pre-commit valida columnas contra `scripts/supabase-schema.json`**, que
  describe el schema LEGACY. Si consultás una tabla del edificio con columnas
  que el legacy no tiene, falla. Suele convenir rediseñar la consulta antes
  que tocar el snapshot.

### Lo que NO funciona todavía (no lo reportes como roto)
- **El panel del admin no está conectado al edificio**: un tenant nuevo se
  registra y no tiene dónde cargar productos. Es el próximo bloque grande.
- **No hay module registry por rubro**: una barbería ve "Recetas" y el filtro
  "Vegetariano". La UI sigue siendo la gastronómica.
- **Las `og:` tags son las del build** para todos los tenants: compartir por
  WhatsApp muestra la marca equivocada. Necesita render en el edge.
- **`unit_cost` va en 0**: el edificio no tiene modelo de costos, así que el
  P&L no da.
- Falta el formulario para fijar la contraseña nueva tras el reset.

## Cómo trabajar acá
- Español argentino. Comentarios de código **sin tildes** (encoding).
- Tono breve y directo. Más honestidad, menos condescendencia.
- Ofrecer siempre una mejora al proceso, no sólo resolver la tarea.
- **Nunca pedir ni aceptar credenciales** (API keys, service role, contraseñas).
  Ricky las carga él en el panel que corresponda.
- Toda tabla nueva: `tenant_id` + RLS con el patrón
  `tenant_id in (select private.current_user_tenants())`.
- Toda edge function pública: `verify_jwt=false` (las keys `sb_publishable_`
  no son JWT y el gateway las rechaza).
