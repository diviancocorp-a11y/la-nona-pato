// src/services/platformSuppliers.js
// Proveedores del edificio (tabla `suppliers`, migracion 0030). ETAPA 3.
//
// `suppliers` existe en las dos bases con las mismas columnas salvo
// `tenant_id`. Por eso este archivo esta en PLATFORM_PATHS
// (scripts/check-supabase-columns.mjs): sin eso el pre-commit lo validaria
// contra el snapshot legacy.
//
// Igual que en los otros services de la plataforma: RLS decide QUE PODES ver,
// el filtro por tenant_id decide QUE ESTAS MIRANDO. Hacen falta los dos.

import { supabase } from '../lib/supabase';

// Literal a proposito: check-supabase-columns solo resuelve constantes de
// modulo con string literal, no listas armadas en runtime.
const COLS = 'id, tenant_id, name, category, cuit, can_invoice, location, phone, email, notes, is_active, created_at, updated_at';

export { COLS as SELECT_COLS };

// Lo que el formulario puede escribir. tenant_id se agrega aparte; id solo
// viaja cuando es una edicion; created_at/updated_at los maneja la DB.
export const CAMPOS_EDITABLES = [
  'name', 'category', 'cuit', 'can_invoice', 'location', 'phone', 'email', 'notes', 'is_active',
];

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/**
 * Proveedores del tenant. Por defecto SOLO los activos, que es lo que piden
 * los selectores de gasto y de compra: un proveedor pausado no tiene que
 * aparecer ahi. El gestor pide todos y los recibe con los pausados al fondo.
 */
export async function fetchSuppliers(tenantId, { activeOnly = true } = {}) {
  exigirTenant(tenantId, 'fetchSuppliers');
  let q = supabase.from('suppliers').select(COLS).eq('tenant_id', tenantId);
  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });
  if (error) { console.error('fetchSuppliers:', error.message); return []; }
  return data || [];
}

/** Devuelve array de errores (vacio = ok). */
export function validateSupplier(s) {
  const errs = [];
  const nombre = (s?.name || '').trim();
  if (nombre.length < 2) errs.push('El nombre tiene que tener al menos 2 caracteres');
  if (s?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email).trim())) {
    errs.push('El email no parece valido');
  }
  return errs;
}

function toRow(s, tenantId) {
  const texto = (v) => {
    const t = (v ?? '').toString().trim();
    return t === '' ? null : t;
  };
  return {
    ...(s.id ? { id: s.id } : {}),
    tenant_id: tenantId,
    // El trim no es cosmetico: el indice unico normaliza con lower(btrim(name)),
    // asi que sin esto "  Carniceria" se guardaria con los espacios adentro y
    // la lista mostraria dos veces lo que la DB considera el mismo nombre.
    name: (s.name || '').trim(),
    category: texto(s.category),
    cuit: texto(s.cuit),
    can_invoice: !!s.can_invoice,
    location: texto(s.location),
    phone: texto(s.phone),
    email: texto(s.email),
    notes: texto(s.notes),
    is_active: s.is_active === undefined ? true : !!s.is_active,
  };
}

export async function upsertSupplier(tenantId, s) {
  exigirTenant(tenantId, 'upsertSupplier');
  const errs = validateSupplier(s);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const { data, error } = await supabase
    .from('suppliers')
    .upsert(toRow(s, tenantId))
    .select(COLS)
    .single();

  if (error) {
    console.error('upsertSupplier:', error.message);
    // Indice unico por (tenant_id, lower(btrim(name))).
    if (error.code === '23505') {
      return { __error: 'duplicate', message: `Ya tenés un proveedor que se llama "${(s.name || '').trim()}"` };
    }
    return { __error: 'db', message: error.message };
  }
  return data;
}

/**
 * Pause/play. Pausar NO es borrar: el proveedor sale de los selectores de
 * gasto y compra pero sus gastos historicos siguen apuntandole.
 */
export async function toggleSupplierActive(id, isActive) {
  const { error } = await supabase.from('suppliers').update({ is_active: !!isActive }).eq('id', id);
  if (error) { console.error('toggleSupplierActive:', error.message); return { __error: 'db', message: error.message }; }
  return { ok: true };
}

/**
 * Eliminacion real. Los gastos historicos no se pierden: la FK es
 * `on delete set null` y el nombre quedo copiado en `expenses.supplier`.
 */
export async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) { console.error('deleteSupplier:', error.message); return { __error: 'db', message: error.message }; }
  return { ok: true };
}
