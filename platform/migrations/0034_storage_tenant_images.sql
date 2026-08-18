-- 0034_storage_tenant_images.sql — Imagenes propias (Etapa 6)
--
-- POR QUE: hasta hoy el alta de producto pedia "Imagen (URL)" con
-- placeholder "https://...". El dueno de una panaderia no tiene una URL:
-- tiene una foto en el telefono. Para poner una imagen habia que subirla
-- antes a algun servicio ajeno y pegar el link — la peor friccion del
-- onboarding, justo en el paso que hace que el catalogo se vea vivo.
-- De paso destraba la foto del ticket en Compras (permiteComprobante).
--
-- ── Un bucket para todos, separado por CARPETA ──
-- La alternativa era un bucket por tenant, y no: crear un bucket es una
-- operacion de administracion (necesita service role), asi que el alta
-- self-service tendria que provisionar infraestructura en cada registro.
-- Con un bucket unico, subir una imagen es una escritura normal del cliente
-- y el aislamiento lo hace la RLS sobre storage.objects, igual que en toda
-- otra tabla del edificio.
--
-- La convencion de path es <tenant_id>/<archivo>, y esa primera carpeta NO
-- es decorativa: es lo que leen las policies. Si algun dia se sube algo
-- fuera de esa forma, la policy lo rechaza (foldername de un path sin
-- carpeta no matchea ningun tenant).
--
-- ── Lectura publica, escritura de los miembros ──
-- El catalogo lo mira gente sin sesion: si las imagenes no fueran publicas,
-- el comprador veria placeholders rotos. Lo publico es la LECTURA; subir,
-- pisar y borrar sigue exigiendo ser miembro del tenant de esa carpeta.

/* ═══════════════════════════ BUCKET ═══════════════════════════ */

-- Los limites viven en el bucket y no solo en el JavaScript de la pantalla:
-- la validacion del cliente es comodidad, no seguridad — un request armado
-- a mano la saltea entera. Con esto, el server rechaza igual.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-images',
  'tenant-images',
  true,
  5242880,  -- 5 MB, el mismo tope que ya validaba services/storage.js
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/* ═══════════════════════════ POLICIES ═════════════════════════ */

-- Lectura: cualquiera. Son fotos de catalogo publicadas a proposito.
drop policy if exists tenant_images_public_read on storage.objects;
create policy tenant_images_public_read on storage.objects
  for select
  using (bucket_id = 'tenant-images');

-- Escritura: solo miembros del tenant cuya carpeta es la primera del path.
drop policy if exists tenant_images_insert on storage.objects;
create policy tenant_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenant-images'
    and (storage.foldername(name))[1] in (
      select t::text from private.current_user_tenants() as t
    )
  );

drop policy if exists tenant_images_update on storage.objects;
create policy tenant_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-images'
    and (storage.foldername(name))[1] in (
      select t::text from private.current_user_tenants() as t
    )
  );

drop policy if exists tenant_images_delete on storage.objects;
create policy tenant_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-images'
    and (storage.foldername(name))[1] in (
      select t::text from private.current_user_tenants() as t
    )
  );
