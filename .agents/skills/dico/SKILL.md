---
name: dico
description: Carga el contexto completo de la plataforma Dico (edificio multi-tenant) al empezar un chat nuevo. Usar cuando el usuario escribe /dico, o cuando pide retomar el trabajo de la plataforma, el edificio, los tenants, divianco.app o el signup self-service.
---

# Retomar el trabajo en Dico

Sos el asistente de Ricky en **Dico**, la plataforma multi-tenant de Divianco.
Esta skill te pone al día. **No confíes en lo que dice acá sobre el estado
actual** — los datos concretos se leen de las fuentes vivas, porque cambian.
Lo que sí es estable son las decisiones y el porqué, que están más abajo.

## Protocolo Codex ↔ Claude (obligatorio)

`platform/HANDOFF.md` es el canal común entre agentes. No asumas que el último
trabajo lo hiciste vos ni reconstruyas el estado sólo desde el chat. Al abrir:

- leé primero la sección 0 del HANDOFF y contrastala con Git;
- tratá todo archivo modificado o sin seguimiento como trabajo vivo de otro
  agente hasta entender su propósito;
- no reemplaces, reviertas ni rehagas ese trabajo para avanzar en otra tarea;
- si necesitás tocar un archivo que ya está modificado, preservá los cambios y
  explicá en el próximo HANDOFF cómo se integraron.

Toda sesión que produzca avances debe cerrarse con `/cerrardico`, que actualiza
ese mismo HANDOFF. Así Claude y Codex retoman desde una fuente compartida y no
se pisan aunque el chat anterior ya no exista.

## Paso 1 — Leer el estado real (hacelo SIEMPRE, en paralelo)

1. `platform/HANDOFF.md` — **empezá por la sección 0**, que es la más reciente.
   Es el documento de continuidad entre sesiones.
2. `AGENTS.md` — convenciones del repo y bugs recurrentes con sus workarounds.
3. `git log --oneline -15` y `git status --short` — qué se hizo último y si
   quedó algo sin commitear.
4. **Qué hay deployado**, con el MCP de Vercel (`list_deployments` sobre
   `hermes-platform`): comparás el SHA del último deployment de producción
   contra `HEAD`. **Nunca lo leas del HANDOFF**: esa fila se escribe antes de
   deployar y nadie vuelve a corregirla, así que dice "atrasada" para siempre.
   Ya hizo perder una sesión.

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
- **El pre-commit valida columnas contra DOS snapshots**, uno por base:
  `scripts/supabase-schema.json` (legacy) y `scripts/platform-schema.json`
  (edificio). Cuál se aplica lo decide `PLATFORM_PATHS` en
  `scripts/check-supabase-columns.mjs`: **archivo nuevo que le hable al
  edificio, sumalo ahí** o se valida contra el schema equivocado.
  Los snapshots se regeneran con `npm run schema:sync` (necesita service role
  exportada; sin credenciales saltea sin fallar). Un guard offline en el
  pre-commit avisa si aplicaste una migración y no volviste a mirar el
  snapshot.

### Lo que NO funciona todavía (no lo reportes como roto)
- **El panel del edificio es sólo productos y pedidos.** `PlatformAdmin` cubre
  el mínimo que desbloquea a un tenant nuevo; todo el resto del ERP (recetas,
  stock, compras, gastos, CRM, P&L) sigue siendo exclusivo del legacy. Los dos
  paneles conviven y los decide `business.platform` en la ruta `/admin`: no
  intentes unificarlos, no comparten ni una tabla.
- **Un tenant sin fila en `tenant_members` no tiene panel.** Los 5 tenants
  demo/portados (cochi, mala-miga, la-nona-pato, barberia-demo, tienda-demo)
  se cargaron sin dueño. Ya hay con qué arreglarlo —
  `node platform/scripts/attach-owner.mjs --email x@y.com --slug cochi`,
  necesita la service role exportada— pero mientras no se corra, esos tenants
  siguen sin panel.
- **Nadie llegó nunca al primer valor.** `tenants.first_value_at` (0058) está
  en null para los 7: ningún negocio del edificio cobró una operación. El
  camino alta → catálogo → pedido → cobro **nunca se recorrió entero**.
- **`unit_cost` va en 0**: el edificio no tiene modelo de costos, así que el
  P&L no da.
- **No hay con qué cobrarle al cliente todavía**: hay planes y precios, pero el
  registro de cobros de la consola guarda `paga_hasta` y nada más — ni historia
  de pagos ni MRR — y la suscripción de MercadoPago no está.

Dos cosas que esta lista dio por rotas cuando ya estaban hechas —el formulario
de contraseña nueva y las `og:` por tenant— y costaron una sesión de planificar
al pedo. **Antes de reportar algo de acá como pendiente, comprobalo**: son
todos verificables con un curl, un `ls` o una consulta.

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
