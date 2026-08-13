-- Test de aislamiento entre tenants (regresion). Correr cada vez que se toca RLS.
-- Mejora de proceso: este test se escribio ANTES que las policies (rojo -> verde).
-- Siembra 2 tenants con 2 usuarios, verifica que ninguno vea/escriba data del otro,
-- imprime el resultado y limpia todo. Debe devolver passed=true en las 4 filas.
--
-- Correr: pegar en el SQL editor del proyecto, o via MCP execute_sql.

-- seed
insert into public.tenants(id, slug, name, vertical) values
  ('11111111-1111-1111-1111-111111111111','__test-a','Test A','gastro'),
  ('22222222-2222-2222-2222-222222222222','__test-b','Test B','retail')
on conflict (id) do nothing;
insert into public.tenant_members(tenant_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','owner')
on conflict (tenant_id, user_id) do nothing;
insert into public.products(id, tenant_id, type, name, price) values
  ('a1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','simple','Producto A',100),
  ('b2222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','simple','Producto B',200)
on conflict (id) do nothing;

-- test
drop table if exists public._iso_result;
create table public._iso_result(check_name text, passed boolean, detail text);
do $$
declare a_vis int; a_leak int; b_vis int; b_leak int; anon_vis int; a_insert_blocked boolean := false;
begin
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  select count(*) into a_vis  from public.products;
  select count(*) into a_leak from public.products where tenant_id='22222222-2222-2222-2222-222222222222';
  begin
    insert into public.products(tenant_id, type, name, price)
      values ('22222222-2222-2222-2222-222222222222','simple','intruso',1);
  exception when others then
    a_insert_blocked := true;
  end;

  perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
  select count(*) into b_vis  from public.products;
  select count(*) into b_leak from public.products where tenant_id='11111111-1111-1111-1111-111111111111';

  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims','{}', true);
  select count(*) into anon_vis from public.products;

  perform set_config('role','postgres', true);
  insert into public._iso_result values
    ('A ve 1 propio y 0 de B',         (a_vis=1 and a_leak=0), format('vis=%s leak_B=%s', a_vis, a_leak)),
    ('A NO puede insertar en tenant B',(a_insert_blocked),     format('bloqueado=%s', a_insert_blocked)),
    ('B ve 1 propio y 0 de A',         (b_vis=1 and b_leak=0), format('vis=%s leak_A=%s', b_vis, b_leak)),
    ('anon ve 0',                      (anon_vis=0),           format('vis=%s', anon_vis));
end $$;
select check_name, passed, detail from public._iso_result order by check_name;

-- cleanup
drop table if exists public._iso_result;
delete from public.tenants where id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
