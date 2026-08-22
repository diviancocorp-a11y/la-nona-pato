-- 0055 El legajo depende del pais, del documento y de la modalidad.
-- Aplicada via MCP el 21/ago/2026.
--
-- ── POR QUE LA 0054 NO ALCANZABA ──
-- Salio pensada para un solo caso: un empleado argentino en relacion de
-- dependencia. Tres supuestos, y los tres se rompen apenas se contrata a otra
-- persona:
--
--   1. "el documento tiene dorso" — un pasaporte no. Exigirlo deja a alguien
--      trabado sin manera de destrabarse: no hay foto que sacar.
--   2. "la identificacion fiscal se llama CUIL" — en Chile y Uruguay es RUT, y
--      en el resto del mundo se llama de veinte formas. Pedir CUIL a alguien de
--      Colombia es pedirle un dato que no existe.
--   3. "hace falta domicilio y telefono" — de quien FACTURA su servicio, no.
--      De esa persona hace falta con que facturarle y a donde pagarle. Pedirle
--      el domicilio es pedir datos personales que la empresa no necesita, y
--      frenar un alta que deberia tomar dos minutos.
--
-- ── DONDE VIVE CADA COSA ──
-- Que pide cada pais esta en `src/modules/paises.js` — agregar un pais es
-- agregar una entrada, no un deploy de base. Por eso el CHECK de
-- `tipo_documento` se saca: seria una migracion por cada pais nuevo.
--
-- Lo que SI baja a SQL es la regla de "esta completo", porque es la que sella
-- `completado_at` y ese flag abre la consola. Si sólo existiera en el
-- navegador, entrar seria cuestion de mandar un request a mano.

/* ═══════════ 1. MODALIDAD: LA FIJA EL DUENIO ═══════════ */

-- En que relacion esta alguien con la empresa es una decision de la empresa,
-- no una autodeclaracion. Por eso vive en `platform_admins` —que solo escribe
-- el duenio— y no en el legajo, que lo edita la persona.
alter table public.platform_admins
  add column if not exists modalidad text not null default 'empleado'
    check (modalidad in ('empleado', 'contratista'));

comment on column public.platform_admins.modalidad is
  'empleado = relacion de dependencia (legajo completo). contratista = factura '
  'su servicio (solo datos fiscales y de cobro). La fija el duenio al dar el '
  'acceso: en que relacion esta alguien con la empresa es una decision de la '
  'empresa, no una autodeclaracion.';

/* ═══════════ 2. EL LEGAJO, GENERALIZADO ═══════════ */

alter table public.staff_legajo add column if not exists nombre text;
alter table public.staff_legajo add column if not exists apellido text;
alter table public.staff_legajo add column if not exists pais text not null default 'AR';
alter table public.staff_legajo add column if not exists identificacion_fiscal text;
alter table public.staff_legajo add column if not exists cuenta_numero text;
alter table public.staff_legajo add column if not exists cuenta_alias text;
alter table public.staff_legajo add column if not exists cuenta_banco text;
alter table public.staff_legajo add column if not exists cuenta_swift text;
alter table public.staff_legajo add column if not exists titular_es_empresa boolean not null default false;
alter table public.staff_legajo add column if not exists razon_social text;

-- El dato no se tira aunque la unica fila sea una prueba: el nombre completo se
-- parte por el PRIMER espacio, que acierta en el caso comun y deja el resto
-- como apellido. Partir por el ultimo romperia los apellidos compuestos, que
-- son mas frecuentes que los nombres compuestos.
update public.staff_legajo
set nombre = coalesce(nombre, nullif(split_part(trim(nombre_completo), ' ', 1), '')),
    apellido = coalesce(apellido,
      nullif(trim(substr(trim(nombre_completo),
        length(split_part(trim(nombre_completo), ' ', 1)) + 1)), ''))
where nombre_completo is not null;

update public.staff_legajo set identificacion_fiscal = cuil
  where cuil is not null and identificacion_fiscal is null;
update public.staff_legajo set cuenta_numero = cbu
  where cbu is not null and cuenta_numero is null;
update public.staff_legajo set cuenta_alias = alias_bancario
  where alias_bancario is not null and cuenta_alias is null;
update public.staff_legajo set cuenta_banco = banco
  where banco is not null and cuenta_banco is null;

alter table public.staff_legajo drop column if exists nombre_completo;
alter table public.staff_legajo drop column if exists cuil;
alter table public.staff_legajo drop column if exists cbu;
alter table public.staff_legajo drop column if exists alias_bancario;
alter table public.staff_legajo drop column if exists banco;

-- El check viejo listaba los documentos de Argentina. Los documentos ahora los
-- declara el pais, y esa lista crece cada vez que se contrata en otro lado.
alter table public.staff_legajo drop constraint if exists staff_legajo_tipo_documento_check;

/* ═══════════ 3. QUE ES "COMPLETO", AHORA ═══════════ */

-- Espeja `tieneDorso()` de src/modules/paises.js.
create or replace function public.documento_tiene_dorso(p_pais text, p_tipo text)
returns boolean
language sql
immutable
as $$
  select case
    when p_tipo is null then false
    when p_tipo in ('pasaporte') then false
    when p_tipo in ('dni', 'ci', 'documento_nacional') then true
    else false
  end
$$;

-- Espeja `camposDeCobro()`.
create or replace function public.cobro_completo(l public.staff_legajo)
returns boolean
language sql
immutable
as $$
  select
    nullif(trim(coalesce(l.cuenta_numero, '')), '') is not null
    and case coalesce(l.pais, 'OTRO')
      -- En Argentina el CBU alcanza: el banco se deduce del numero y el alias
      -- es comodidad. Afuera hace falta saber a que banco va.
      when 'AR' then true
      when 'OTRO' then
        nullif(trim(coalesce(l.cuenta_banco, '')), '') is not null
        and nullif(trim(coalesce(l.cuenta_swift, '')), '') is not null
      else nullif(trim(coalesce(l.cuenta_banco, '')), '') is not null
    end
$$;

-- STABLE y no IMMUTABLE: lee la modalidad de `platform_admins`, que puede
-- cambiar. Un trigger puede llamar una funcion stable sin problema.
create or replace function public.legajo_completo(l public.staff_legajo)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_modalidad text;
  v_ok boolean;
begin
  select modalidad into v_modalidad
    from public.platform_admins where user_id = l.user_id;
  v_modalidad := coalesce(v_modalidad, 'empleado');

  -- Identidad: se pide siempre.
  v_ok :=
    nullif(trim(coalesce(l.nombre, '')), '') is not null
    and nullif(trim(coalesce(l.apellido, '')), '') is not null
    and nullif(trim(coalesce(l.pais, '')), '') is not null
    and l.fecha_nacimiento is not null
    and nullif(trim(coalesce(l.tipo_documento, '')), '') is not null
    and nullif(trim(coalesce(l.numero_documento, '')), '') is not null
    and nullif(trim(coalesce(l.identificacion_fiscal, '')), '') is not null
    and nullif(trim(coalesce(l.doc_frente_path, '')), '') is not null
    and nullif(trim(coalesce(l.titular_cuenta, '')), '') is not null;

  -- El dorso, solo si ese documento lo tiene.
  if v_ok and public.documento_tiene_dorso(l.pais, l.tipo_documento) then
    v_ok := nullif(trim(coalesce(l.doc_dorso_path, '')), '') is not null;
  end if;

  -- Domicilio y telefono: solo en relacion de dependencia.
  if v_ok and v_modalidad = 'empleado' then
    v_ok :=
      nullif(trim(coalesce(l.calle, '')), '') is not null
      and nullif(trim(coalesce(l.altura, '')), '') is not null
      and nullif(trim(coalesce(l.localidad, '')), '') is not null
      and nullif(trim(coalesce(l.provincia, '')), '') is not null
      and nullif(trim(coalesce(l.codigo_postal, '')), '') is not null
      and nullif(trim(coalesce(l.telefono, '')), '') is not null;
  end if;

  if v_ok then v_ok := public.cobro_completo(l); end if;

  return v_ok;
end $$;

revoke execute on function public.legajo_completo(public.staff_legajo) from public, anon;

-- Los contactos de emergencia dejaron de ser obligatorios. Son datos de un
-- TERCERO que no dio su consentimiento, y frenar un alta por eso es frenarla
-- por algo que la persona no siempre puede resolver en el momento.
