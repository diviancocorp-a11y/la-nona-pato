-- 0009 products gana campos de catalogo (para portar recipes reales). 9/jul/2026.
alter table public.products
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists image_url text;
