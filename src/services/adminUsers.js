// src/services/adminUsers.js
// Gestion del equipo que entra al panel.
//
// Dos funciones distintas, no una con ifs: en el legacy los permisos viven en
// `admin_users` (una lista global del negocio); en el edificio, en
// `tenant_members` (una fila por persona POR NEGOCIO). La misma persona puede
// ser duena de un local y staff de otro, y eso el modelo viejo no lo expresa.
import { supabase } from '../lib/supabase';
import business from '@business';
import { resolveTenantSlug } from '../lib/activeTenant';

const esPlataforma = () => business?.platform === true;

async function call(action, payload = {}) {
  const cuerpo = { action, ...payload };
  let fn = 'admin-users';
  if (esPlataforma()) {
    fn = 'tenant-users';
    const slug = await resolveTenantSlug();
    if (!slug) return { ok: false, error: 'No se pudo identificar el negocio' };
    cuerpo.tenant_slug = slug;
  }
  const { data, error } = await supabase.functions.invoke(fn, { body: cuerpo });
  if (error) {
    // FunctionsHttpError: el body real viene en error.context
    let message = error.message || 'Error de conexion';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      }
    } catch { /* empty */ }
    return { ok: false, error: message };
  }
  if (!data?.ok) return { ok: false, error: data?.error || 'Error desconocido' };
  return data;
}

/** Lista los usuarios con acceso al admin. */
export async function listAdminUsers() {
  return call('list');
}

/**
 * Da acceso al panel. Si el email YA tiene cuenta en la plataforma se lo suma
 * al equipo SIN tocarle la contrasena — entra con la que ya usaba. La
 * respuesta trae `reused: true` y un mensaje para avisarlo.
 */
export async function createAdminUser(email, password, role = 'staff') {
  return call('create', { email, password, role });
}

/** Cambia el rol owner/staff. */
export async function setAdminRole(userId, role) {
  return call('set_role', { user_id: userId, role });
}

/** Quita el acceso al admin (no borra la cuenta). */
export async function removeAdminUser(userId) {
  return call('remove', { user_id: userId });
}
