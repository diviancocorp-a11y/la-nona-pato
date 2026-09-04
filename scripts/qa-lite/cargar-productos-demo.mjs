#!/usr/bin/env node
/**
 * Catalogo de QA con volumen suficiente para juzgar una composicion.
 *
 * POR QUE NO VA EN `seed.sql`
 * El seed es el fixture DETERMINISTA de los gates: cuatro productos, ids
 * fijos, y todos los contratos de pixel de Phase 1/8/9 estan medidos contra
 * el. Agregarle diez filas mas cambiaria cada captura de referencia del
 * harness. Esto es lo contrario: data de REVISION, que se carga a mano
 * cuando hay que mirar una pantalla con el volumen que va a tener en un
 * negocio real, y se borra con `npm run qa:lite:setup`.
 *
 *   node scripts/qa-lite/cargar-productos-demo.mjs
 *   node scripts/qa-lite/cargar-productos-demo.mjs --limpiar
 *
 * Los ids arrancan con 3000...9xxx para no chocar nunca con los del seed.
 */
import { createClient } from '@supabase/supabase-js';
import { getLocalStatus, assertLocalUrl, QA_TENANT_ID } from '../../platform/qa-lite/lib.mjs';

const LIMPIAR = process.argv.includes('--limpiar');

/* Precios y categorias de un local real, no `Producto 1..15`: una composicion
   se juzga con nombres de largo variable, que es lo que revienta un layout. */
const CATALOGO = [
  ['Milanesa napolitana con papas', 12800, 'Principales', true],
  ['Bife de chorizo (300g)', 18500, 'Principales', true],
  ['Risotto de hongos', 11200, 'Principales', true],
  ['Pollo grillado con ensalada', 9800, 'Principales', true],
  ['Ravioles de ricota y nuez', 10500, 'Principales', false],
  ['Empanada de carne', 1800, 'Entradas', true],
  ['Provoleta a la parrilla', 6400, 'Entradas', true],
  ['Rabas', 8900, 'Entradas', true],
  ['Flan casero con dulce de leche', 4600, 'Postres', true],
  ['Tiramisu', 5200, 'Postres', true],
  ['Helado artesanal (2 bochas)', 3900, 'Postres', false],
  ['Agua mineral 500ml', 1600, 'Bebidas', true],
  ['Gaseosa linea Coca-Cola', 2200, 'Bebidas', true],
  ['Cerveza artesanal pinta', 4800, 'Bebidas', true],
  ['Vino Malbec copa', 5500, 'Bebidas', true],
  ['Cafe cortado', 1900, 'Cafeteria', true],
  ['Submarino', 3400, 'Cafeteria', true],
];

const uuid = (n) => `30000000-0000-4000-8000-0000000${String(900 + n).padStart(5, '0')}`;

const status = getLocalStatus();
assertLocalUrl(status.apiUrl, 'Supabase API URL');
const admin = createClient(status.apiUrl, status.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ids = CATALOGO.map((_, i) => uuid(i));

if (LIMPIAR) {
  const { error } = await admin.from('products').delete().in('id', ids);
  if (error) throw new Error(`No se pudo limpiar: ${error.message}`);
  console.log(`[demo] ${ids.length} producto(s) de revision eliminados`);
  process.exit(0);
}

const filas = CATALOGO.map(([name, price, category, active], i) => ({
  id: uuid(i),
  tenant_id: QA_TENANT_ID,
  type: 'simple',
  name,
  price,
  active,
  category,
  description: 'Producto de revision visual (Phase 4).',
  requires_age_gate: name.includes('Cerveza') || name.includes('Vino'),
  // Fecha fija: si fuera `now()`, dos corridas darian ordenes distintos.
  created_at: `2026-09-01T12:${String(i).padStart(2, '0')}:00-03:00`,
}));

const { error } = await admin.from('products').upsert(filas, { onConflict: 'id' });
if (error) throw new Error(`No se pudieron cargar: ${error.message}`);

const categorias = [...new Set(CATALOGO.map((c) => c[2]))];
const ocultos = CATALOGO.filter((c) => !c[3]).length;
console.log(`[demo] ${filas.length} productos en ${categorias.length} categorias (${ocultos} ocultos)`);
console.log(`[demo] ${categorias.join(' · ')}`);
