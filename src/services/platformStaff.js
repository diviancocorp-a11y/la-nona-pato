// src/services/platformStaff.js
// El legajo del empleado de Dico y su puesto en la consola (migración 0054).
//
// ESTO ES DICO, NO UN TENANT
// Son los empleados de Divianco. El personal de un negocio cliente es otra
// cosa entera (`platformPersonal.js`) y no comparte ni una tabla.
//
// LO MAS SENSIBLE QUE GUARDA EL EDIFICIO
// Documento con foto, domicilio y CBU. Por eso:
//   - el bucket `staff-legajo` es PRIVADO, al revés que `tenant-images`: una
//     foto de un DNI no la mira nadie sin sesión;
//   - se guardan PATHS y no URLs. Una URL firmada vence, y guardar una vencida
//     es guardar basura que parece un dato. La URL se pide cuando se va a
//     mostrar y dura minutos;
//   - la carpeta es `<user_id>/` y el path se arma SIEMPRE acá. Si una pantalla
//     pudiera elegirlo, podría escribir en la carpeta de otro — es lo mismo que
//     hace `platformStorage.js` con el tenant, por la misma razón.
//
// Ni siquiera un administrador lee esto: sólo la persona y el dueño. Un
// administrador administra la plataforma, no el legajo de sus compañeros.
//
// Este archivo está en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';

const BUCKET = 'staff-legajo';

const COLS = 'user_id, nombre, apellido, pais, fecha_nacimiento, tipo_documento, '
  + 'numero_documento, identificacion_fiscal, doc_frente_path, doc_dorso_path, '
  + 'calle, altura, piso_depto, localidad, provincia, codigo_postal, telefono, '
  + 'emergencia_nombre, emergencia_telefono, cuenta_numero, cuenta_alias, '
  + 'cuenta_banco, cuenta_swift, titular_cuenta, titular_es_empresa, razon_social, '
  + 'foto_perfil_path, fecha_ingreso, completado_at, creado_at, actualizado_at';

export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const TAMANO_MAX = 5 * 1024 * 1024; // el mismo tope que el bucket

/** Devuelve un mensaje de error, o null si el archivo sirve. */
export function validarArchivoDeLegajo(file) {
  if (!file) return 'No se eligió ningún archivo.';
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return 'Tiene que ser una foto (JPG, PNG o WEBP) o un PDF.';
  }
  if (file.size > TAMANO_MAX) {
    return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 5 MB.`;
  }
  return null;
}

/** El legajo de quien está logueado. `null` si todavía no tiene fila. */
export async function fetchMiLegajo() {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('staff_legajo').select(COLS).eq('user_id', uid).maybeSingle();
  if (error) {
    console.error('fetchMiLegajo:', error.message);
    return null;
  }
  return data || null;
}

/**
 * Sube un archivo del legajo y devuelve su PATH (no una URL).
 *
 * @param cual  'frente' | 'dorso'. Sólo sirve para reconocerlo en el panel de
 *              Storage: los permisos los decide la carpeta, no el nombre.
 */
export async function subirArchivoDeLegajo(file, cual) {
  const problema = validarArchivoDeLegajo(file);
  if (problema) return { __error: problema };

  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return { __error: 'Se cerró la sesión. Entrá de nuevo.' };

  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const limpio = String(cual).replace(/[^a-z]/g, '') || 'doc';
  // Nombre nuevo siempre: pisar el anterior dejaría la URL firmada que alguien
  // tenga abierta apuntando a un documento distinto.
  const path = `${uid}/${limpio}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    console.error('subirArchivoDeLegajo:', error.message);
    const m = error.message.toLowerCase();
    if (m.includes('mime') || m.includes('size')) {
      return { __error: 'El servidor rechazó el archivo: revisá que sea una foto o PDF de menos de 5 MB.' };
    }
    return { __error: 'No se pudo subir el archivo. Probá de nuevo.' };
  }
  return { ok: true, path };
}

/**
 * Una URL para MIRAR un archivo del legajo. Vence.
 *
 * El bucket es privado: no hay URL pública que sirva. Se pide en el momento de
 * mostrar y dura poco a propósito — si se pudiera guardar, una foto de un DNI
 * quedaría alcanzable con un link suelto.
 */
export async function urlDeArchivo(path, { segundos = 300 } = {}) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrl(path, segundos);
  if (error) {
    console.error('urlDeArchivo:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Guarda el legajo de quien está logueado.
 *
 * `completado_at` NO se manda: lo sella un trigger cuando los campos
 * obligatorios están (migración 0054). Que el cliente pudiera declararse
 * completo sería dejar que se saltee el formulario con un request a mano.
 */
export async function guardarMiLegajo(borrador) {
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  if (!uid) return { __error: 'auth', message: 'Se cerró la sesión. Entrá de nuevo.' };

  // Lista explicita y no un spread del borrador: la pantalla arrastra campos
  // calculados (`titular` sugerido, errores de formato) que no son columnas, y
  // un upsert con claves de mas falla entero.
  const limpio = {
    user_id: uid,
    nombre: texto(borrador.nombre),
    apellido: texto(borrador.apellido),
    pais: texto(borrador.pais) || 'AR',
    fecha_nacimiento: borrador.fecha_nacimiento || null,
    tipo_documento: texto(borrador.tipo_documento),
    numero_documento: texto(borrador.numero_documento),
    identificacion_fiscal: texto(borrador.identificacion_fiscal),
    doc_frente_path: borrador.doc_frente_path || null,
    doc_dorso_path: borrador.doc_dorso_path || null,
    calle: texto(borrador.calle),
    altura: texto(borrador.altura),
    piso_depto: texto(borrador.piso_depto),
    localidad: texto(borrador.localidad),
    provincia: texto(borrador.provincia),
    codigo_postal: texto(borrador.codigo_postal),
    telefono: texto(borrador.telefono),
    emergencia_nombre: texto(borrador.emergencia_nombre),
    emergencia_telefono: texto(borrador.emergencia_telefono),
    cuenta_numero: texto(borrador.cuenta_numero),
    cuenta_alias: texto(borrador.cuenta_alias),
    cuenta_banco: texto(borrador.cuenta_banco),
    cuenta_swift: texto(borrador.cuenta_swift),
    titular_cuenta: texto(borrador.titular_cuenta),
    titular_es_empresa: !!borrador.titular_es_empresa,
    foto_perfil_path: borrador.foto_perfil_path || null,
    razon_social: texto(borrador.razon_social),
    fecha_ingreso: borrador.fecha_ingreso || null,
  };

  const { data, error } = await supabase
    .from('staff_legajo').upsert(limpio, { onConflict: 'user_id' })
    .select(COLS).maybeSingle();

  if (error) {
    console.error('guardarMiLegajo:', error.message);
    return { __error: 'db', message: 'No se pudo guardar el legajo.' };
  }
  return { ok: true, legajo: data };
}

function texto(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Las fichas del equipo: quién es cada uno y si su legajo está completo.
 *
 * Sale de la vista `staff_fichas` (0056), que junta `platform_admins` con
 * `staff_legajo`. La vista es `security_invoker`, así que devuelve lo que las
 * policies de QUIEN PREGUNTA permiten: la persona ve su fila con datos, y el
 * resto del equipo sin legajo. El dueño las ve todas.
 */
export async function fetchFichas() {
  const { data, error } = await supabase
    .from('staff_fichas')
    .select('user_id, email, rol, puesto, modalidad, alta_at, nombre, apellido, '
      + 'pais, completado_at, foto_perfil_path')
    .order('alta_at');
  if (error) {
    console.error('fetchFichas:', error.message);
    return [];
  }
  return data || [];
}

/**
 * El legajo COMPLETO de una persona. Sólo el dueño lo obtiene con datos.
 *
 * No hace falta chequear permisos acá: la policy `staff_legajo_duenio` (0054)
 * decide, y a quien no corresponde le devuelve vacío. Filtrar en el cliente
 * ADEMAS sería fingir una segunda cerradura que cualquiera saltea.
 */
export async function fetchLegajoDe(userId) {
  const { data, error } = await supabase
    .from('staff_legajo').select(COLS).eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('fetchLegajoDe:', error.message);
    return null;
  }
  return data || null;
}

/** Le cambia el puesto a alguien del equipo. Sólo el dueño. */
export async function cambiarPuesto(userId, puesto) {
  const { data, error } = await supabase.rpc('cambiar_puesto', {
    p_user_id: userId, p_puesto: puesto,
  });
  if (error) {
    console.error('cambiarPuesto:', error.message);
    return { __error: 'db', message: 'No se pudo cambiar el puesto.' };
  }
  if (!data?.ok) {
    const razones = {
      puesto_invalido: 'Ese puesto no existe.',
      no_esta: 'Esa persona ya no está en el equipo.',
    };
    return { __error: 'fn', message: razones[data?.error] || 'No se pudo cambiar el puesto.' };
  }
  return { ok: true, puesto: data.puesto };
}
