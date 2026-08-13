-- 0010 products.requires_age_gate (para el +18 de mala-miga). 9/jul/2026.
alter table public.products add column if not exists requires_age_gate boolean not null default false;
