# Plan: traer el ERP viejo al edificio

> Estado al 15/ago/2026. El edificio tiene catálogo, checkout, alta
> self-service y un panel de dos pantallas. Todo el resto del ERP vive en el
> sistema viejo, contra una base por negocio.

---

## La idea que hace esto posible

El panel viejo ya está partido en tres capas:

```
pantalla React  →  service (src/services/*.js)  →  tabla
```

Las pantallas **no le hablan a la base**: le hablan a un service. Y los
cálculos pesados (`useFinancials`) son funciones puras sobre arrays, sin
Supabase adentro.

Eso cambia el tamaño del trabajo. No hay que reescribir el ERP: hay que
**mover las tablas conservando los nombres de columna, reescribir la capa de
services para que filtre por tenant, y reusar las pantallas casi tal cual.**

De las tres capas, se rehace una.

**Regla de oro de cada etapa:** si una pantalla necesita cambios de fondo para
funcionar contra el edificio, es señal de que la tabla se portó con un shape
distinto. Corregir la tabla, no la pantalla.

---

## Lo que NO entra en este plan

- **La data transaccional de los 3 negocios viejos.** Este plan trae la
  *funcionalidad*, no los pedidos históricos de La Nona Pato. Migrar la data
  es un proyecto aparte y se decide después, con el ERP ya andando.
- **Facturación AFIP.** Sigue detrás del feature flag `E_INVOICE`. Certificados,
  homologación y responsabilidad legal no son un ítem de checklist.

---

## Etapa 0 — Settings por tenant

**Es la que bloquea a todas las demás, y hay que decidirla antes de empezar.**

El legacy tiene una tabla `settings` de 47 columnas, con una fila por negocio.
El edificio tiene `tenants.settings`, un jsonb hoy casi vacío. Prácticamente
toda pantalla del ERP lee de ahí: horarios, costos fijos, targets, medios de
pago, zona de delivery.

Las dos salidas son legítimas y hay que elegir una:

| | jsonb en `tenants.settings` | tabla `settings` con `tenant_id` |
|---|---|---|
| Migrar columna nueva | no requiere migración | ALTER TABLE |
| Validación | sólo en Zod | la DB también |
| Pre-commit actual | no lo cubre | `check-schema-sync` ya lo cubre |
| Reuso de `Settings.jsx` | hay que adaptar cada `set(...)` | casi directo |

**Recomendación: tabla.** El bug recurrente de este repo (#54, #56, #96 — campo
que se agrega a la UI, no al Zod, y se descarta en silencio) tiene su red de
contención construida alrededor de una tabla con columnas. Con jsonb esa red
no aplica y el bug vuelve.

**Entregable:** migración `settings` con `tenant_id` + RLS, service
`platformSettings.js`, y `Settings.jsx` apuntado al edificio.

---

## Etapa 1 — Stock

La más chica y la más autocontenida: no depende de ninguna otra.

| | |
|---|---|
| Tablas | `ingredients` (+ `tenant_id`) |
| Service | `inventory.js` → versión tenant-scoped |
| Pantalla | `Stock.jsx` — se reusa |
| Registry | `stock.implementado = true` |

`adjust_stock` ya existe en el legacy con guard `is_admin()`; en el edificio el
equivalente es la policy por `tenant_id`.

**Por qué primero:** entrega valor solo (saber qué falta comprar sirve sin
recetas ni P&L) y es el mejor banco de pruebas del método "portar tabla,
reusar pantalla" con algo chico.

---

## Etapa 2 — Recetas y costos reales

La que apaga el `unit_cost = 0` que hoy rompe cualquier número.

| | |
|---|---|
| Tablas | `product_ingredients` (el `recipe_ingredients` del legacy) |
| Ojo | en el edificio la receta **ya es** `products` con `type='composite'` — no se crea una tabla `recipes` nueva |
| Service | `recipes.js` → costeo sobre `products` |
| Pantalla | `Recipes.jsx` |

Los combos (`combo_items`) entran acá o se posponen: son recursivos y agregan
la mitad de la complejidad de la etapa.

**Desbloquea:** costo por plato, margen por producto, y que `order_items.unit_cost`
deje de ser 0.

---

## Etapa 3 — Compras, gastos y proveedores

| | |
|---|---|
| Tablas | `expenses`, `suppliers`, `purchases` (+ `tenant_id`) |
| Services | `finance.js`, `suppliers.js` |
| Pantallas | `Finance.jsx` (Expenses + Purchase), `Suppliers.jsx` |

Depende de la 1: una compra ingresa mercadería y toca stock.

---

## Etapa 4 — Ventas y P&L

| | |
|---|---|
| Tablas | `sales` (+ `tenant_id`) |
| Cálculo | **`useFinancials` se reusa sin tocar** — es cálculo puro sobre arrays |
| Pantallas | `SalesView`, `MonthSummary`, los KPIs de `Home.jsx` |

Depende de la 2 y la 3: sin costos reales ni gastos, el P&L da cualquier cosa.
Es exactamente el error que ya se arregló una vez en el legacy (doble conteo de
merma y gastos proyectados, 12/jun) — conviene no repetirlo portando a medias.

---

## Etapa 5 — Clientes

| | |
|---|---|
| Tablas | `profiles` (ya existe), `addresses`, `favorites` |
| Service | `crm.js` |
| Pantalla | `CRM.jsx` |

En el legacy `customers` y `profiles` ya se habían unificado; el edificio nace
con esa decisión tomada, así que esta etapa es más corta de lo que parece.

---

## Etapa 6 — Periferia

Cada uno es independiente y chico. Se hacen cuando se piden:

merma (`waste_log`) · QRs dinámicos · push · páginas de info · usuarios y roles
(`tenant_members` ya existe, falta la UI) · menu engineering · analytics

---

## Orden y por qué

```
0 settings ──┬── 1 stock ──── 3 compras ──┐
             │                            ├── 4 ventas y P&L
             └── 2 recetas ───────────────┘

5 clientes  ·  6 periferia   (independientes, en cualquier momento)
```

La 0 primero porque la necesitan todas. Después 1 y 2 se pueden hacer en
paralelo. La 4 va última de la cadena porque es la que más se nota cuando los
números están mal.

---

## Cómo se hace cada etapa (el molde)

1. **Migración**: tabla con `tenant_id not null` + RLS con el patrón
   `tenant_id in (select private.current_user_tenants())`.
2. **Snapshot**: `npm run schema:sync` o subir `_migrations_through`.
3. **Service nuevo** en `src/services/platform*.js`, con el `tenantId`
   **obligatorio** en toda lectura. RLS decide qué podés ver; el filtro decide
   qué estás mirando. Los dos hacen falta — es el bug que ya nos pasó.
4. **Sumar el archivo a `PLATFORM_PATHS`** en `scripts/check-supabase-columns.mjs`,
   o el pre-commit lo valida contra el schema equivocado.
5. **Pantalla**: reusar el componente del legacy, cambiándole el import del
   service. Si hay que tocarle la lógica, revisar el punto 1.
6. **Registry**: `implementado: true` y agregarlo a los rubros que corresponda.
   Una barbería no necesita Recetas.
7. **Test de aislamiento**: que la consulta salga con el filtro puesto.

---

## Riesgos conocidos

- **El shape de `orders`.** El legacy tiene 42 columnas; el edificio, 25. Al
  portar pantallas que leen pedidos, faltan campos. Decidir caso por caso si
  la columna se agrega o la pantalla la deja de mostrar.
- **Rubro ≠ gastro.** Recetas, stock de ingredientes y merma son gastronómicos.
  El registry ya permite no mostrárselos a una barbería; conviene declararlo al
  portar cada módulo y no después.
- **Alcance.** Cada etapa parece chica y arrastra la siguiente. La disciplina es
  entregar la etapa completa y usable antes de abrir la próxima.
