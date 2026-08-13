# platform/scripts

## create-owner.mjs

Provisiona un dueno nuevo en el edificio: **auth user -> tenant -> owner + profile**.
El vinculo (tenant + member + profile) es atomico via la funcion `provision_owner`
(migracion 0008). Si ese vinculo falla, el script **borra el auth user** (rollback
del unico paso que vive fuera de la transaccion DB).

Es la unica via de alta: no se crean tenants a mano. Lo reusa el test e2e
(`../tests/isolation_e2e.mjs`) y, en **B6**, se cuelga del boton de autogestion
del cliente (signup self-service) reusando exactamente esta misma funcion
`createOwner(...)`.

### Requisitos

```
npm i @supabase/supabase-js
```

Variables de entorno (la service role NUNCA se commitea ni se pega en chat):

```
SUPABASE_URL=https://wwwzdgprsooyjgkuyoav.supabase.co
SUPABASE_ANON_KEY=sb_publishable_8gMlo42jYdK8epcD-Zr9TQ_eKmY2nW-
SUPABASE_SERVICE_ROLE_KEY=...    # dashboard > Project Settings > API
```

### Uso

```
node platform/scripts/create-owner.mjs \
  --email pepe@mail.com --name "Barberia Pepe" --vertical barber --slug barberia-pepe
```

`--vertical` = gastro | barber | retail. `--password` opcional (si no, se genera
una y se imprime una sola vez). Devuelve `{ userId, tenantId, email, password }`.

### Test de aislamiento e2e

```
node platform/tests/isolation_e2e.mjs
```

Crea 2 duenos via create-owner, loguea como cada uno con JWT real y verifica por
la API que A no ve ni escribe data de B. Limpia los tenants y users de prueba al
final. Debe imprimir 2x PASS.

### Nota

No corri estos scripts en la sesion: crear auth users necesita la SERVICE ROLE,
que no se maneja aca. Corrélos vos con las env seteadas. La parte DB
(`provision_owner`, `profiles`, RLS) ya esta aplicada y probada.
