-- 0061 Poder leer que funciones estan REALMENTE desplegadas.
-- NO APLICADA TODAVIA. Va junto con la 0060.
--
-- ══════════════════ EL HUECO QUE TAPA ══════════════════
--
-- El repo tiene una bateria de guards y ninguno mira las funciones:
--
--   check-supabase-columns.mjs   columnas de los .select() vs snapshot
--   check-schema-freshness.mjs   hasta que migracion dice estar al dia
--   check-schema-sync.mjs        Zod vs manifiesto de columnas
--
-- El de frescura compara NUMEROS de migracion, no CONTENIDO. Si alguien aplica
-- algo por MCP y no escribe el archivo, o escribe el archivo distinto de lo que
-- aplico, los tres pasan en verde.
--
-- Eso ya paso: la `signup_tenant()` desplegada era mas nueva que cualquier
-- archivo del repo y leia `business_name`, un campo que no escribe nadie. El
-- bug no fallaba: el alta funcionaba y guardaba el nombre equivocado.
--
-- Es el mismo antidoto que 0023 (`schema_snapshot`) para las columnas, ahora
-- para funciones.
--
-- ══════════════════ POR QUE SOLO EL CUERPO ══════════════════
--
-- Postgres canonicaliza el ENCABEZADO de la funcion (mayusculas, delimitadores)
-- pero guarda el CUERPO tal cual se escribio. Por eso comparar el cuerpo contra
-- el del archivo es fiable, y comparar `pg_get_functiondef` entero no lo es:
-- daria falsos positivos en cada migracion.

-- ══════════════════ POR QUE LA CLAVE LLEVA LOS ARGUMENTOS ══════════════════
--
-- Primera version de esta migracion agregaba por `proname` a secas. Al probarla
-- contra produccion aparecio que `sumar_staff` tiene DOS overloads vivos:
--
--   sumar_staff(p_email text)              <- 0052/0053, quedo dando vueltas
--   sumar_staff(p_email text, p_puesto text default 'soporte')  <- 0054/0057
--
-- La 0054 creo la de dos argumentos y nadie dropeo la de uno: `create or
-- replace` no reemplaza una firma distinta, crea una funcion nueva.
--
-- Con la clave sin argumentos, `jsonb_object_agg` se queda con UNA de las dos
-- y descarta la otra SIN ERROR. O sea que el guard que vino a detectar drift
-- silencioso habria tenido, el mismo, un agujero silencioso.
--
-- Con `nombre(args)` como clave las dos aparecen, y el script puede ademas
-- avisar cuando una funcion critica tiene mas de una firma — que es un
-- problema por si mismo: PostgREST resuelve overloads por los argumentos que
-- le manden, asi que cual corre depende del caller.

create or replace function public.function_snapshot()
returns jsonb
language sql
stable
set search_path = public, pg_catalog, pg_temp
as $$
  select coalesce(
    jsonb_object_agg(
      -- Clave: `nombre(args)`. Unica aun con overloads.
      p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      jsonb_build_object(
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        -- prosrc es el cuerpo literal, sin el encabezado que Postgres reescribe.
        'body', p.prosrc,
        'secdef', p.prosecdef
      )
    ),
    '{}'::jsonb)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    -- Las de trigger no se comparan: no las llama el front y su cuerpo cambia
    -- por razones que no son drift de contrato.
    and p.prorettype <> 'trigger'::regtype;
$$;

-- El cuerpo de una funcion puede tener nombres de tablas y logica de negocio.
-- No es un secreto, pero tampoco algo que tenga que poder leer el catalogo
-- publico: esto lo consume un script de CI con service role.
revoke all on function public.function_snapshot() from public, anon, authenticated;

comment on function public.function_snapshot is
  'Cuerpo de las funciones de public, para que scripts/check-functions-drift.mjs '
  'compare lo DESPLEGADO contra lo que dicen las migraciones del repo. Solo '
  'service role. Hermana de schema_snapshot() (0023), que hace lo mismo con '
  'las columnas.';

-- ══════════════════ COMO APLICARLA ══════════════════
--
-- Es de solo lectura y no toca datos ni schema: revertir es
-- `drop function public.function_snapshot()`.
--
--   1. Aplicar por MCP sobre `wwwzdgprsooyjgkuyoav`, junto con la 0060.
--   2. Con PLATFORM_SUPABASE_SERVICE_ROLE_KEY exportada:
--        node scripts/check-functions-drift.mjs
--      Sin credenciales o sin este RPC, el script SALTEA sin fallar (mismo
--      criterio que schema:sync).
--   3. Subir `_migrations_through` a "0061" en scripts/platform-schema.json.
