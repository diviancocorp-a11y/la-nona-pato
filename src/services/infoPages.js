// src/services/infoPages.js
// Paginas de info del negocio (como llegar, terminos, preguntas). Etapa 6.
//
// Bifurca por `business.platform` como account.js y catalog.js. Dos caminos
// de lectura a proposito:
//   - el panel (miembro logueado) lee la tabla, con RLS por tenant
//   - el visitante del catalogo entra por el RPC publico get_info_page con el
//     SLUG del negocio, igual que get_catalog: no tiene sesion ni forma de
//     traducir slug -> uuid
//
// Antes de esto, InfoPages.jsx consultaba la tabla inline. Se mudo aca por lo
// mismo que AuthContext: en el edificio esas consultas necesitan tenant y una
// pantalla no deberia saber contra que base esta.

import { supabase } from '../lib/supabase';
import business from '@business';
import { resolveTenantSlug, resolveTenantId } from '../lib/activeTenant';

const esPlataforma = () => business?.platform === true;

/** Todas las paginas del negocio, para el editor del panel. */
export async function fetchInfoPages() {
  let q = supabase.from('info_pages').select('*').order('created_at', { ascending: false });
  // RLS decide QUE PODES ver; el filtro decide QUE ESTAS MIRANDO. Un dueno de
  // varios negocios necesita los dos (el bug de la Etapa 0).
  if (esPlataforma()) {
    const tenantId = await resolveTenantId();
    if (!tenantId) return [];
    q = q.eq('tenant_id', tenantId);
  }
  const { data, error } = await q;
  if (error) { console.error('fetchInfoPages:', error.message); return []; }
  return data || [];
}

/**
 * Crea o actualiza. Devuelve `{ ok }`, `{ __error }`.
 *
 * `.select('id')` no es decorativo: si la RLS bloquea, Supabase devuelve 0
 * filas SIN error y el editor mostraba "guardado" habiendo guardado nada
 * (paso en produccion el 12/jun, faltaban las policies de escritura).
 */
export async function saveInfoPage({ id, ...campos }) {
  const payload = { ...campos, updated_at: new Date().toISOString() };
  if (esPlataforma()) {
    const tenantId = await resolveTenantId();
    if (!tenantId) return { __error: 'No se pudo identificar el negocio.' };
    payload.tenant_id = tenantId;
  }

  const res = id && id !== 'new'
    ? await supabase.from('info_pages').update(payload).eq('id', id).select('id')
    : await supabase.from('info_pages').insert(payload).select('id');

  if (res.error) {
    if (res.error.code === '23505') return { __error: 'Ya existe una página con esa dirección.' };
    console.error('saveInfoPage:', res.error.message);
    return { __error: 'Error al guardar.' };
  }
  if (!res.data?.length) {
    return { __error: 'No se guardó: tu usuario no tiene permiso de edición. Avisale al dueño.' };
  }
  return { ok: true };
}

export async function deleteInfoPage(id) {
  const { error } = await supabase.from('info_pages').delete().eq('id', id);
  return !error;
}

/** La pagina que ve un visitante del catalogo. Sin sesion. */
export async function fetchPublicInfoPage(slug) {
  if (!slug) return null;

  if (esPlataforma()) {
    const tenantSlug = await resolveTenantSlug();
    if (!tenantSlug) return null;
    const { data, error } = await supabase.rpc('get_info_page', {
      p_tenant_slug: tenantSlug,
      p_slug: slug,
    });
    if (error) { console.error('fetchPublicInfoPage:', error.message); return null; }
    return data || null;
  }

  const { data } = await supabase
    .from('info_pages')
    .select('slug, title, blocks, requires_age_gate')
    .eq('slug', slug)
    .eq('visible', true)
    .maybeSingle();
  return data || null;
}
