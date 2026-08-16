// src/services/platformInventory.js
// Insumos del edificio (tabla `ingredients`, migracion 0026). ETAPA 1.
//
// `ingredients` existe en las dos bases, con el mismo juego de columnas salvo
// `tenant_id` (y el id, que aca es uuid). Por eso este archivo esta en
// PLATFORM_PATHS: sin eso el pre-commit lo validaria contra el snapshot legacy.
//
// Igual que en los otros services de la plataforma: RLS decide QUE PODES ver,
// el filtro por tenant_id decide QUE ESTAS MIRANDO.

import { supabase } from '../lib/supabase';

// Literal a proposito: check-supabase-columns solo resuelve constantes de
// modulo con string literal, no listas armadas en runtime.
const COLS = 'id, tenant_id, name, unit, cost, stock, min_stock, category, food_category, is_archived, created_at';

export { COLS as SELECT_COLS };

// Lo que el formulario puede escribir. tenant_id se agrega aparte; id y
// created_at los maneja la DB.
export const CAMPOS_EDITABLES = [
  'name', 'unit', 'cost', 'stock', 'min_stock', 'category', 'food_category', 'is_archived',
];

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/**
 * Insumos del tenant. Por defecto sin archivados: Stock.jsx espera la lista
 * viva, y el archivado es su forma de "borrar" sin perder el historico.
 */
export async function fetchIngredients(tenantId, { incluirArchivados = false } = {}) {
  exigirTenant(tenantId, 'fetchIngredients');
  let q = supabase
    .from('ingredients')
    .select(COLS)
    .eq('tenant_id', tenantId);
  if (!incluirArchivados) q = q.eq('is_archived', false);

  const { data, error } = await q.order('name');
  if (error) { console.error('fetchIngredients:', error.message); return []; }
  return data || [];
}

/** Devuelve array de errores (vacio = ok). */
export function validateIngredient(ing) {
  const errs = [];
  if (!ing?.name?.trim()) errs.push('El nombre no puede estar vacio');

  for (const [campo, etiqueta] of [['cost', 'El costo'], ['stock', 'El stock'], ['min_stock', 'El stock minimo']]) {
    const raw = ing?.[campo];
    if (raw === '' || raw == null) continue; // opcional: la DB tiene default 0
    const n = Number(raw);
    // Ojo con el vacio: Number('') es 0 y pasaria como valido. Por eso se
    // descarta arriba en vez de dejar que caiga aca.
    if (!Number.isFinite(n) || n < 0) errs.push(`${etiqueta} tiene que ser un numero de 0 o mas`);
  }
  return errs;
}

function toRow(ing, tenantId) {
  const num = (v) => (v === '' || v == null ? 0 : Number(v));
  return {
    ...(ing.id ? { id: ing.id } : {}),
    tenant_id: tenantId,
    name: ing.name.trim(),
    unit: ing.unit?.trim() || null,
    cost: num(ing.cost),
    stock: num(ing.stock),
    min_stock: num(ing.min_stock),
    category: ing.category?.trim() || null,
    food_category: ing.food_category?.trim() || null,
    is_archived: !!ing.is_archived,
  };
}

export async function upsertIngredient(tenantId, ing) {
  exigirTenant(tenantId, 'upsertIngredient');
  const errs = validateIngredient(ing);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const { data, error } = await supabase
    .from('ingredients')
    .upsert(toRow(ing, tenantId))
    .select(COLS)
    .single();

  if (error) {
    console.error('upsertIngredient:', error.message);
    // Indice unico parcial por (tenant_id, lower(name)) sobre no archivados.
    if (error.code === '23505') {
      return { __error: 'duplicate', message: `Ya tenés un insumo que se llama "${ing.name.trim()}"` };
    }
    return { __error: 'db', message: error.message };
  }
  return data;
}

/**
 * Archivar en vez de borrar: el insumo puede estar referenciado por recetas
 * (Etapa 2) y por compras (Etapa 3). Sale del listado y libera el nombre.
 */
export async function archiveIngredient(id) {
  const { error } = await supabase.from('ingredients').update({ is_archived: true }).eq('id', id);
  if (error) { console.error('archiveIngredient:', error.message); return false; }
  return true;
}

export async function unarchiveIngredient(id) {
  const { error } = await supabase.from('ingredients').update({ is_archived: false }).eq('id', id);
  if (error) { console.error('unarchiveIngredient:', error.message); return false; }
  return true;
}

/**
 * Ajuste relativo de stock (+/-). Lee y escribe en dos pasos, asi que dos
 * ajustes simultaneos del mismo insumo pueden pisarse. Es aceptable mientras
 * el unico que ajusta es el operador desde el panel; cuando los pedidos
 * descuenten stock solos (Etapa 2), esto tiene que pasar a ser una RPC
 * atomica como `adjust_stock` en el legacy.
 */
export async function adjustStock(tenantId, id, delta) {
  exigirTenant(tenantId, 'adjustStock');
  const { data: actual, error: errLeer } = await supabase
    .from('ingredients')
    .select('id, stock')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .single();
  if (errLeer) { console.error('adjustStock (leer):', errLeer.message); return null; }

  const nuevo = Math.max(0, Number(actual.stock || 0) + Number(delta || 0));
  const { data, error } = await supabase
    .from('ingredients')
    .update({ stock: nuevo })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) { console.error('adjustStock:', error.message); return null; }
  return data;
}

/** Insumos en o por debajo del minimo. Calculo local: la lista ya esta en memoria. */
export function bajoMinimo(ingredientes) {
  return ingredientes.filter(i => Number(i.stock) <= Number(i.min_stock) && Number(i.min_stock) > 0);
}
