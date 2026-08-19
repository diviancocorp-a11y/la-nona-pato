-- 0047 — Propinas como dominio propio y Dicotip (Etapa 6d, parte 2).
--
-- POR QUE NO ALCANZABA orders.tip_amount
-- Ese campo asume UN solo caso: la propina la cobra el local. En un salon hay
-- tres, y son distintos contable y operativamente:
--
--   employee_direct     va al alias del mozo. NO pasa por la caja del local.
--   employee_pool       entra al local y se reparte por una regla.
--   merchant_collected  la cobra el local (delivery, por ejemplo).
--
-- Si conviven sin distinguirse, el local declara propinas que no recibio o el
-- mozo cobra dos veces.
--
-- MARCO ARGENTINO — A VERIFICAR CON CONTADOR ANTES DE OPERAR
-- Desde 2024 hay regulacion de propina electronica, y la propina no integra la
-- remuneracion (LCT). El modelo lo contempla —recipient, distribution_rule,
-- settlement_status— pero el encuadre concreto es cumplimiento, no
-- arquitectura, y no esta verificado aca.
--
-- NO SE ATA A GASTRONOMIA
-- Un barbero y un vendedor tambien reciben propina. Que rubro la habilita lo
-- decide el registry, no esta tabla.

alter table public.staff
  -- Alias o CVU para la propina directa. Es del trabajador, no del negocio.
  add column if not exists payout_alias text;

create table if not exists public.tips (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id),
  order_id    uuid references public.orders(id) on delete set null,

  kind        text not null check (kind in (
    'employee_direct', 'employee_pool', 'merchant_collected'
  )),
  -- A quien va. Null en pool: se reparte despues por regla.
  recipient_staff_id uuid references public.staff(id) on delete set null,
  amount      numeric(12,2) not null check (amount > 0),

  source      text,                  -- qr (Dicotip), pos, delivery
  payment_method text,
  distribution_rule text,

  -- En que estado esta la plata. `direct` nace 'settled': nunca paso por el
  -- local, no hay nada que liquidar.
  settlement_status text not null default 'pending' check (settlement_status in (
    'pending', 'settled', 'cancelled'
  )),
  settled_at  timestamptz,

  client_request_id uuid,
  created_at  timestamptz not null default now()
);

create index if not exists idx_tips_tenant on public.tips(tenant_id, created_at desc);
create index if not exists idx_tips_staff on public.tips(recipient_staff_id);
create unique index if not exists tips_client_request_uniq
  on public.tips (tenant_id, client_request_id) where client_request_id is not null;

alter table public.tips enable row level security;

drop policy if exists tips_select on public.tips;
create policy tips_select on public.tips
  for select using (tenant_id in (select private.current_user_tenants()));

comment on table public.tips is
  '6d: propinas. employee_direct no pasa por la caja del local (Dicotip).';

-- ─────────────────── La resena que viaja con la propina ────────────────
--
-- El QR del ticket lleva a dos cosas: dejar propina y contar como estuvo. La
-- resena se ata al MOZO y no solo al local: es la mitad que le falta a
-- "rentabilidad por mozo" — quien factura mas no es necesariamente quien
-- atiende mejor.

create table if not exists public.service_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id),
  order_id    uuid references public.orders(id) on delete set null,
  staff_id    uuid references public.staff(id) on delete set null,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  -- Sin datos del cliente a proposito: una resena de servicio no necesita
  -- identificar a quien la deja, y pedirlo baja la cantidad de respuestas.
  created_at  timestamptz not null default now(),
  client_request_id uuid
);

create index if not exists idx_reviews_tenant on public.service_reviews(tenant_id, created_at desc);
create index if not exists idx_reviews_staff on public.service_reviews(staff_id);
create unique index if not exists reviews_client_request_uniq
  on public.service_reviews (tenant_id, client_request_id) where client_request_id is not null;

alter table public.service_reviews enable row level security;

drop policy if exists reviews_select on public.service_reviews;
create policy reviews_select on public.service_reviews
  for select using (tenant_id in (select private.current_user_tenants()));

comment on table public.service_reviews is
  '6d: como estuvo la atencion, atada al mozo. Anonima a proposito.';

-- ──────────────── Lo que el cliente ve al escanear el QR ───────────────
--
-- RPC publica y por SLUG, no por id: el QR del ticket lo escanea alguien SIN
-- sesion, y el slug ya viaja en la URL. Mismo criterio que get_info_page y
-- resolve_qr (handoff del 18/ago): no exponer un endpoint nuevo solo para
-- traducir slug a uuid.
--
-- Devuelve el alias del mozo y NADA mas de el: ni telefono, ni email, ni
-- cuanto factura. El que paga la cuenta no tiene por que ver eso.

create or replace function public.get_tip_target(
  p_tenant_slug text,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t uuid;
  v_o public.orders;
  v_st public.staff;
begin
  select id into v_t from public.tenants where slug = lower(btrim(p_tenant_slug));
  if v_t is null then
    return null;
  end if;

  select * into v_o from public.orders where id = p_order_id and tenant_id = v_t;
  if not found then
    return null;
  end if;

  select * into v_st from public.staff where id = v_o.staff_id and tenant_id = v_t;

  return jsonb_build_object(
    'order_id', v_o.id,
    'total', v_o.total,
    'staff_id', v_st.id,
    'staff_name', v_st.name,
    'payout_alias', v_st.payout_alias,
    'already_tipped', exists (select 1 from public.tips t where t.order_id = v_o.id),
    'already_reviewed', exists (
      select 1 from public.service_reviews r where r.order_id = v_o.id)
  );
end $$;

revoke all on function public.get_tip_target(text, uuid) from public;
grant execute on function public.get_tip_target(text, uuid) to anon, authenticated;

/**
 * Dejar la resena desde el QR. Publica: la escribe alguien sin sesion.
 * Idempotente para que un doble toque no cargue dos resenas del mismo servicio.
 */
create or replace function public.submit_service_review(
  p_tenant_slug text,
  p_order_id uuid,
  p_rating int,
  p_comment text default null,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t uuid;
  v_o public.orders;
  v_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating_invalido';
  end if;

  select id into v_t from public.tenants where slug = lower(btrim(p_tenant_slug));
  if v_t is null then
    raise exception 'local_no_encontrado';
  end if;

  select * into v_o from public.orders where id = p_order_id and tenant_id = v_t;
  if not found then
    raise exception 'pedido_no_encontrado';
  end if;

  if p_client_request_id is not null then
    select id into v_id from public.service_reviews
     where tenant_id = v_t and client_request_id = p_client_request_id;
    if v_id is not null then
      return jsonb_build_object('ok', true, 'id', v_id, 'deduplicated', true);
    end if;
  end if;

  -- Una resena por pedido: el QR esta impreso en el ticket y se puede escanear
  -- muchas veces, incluso por gente distinta de la misma mesa.
  if exists (select 1 from public.service_reviews r where r.order_id = v_o.id) then
    return jsonb_build_object('ok', true, 'deduplicated', true);
  end if;

  insert into public.service_reviews (
    tenant_id, branch_id, order_id, staff_id, rating, comment, client_request_id
  )
  values (
    v_t, v_o.branch_id, v_o.id, v_o.staff_id, p_rating,
    nullif(btrim(coalesce(p_comment, '')), ''), p_client_request_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'deduplicated', false);
end $$;

revoke all on function public.submit_service_review(text, uuid, int, text, uuid) from public;
grant execute on function public.submit_service_review(text, uuid, int, text, uuid) to anon, authenticated;

/**
 * Asentar una propina. La directa (Dicotip) se registra para que el negocio
 * tenga la estadistica, pero nace 'settled': esa plata nunca entro a la caja.
 */
create or replace function public.register_tip(
  p_tenant_id uuid,
  p_order_id uuid,
  p_kind text,
  p_amount numeric,
  p_staff_id uuid default null,
  p_source text default null,
  p_client_request_id uuid default null
)
returns public.tips
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_tip public.tips;
  v_branch uuid;
begin
  if p_tenant_id not in (select private.current_user_tenants()) then
    raise exception 'no_sos_miembro';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'monto_invalido';
  end if;
  if p_kind not in ('employee_direct', 'employee_pool', 'merchant_collected') then
    raise exception 'tipo_invalido';
  end if;

  if p_client_request_id is not null then
    select * into v_tip from public.tips t
     where t.tenant_id = p_tenant_id and t.client_request_id = p_client_request_id;
    if found then
      return v_tip;
    end if;
  end if;

  select o.branch_id into v_branch from public.orders o
   where o.id = p_order_id and o.tenant_id = p_tenant_id;

  insert into public.tips (
    tenant_id, branch_id, order_id, kind, recipient_staff_id, amount, source,
    settlement_status, settled_at, client_request_id
  )
  values (
    p_tenant_id, v_branch, p_order_id, p_kind, p_staff_id, p_amount, p_source,
    case when p_kind = 'employee_direct' then 'settled' else 'pending' end,
    case when p_kind = 'employee_direct' then now() else null end,
    p_client_request_id
  )
  returning * into v_tip;

  return v_tip;
end $$;

revoke all on function public.register_tip(uuid, uuid, text, numeric, uuid, text, uuid) from public, anon;
grant execute on function public.register_tip(uuid, uuid, text, numeric, uuid, text, uuid) to authenticated;
