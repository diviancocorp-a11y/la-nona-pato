// src/services/qrs.js
//
// Service para QRs dinámicos (short URLs editables).
// Tabla: dynamic_qrs (id, slug, name, target_url, visits, is_active, ...)
//
// Flujo:
//   - Admin crea un QR con slug fijo + target_url. El sistema genera el QR
//     PNG con el slug → el cliente imprime.
//   - El cliente escanea, navega a /q/<slug>, el frontend hace fetch del
//     target_url y redirige. Llama a increment_qr_visit() para analytics.
//   - Si el admin cambia el target_url, los QRs ya impresos siguen funcionando
//     porque el slug no se modifica.

import { supabase } from '../lib/supabase';
import business from '@business';
import { resolveTenantSlug, resolveTenantId } from '../lib/activeTenant';
import { DynamicQrInputSchema, validateInput } from '../lib/schemas/index.js';

const esPlataforma = () => business?.platform === true;

export async function fetchAllQrs() {
  let q = supabase.from('dynamic_qrs').select('*').order('created_at', { ascending: false });
  // RLS decide QUE PODES ver; el filtro decide QUE ESTAS MIRANDO.
  if (esPlataforma()) {
    const tenantId = await resolveTenantId();
    if (!tenantId) return [];
    q = q.eq('tenant_id', tenantId);
  }
  const { data, error } = await q;
  if (error) { console.error('fetchAllQrs:', error.message); return []; }
  return data || [];
}

/** Busca un QR por slug. Solo retorna los activos. Usado por la route pública /q/:slug. */
export async function fetchQrBySlug(slug) {
  if (!slug) return null;

  if (esPlataforma()) {
    // En el edificio resolver y contar es UNA llamada: desde un teléfono
    // recién escaneando, un segundo request para sumar la visita a veces no
    // llega porque el browser ya navegó al destino.
    const tenantSlug = await resolveTenantSlug();
    if (!tenantSlug) return null;
    const { data, error } = await supabase.rpc('resolve_qr', {
      p_tenant_slug: tenantSlug,
      p_slug: slug,
    });
    if (error) { console.error('fetchQrBySlug:', error.message); return null; }
    return data || null;
  }

  const { data, error } = await supabase
    .from('dynamic_qrs')
    .select('id, slug, target_url, name, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) { console.error('fetchQrBySlug:', error.message); return null; }
  return data;
}

/**
 * Incrementa el contador de visitas. Fire-and-forget — no esperamos respuesta.
 * En el edificio NO hace nada: resolve_qr ya conto la visita al entregar el
 * destino. Llamarlo igual contaria dos veces cada escaneo.
 */
export async function incrementQrVisit(slug) {
  if (!slug || esPlataforma()) return;
  // RPC con SECURITY DEFINER — anon puede llamarlo
  await supabase.rpc('increment_qr_visit', { qr_slug: slug }).then(() => {}).catch(() => {});
}

export async function upsertQr(qr) {
  const validation = validateInput(DynamicQrInputSchema, qr, 'upsertQr');
  if (!validation.ok) {
    return { __error: 'validation', message: validation.errors.join(', ') };
  }
  // updated_at se actualiza manualmente porque no tenemos trigger
  const payload = { ...validation.data, updated_at: new Date().toISOString() };
  if (esPlataforma()) {
    const tenantId = await resolveTenantId();
    if (!tenantId) return { __error: 'validation', message: 'No se pudo identificar el negocio.' };
    payload.tenant_id = tenantId;
  }
  const { data, error } = await supabase.from('dynamic_qrs').upsert(payload).select().single();
  if (error) {
    if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('duplicate')) {
      return { __error: 'duplicate', message: 'Ese slug ya está en uso. Elegí otro.' };
    }
    console.error('upsertQr:', error.message);
    return null;
  }
  return data;
}

export async function deleteQr(id) {
  const { error } = await supabase.from('dynamic_qrs').delete().eq('id', id);
  return !error;
}

/** Genera un slug random (8 chars alfanuméricos legibles, evita ambiguos). */
export function generateRandomSlug(length = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // sin 0/o/1/l/i para evitar confusión visual
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
