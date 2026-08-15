-- 0023_schema_snapshot_rpc.sql
-- Transporte para que `npm run schema:sync` pueda regenerar el snapshot de
-- columnas sin depender de que alguien lo copie a mano del dashboard.
--
-- PostgREST no expone information_schema, asi que hace falta una funcion. Es
-- SECURITY DEFINER porque information_schema filtra por los privilegios del
-- que consulta: con el rol del que llama veria un subconjunto y el snapshot
-- saldria incompleto — que es peor que no tenerlo, porque el checker daria
-- errores falsos sobre columnas que si existen.
--
-- Devuelve SOLO nombres de tablas y columnas del schema public. No hay datos
-- ni definiciones sensibles. Aun asi queda revocada para anon y authenticated:
-- el mapa de la base no es algo que un cliente del catalogo tenga que poder
-- pedir. Unico que ejecuta: service_role.

create or replace function public.schema_snapshot()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.table_name, t.cols), '{}'::jsonb)
  from (
    select c.table_name,
           jsonb_agg(c.column_name order by c.ordinal_position) as cols
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema
     and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and tb.table_type = 'BASE TABLE'
    group by c.table_name
  ) t;
$$;

revoke all on function public.schema_snapshot() from public;
revoke all on function public.schema_snapshot() from anon;
revoke all on function public.schema_snapshot() from authenticated;
grant execute on function public.schema_snapshot() to service_role;
