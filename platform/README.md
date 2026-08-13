# platform/ — el edificio multi-tenant (Hermes)

El "edificio unico" del plan (ver `../PLAN-MULTI-RUBRO.md`). Base compartida
multi-tenant con RLS donde viven TODOS los rubros (gastro / barberia / ropa).
Los gastro dormidos (LNP/MM/Cochi) se recrean aca como tenants.

## Proyecto Supabase

- **Nombre:** hermes-platform
- **Ref:** `wwwzdgprsooyjgkuyoav`
- **Region:** sa-east-1 (Sao Paulo)
- **URL:** https://wwwzdgprsooyjgkuyoav.supabase.co

Las keys NO se commitean (repo publico). En el `.env` del front del edificio:

```
VITE_SUPABASE_URL=https://wwwzdgprsooyjgkuyoav.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key sb_publishable_... del dashboard>
```

El **service role** solo del dashboard, nunca en el repo ni en el chat.

> Carryover del bug #6 de CLAUDE.md: las keys `sb_publishable_...` NO son JWT.
> Toda edge function publica del edificio debe ir con **verify_jwt=false**
> (la proteccion real es rate-limit + validacion interna).

## Modelo

- `tenants` (slug, name, vertical, plan, settings) — un row por comercio.
- `tenant_members` (tenant_id, user_id, role owner|staff) — quien entra a que tenant.
- `private.current_user_tenants()` — helper SECURITY DEFINER (fuera de la API) que
  devuelve los tenants del usuario logueado. Es el corazon de todas las policies.
- `products` — tabla-patron. `type`: composite (gastro/BOM), simple (retail),
  variant_parent (ropa), service (barberia). Todo lo vendible de cualquier rubro
  cuelga de aca; el resto de las tablas de negocio copian este patron (tenant_id + RLS).

## Regla de oro (RLS)

Toda tabla de negocio nueva: `tenant_id uuid not null references tenants(id)` +
`enable row level security` + policies `using/with check (tenant_id in (select
private.current_user_tenants()))`. Sin excepcion.

## Test de aislamiento

`tests/tenant_isolation.sql` — correr cada vez que se toca RLS. Debe dar
`passed=true` en las 4 filas (A ve solo lo suyo, A no puede insertar en B,
B ve solo lo suyo, anon ve 0). Se escribio ANTES que las policies (rojo -> verde).

## Estado (9/jul/2026)

- [x] Proyecto creado (sa-east-1)
- [x] 0001 fundacion multi-tenant + RLS
- [x] 0002 helper a esquema privado (linter de seguridad limpio)
- [x] Test de aislamiento en verde (4/4)
- [x] 0003 core Pedidos (orders + order_items) con RLS; aislamiento verificado
- [x] Tenants recreados: 3 gastro (LNP, Cochi, Mala Miga) + barberia-demo + tienda-demo, con 1 producto demo c/u
- [x] 0004 POS/Caja/Pagos (payment_methods + cash_sessions + payments) con RLS; aislamiento verificado; medios por defecto sembrados (Efectivo/Tarjeta/MercadoPago x tenant)
- [x] 0005 Pack barberia: staff + appointments con exclusion constraint anti-solape (mismo barbero no se superpone; adyacentes permitidos). Verificado: bloquea solapado, permite pegado, aisla por tenant. 2 barberos + 2 turnos demo en barberia-demo
- [x] 0006 btree_gist movida a schema extensions (linter limpio)
- [x] 0007 Pack ropa: product_variants (talle/color/sku/barcode/stock) + store_credits (nota de credito) + product_returns. Verificado: barcode unico blindado, aislado. tienda-demo con 3 variantes (S/M/L)
- [x] 0008 Auth DB: profiles + provision_owner (tenant+owner+profile atomico). scripts/create-owner.mjs (con rollback del user) + tests/isolation_e2e.mjs (RLS real via API). PENDIENTE: correr los scripts con la service role (no se corren aca)
- [x] 0009 products gana category/description/image_url + 0010 requires_age_gate (+18 mala-miga)
- [x] Catalogo gastro real PORTADO (los 3): cochi 10 (4 cat), mala-miga 11 (5 cat, 2 con +18), la-nona-pato 43 (10 cat). Total 64 products type=composite. Proyectos viejos vueltos a pausar; solo hermes-platform queda activo.
  - NOTA: cochi y mala-miga con descripcion+imagen; LNP solo name/price/category (desc+img se pueden backfillear despues). Las imagenes apuntan al storage de los proyectos viejos: copiar buckets al edificio es paso aparte (los links viven mientras esos proyectos existan).
- [ ] attach_owner(user, slug): linkear duenos a los tenants gastro ya existentes (create-owner crea tenant nuevo; los 3 gastro ya existen)
- [x] 0011 get_catalog(slug): endpoint publico de catalogo por tenant (shape de catalog-pro). 2 warnings de advisor INTENCIONALES (endpoint publico anon).
- [~] Front reusado: build "platform" nuevo. `.env.hermes-cochi` + `clients/hermes-cochi/business.js` (platform:true, slug:cochi) apuntan al edificio. `src/services/catalog.js` bifurca: si business.platform -> RPC get_catalog; si no, camino viejo intacto. Sintaxis verificada. FALTA: correr `CLIENT=hermes-cochi npm run dev` y ver el catalogo real + login.
- [ ] Admin: attach_owner + apuntar Orders/Stock/Finance al edificio
- [ ] Module registry + nav por vertical (front-end)
- [ ] B6: signup self-service que cuelga del boton -> reusa createOwner()

## Correr el front sobre el edificio (cochi)

```
npm install --include=dev        # NODE_ENV=production global se come las devDeps (bug #5 CLAUDE.md)
set CLIENT=hermes-cochi&& npm run dev     # Windows
# CLIENT=hermes-cochi npm run dev         # mac/linux
```

Deberia abrir el catalogo con los 10 productos REALES de cochi (Arroz Chino,
Shawarmas...) leidos del edificio via get_catalog. El login del admin (/admin)
usa el mismo AuthContext -> Supabase Auth del edificio (crear owner con
create-owner primero, o attach_owner para el tenant cochi que ya existe).

## Nota: reactivar proyectos viejos para portar (free tier = 2 activos)

Hoy activos: cochi + hermes-platform. Para leer LNP y mala-miga hay que liberar
slot. Reversible, sin perdida de data. Camino: pausar cochi -> restaurar
mala-miga -> leer -> pausar -> restaurar la-nona-pato -> leer -> portar -> dejar
los 3 gastro viejos pausados (solo hermes-platform activo).
