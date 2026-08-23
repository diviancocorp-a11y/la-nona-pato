-- 0056 Foto de perfil del equipo, y la ficha que el duenio puede mirar.
-- Aplicada via MCP el 21/ago/2026.
--
-- ── POR QUE HACIA FALTA LA VISTA ──
-- La 0054 dejo al duenio poder LEER `staff_legajo` (policy staff_legajo_duenio)
-- y ahi termino. Sin pantalla que lo lea, el edificio junta fotos de documentos
-- y CBUs que nadie puede consultar: peor que no juntarlos, porque el riesgo de
-- guardarlos esta y el beneficio no.
--
-- La ficha necesita ademas el EMAIL de cada persona para saber de quien es, y
-- eso vive en `platform_admins`. Se resuelve con una vista y no con un join
-- desde el cliente porque PostgREST exigiria una FK declarada entre las dos
-- tablas — y esa FK no existe ni deberia: `platform_admins` dice quien tiene
-- acceso HOY, y un legajo sobrevive a que alguien deje de tenerlo.
--
-- ── security_invoker ──
-- Sin eso, una vista corre con los permisos de QUIEN LA CREO, y cualquier staff
-- veria el legajo de todos con solo consultarla. Con security_invoker cada uno
-- ve lo que sus propias policies le dejan: la persona lo suyo, el duenio todo.

alter table public.staff_legajo
  add column if not exists foto_perfil_path text;

comment on column public.staff_legajo.foto_perfil_path is
  'Opcional. Path dentro del bucket privado staff-legajo, no una URL: una URL '
  'firmada vence.';

-- La foto va al MISMO bucket privado que el documento. Podria ser publica —una
-- cara no es un DNI— pero un segundo bucket con otras policies es una segunda
-- superficie donde equivocarse, y lo unico que se gana es que cargue mas rapido
-- en una lista de ocho personas.

create or replace view public.staff_fichas
with (security_invoker = true) as
  select
    a.user_id, a.email, a.rol, a.puesto, a.modalidad, a.created_at as alta_at,
    l.nombre, l.apellido, l.pais, l.completado_at, l.foto_perfil_path
  from public.platform_admins a
  left join public.staff_legajo l on l.user_id = a.user_id;

comment on view public.staff_fichas is
  'El equipo con el estado de su legajo. security_invoker: cada quien ve lo que '
  'sus policies le dejan ver, no lo que veria el duenio de la vista.';

grant select on public.staff_fichas to authenticated;
