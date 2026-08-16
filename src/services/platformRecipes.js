// src/services/platformRecipes.js
// Recetas del edificio: que insumos lleva cada producto y cuanto cuesta.
// ETAPA 2 (tabla product_ingredients, migracion 0028).
//
// No hay tabla `recipes`: en el edificio la receta ES el producto
// (`products` con `type='composite'`). Esto solo modela la relacion
// producto -> insumos.
//
// SIN COMBOS por decision explicita (16/ago): un combo es un producto hecho de
// otros productos y el costeo se vuelve recursivo. Cuando entren, van aparte.
//
// El costeo es funcion PURA sobre datos ya cargados. Eso importa: la lista de
// productos muestra costo y margen de todos a la vez, y hacer una consulta por
// producto seria una cascada de queries por render.

import { supabase } from '../lib/supabase';

const COLS = 'tenant_id, product_id, ingredient_id, qty, created_at';

export { COLS as SELECT_COLS };

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

// Los mismos defaults que muestra la pantalla de configuracion
// (Settings.jsx: `waste_pct ?? 5`, `expense_pct ?? 0`) y que usa el legacy en
// useFinancials. Tienen que coincidir en los tres lados o el numero que ve el
// usuario no es el que se calcula.
export const PCT_MERMA_DEFAULT = 5;
export const PCT_GASTOS_DEFAULT = 0;

/* ─────────────────────────── Lectura ─────────────────────────── */

/**
 * TODAS las lineas de receta del tenant, de una. El panel necesita costear la
 * lista entera; pedir por producto seria una consulta por fila en pantalla.
 */
export async function fetchProductIngredients(tenantId) {
  exigirTenant(tenantId, 'fetchProductIngredients');
  const { data, error } = await supabase
    .from('product_ingredients')
    .select(COLS)
    .eq('tenant_id', tenantId);
  if (error) { console.error('fetchProductIngredients:', error.message); return []; }
  return data || [];
}

/** Agrupa las lineas por producto: { [product_id]: [{ingredient_id, qty}] } */
export function agruparPorProducto(lineas) {
  const mapa = new Map();
  for (const l of lineas || []) {
    if (!mapa.has(l.product_id)) mapa.set(l.product_id, []);
    mapa.get(l.product_id).push({ ingredient_id: l.ingredient_id, qty: Number(l.qty) || 0 });
  }
  return mapa;
}

/* ─────────────────────────── Costeo ──────────────────────────── */

/**
 * Factor que multiplica al costo bruto. Mismo criterio que el legacy
 * (useFinancials): merma y gastos proyectados son un COLCHON para que el
 * margen no mienta al fijar precios.
 *
 * Ojo con la distincion, que ya costo un bug en el legacy: estos porcentajes
 * son solo para PRICING. El P&L del mes usa costos reales — si se aplican
 * tambien ahi, la merma y los gastos se cuentan dos veces.
 */
export function factorDeCosto(settings) {
  const pct = (v, porDefecto) => {
    // null / undefined / '' = "sin definir" -> el default. OJO: Number(null)
    // es 0, asi que sin este corte un campo vacio en la DB se lee como un 0%
    // explicito. Eso paso: Settings.jsx muestra `waste_pct ?? 5` —o sea 5%—
    // mientras el costeo calculaba con 0%. La pantalla decia una cosa y la
    // cuenta hacia otra, sin que nada fallara.
    if (v === null || v === undefined || v === '') return porDefecto;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return porDefecto;
    return Math.min(100, n);   // un 0 explicito SI vale 0: es una eleccion
  };
  const merma = pct(settings?.waste_pct, PCT_MERMA_DEFAULT);
  const gastos = pct(settings?.expense_pct, PCT_GASTOS_DEFAULT);
  return 1 + (merma + gastos) / 100;
}

/** Indice id -> insumo, para no recorrer la lista por cada linea. */
export function indexarInsumos(ingredientes) {
  return new Map((ingredientes || []).map(i => [i.id, i]));
}

/**
 * Costo bruto de una receta: suma de (costo del insumo x cantidad).
 * Un insumo que ya no esta (archivado o borrado) suma 0 en vez de romper.
 */
export function costoBruto(lineas, insumosPorId) {
  return (lineas || []).reduce((total, l) => {
    const ing = insumosPorId.get(l.ingredient_id);
    if (!ing) return total;
    return total + (Number(ing.cost) || 0) * (Number(l.qty) || 0);
  }, 0);
}

/** Costo con el colchon de merma y gastos aplicado. */
export function costoReceta(lineas, insumosPorId, settings) {
  return costoBruto(lineas, insumosPorId) * factorDeCosto(settings);
}

/**
 * Margen de un producto. Devuelve null cuando no hay receta cargada: sin
 * insumos el costo da 0 y el margen daria 100%, que es una mentira comoda —
 * peor que no mostrar nada.
 */
export function margen(producto, lineas, insumosPorId, settings) {
  if (!lineas?.length) return null;
  const precio = Number(producto?.price) || 0;
  if (precio <= 0) return null;
  const costo = costoReceta(lineas, insumosPorId, settings);
  return {
    costo,
    ganancia: precio - costo,
    pct: ((precio - costo) / precio) * 100,
  };
}

/* ─────────────────────────── Escritura ───────────────────────── */

export function validateLineas(lineas) {
  const errs = [];
  const vistos = new Set();
  for (const l of lineas || []) {
    if (!l.ingredient_id) { errs.push('Hay una linea sin insumo elegido'); continue; }
    if (vistos.has(l.ingredient_id)) errs.push('El mismo insumo esta cargado dos veces');
    vistos.add(l.ingredient_id);
    const q = Number(l.qty);
    if (!Number.isFinite(q) || q <= 0) errs.push('Las cantidades tienen que ser mayores a 0');
  }
  return [...new Set(errs)];
}

/**
 * Reemplaza la receta completa de un producto. Borra y vuelve a insertar en
 * vez de hacer un diff: son pocas lineas y el diff no compensa la complejidad.
 *
 * NO es atomico — el borrado y el insert son dos llamadas. Si el insert falla,
 * el producto queda sin receta y el costo pasa a 0 hasta que se reintente. Es
 * un error visible (el margen desaparece de la lista) y no silencioso, asi que
 * se acepta; cuando haya mas de un operador cargando recetas a la vez,
 * conviene pasarlo a una RPC.
 */
export async function saveProductIngredients(tenantId, productId, lineas) {
  exigirTenant(tenantId, 'saveProductIngredients');
  if (!productId) return { __error: 'validation', message: 'Falta el producto' };

  const errs = validateLineas(lineas);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const { error: errBorrar } = await supabase
    .from('product_ingredients')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('product_id', productId);
  if (errBorrar) {
    console.error('saveProductIngredients (borrar):', errBorrar.message);
    return { __error: 'db', message: errBorrar.message };
  }

  const filas = (lineas || [])
    .filter(l => l.ingredient_id && Number(l.qty) > 0)
    .map(l => ({
      tenant_id: tenantId,
      product_id: productId,
      ingredient_id: l.ingredient_id,
      qty: Number(l.qty),
    }));

  if (filas.length === 0) return [];  // receta vaciada a proposito

  const { data, error } = await supabase
    .from('product_ingredients')
    .insert(filas)
    .select(COLS);

  if (error) {
    console.error('saveProductIngredients:', error.message);
    return { __error: 'db', message: error.message };
  }
  return data || [];
}
