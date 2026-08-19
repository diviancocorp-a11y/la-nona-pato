// src/services/platformFinance.js
// Gastos y compras del edificio (tabla `expenses` + RPCs, migracion 0030).
// ETAPA 3.
//
// `expenses` existe en las dos bases; la del edificio suma `tenant_id`. Por eso
// este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).
//
// Dos operaciones NO pasan por la tabla sino por RPC, porque tocan varias
// filas y son plata:
//   - anular un gasto  -> `void_expense`     (reversion + marca, atomico)
//   - registrar compra -> `register_purchase` (stock + costo + gasto, atomico)
// En el legacy las dos son bucles de llamadas desde el navegador, con un
// rollback escrito a mano en JavaScript. Si el navegador se cierra en el
// medio, los libros quedan partidos.

import { supabase } from '../lib/supabase';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia.js';

const COLS = 'id, tenant_id, date, description, amount, category, expense_type, usar_category, supplier, supplier_id, payment_method, payment_account_id, installment_current, installment_total, items, receipt_url, no_receipt, created_by, created_at, voided_at, voided_by, voided_reason, voids_expense_id';

export { COLS as SELECT_COLS };

// Lo que el formulario puede escribir. Lista blanca explicita: la pantalla
// manda el form entero y no queremos que un campo de UI se cuele como columna.
export const CAMPOS_EDITABLES = [
  'date', 'description', 'amount', 'category', 'expense_type', 'usar_category',
  'supplier', 'supplier_id', 'payment_method', 'payment_account_id',
  'installment_current', 'installment_total', 'items', 'receipt_url', 'no_receipt',
  'created_by',
];

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId (sin el, la consulta trae otros negocios)`);
}

/**
 * Los gastos del tenant, del mas nuevo al mas viejo.
 *
 * Sin ventana de fechas a proposito: la pantalla filtra el mes en memoria pero
 * el exportador deja elegir CUALQUIER mes anterior, y una ventana lo dejaria
 * devolviendo cero sin decir por que. Para un negocio nuevo son decenas de
 * filas. Cuando alguno acumule años, esto necesita paginado — el legacy ya
 * tiene el helper (`paginate` en services/finance.js), no hay que inventarlo.
 */
export async function fetchExpenses(tenantId) {
  exigirTenant(tenantId, 'fetchExpenses');
  const { data, error } = await supabase
    .from('expenses')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });
  if (error) { console.error('fetchExpenses:', error.message); return []; }
  return data || [];
}

/** Devuelve array de errores (vacio = ok). */
export function validateExpense(e) {
  const errs = [];
  if (!(e?.description || '').trim()) errs.push('La descripcion no puede estar vacia');

  // Ojo con el vacio: Number('') es 0 y Number(null) tambien. Un gasto de 0 no
  // es un gasto, asi que el corte es el mismo para los tres casos.
  const monto = e?.amount === '' || e?.amount == null ? NaN : Number(e.amount);
  if (!Number.isFinite(monto) || monto <= 0) errs.push('El monto tiene que ser mayor a 0');

  if (e?.expense_type && !['variable', 'fixed', 'installment'].includes(e.expense_type)) {
    errs.push(`Tipo de gasto invalido: ${e.expense_type}`);
  }
  return errs;
}

function toRow(e, tenantId) {
  const texto = (v) => {
    const t = (v ?? '').toString().trim();
    return t === '' ? null : t;
  };
  const entero = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const esCuota = e.expense_type === 'installment';
  return {
    tenant_id: tenantId,
    date: texto(e.date) || new Date().toISOString().slice(0, 10),
    description: (e.description || '').trim(),
    amount: Number(e.amount),
    category: texto(e.category) || 'Otros',
    expense_type: e.expense_type || 'variable',
    usar_category: texto(e.usar_category),
    supplier: texto(e.supplier),
    supplier_id: texto(e.supplier_id),
    payment_method: texto(e.payment_method) || 'efectivo',
    payment_account_id: texto(e.payment_account_id),
    // Las cuotas solo tienen sentido en un gasto de tipo cuota. Si el usuario
    // toco los numeros y despues cambio de tipo, no se guardan.
    installment_current: esCuota ? entero(e.installment_current) : null,
    installment_total: esCuota ? entero(e.installment_total) : null,
    items: Array.isArray(e.items) ? e.items : [],
    receipt_url: texto(e.receipt_url),
    no_receipt: !!e.no_receipt,
    created_by: texto(e.created_by),
  };
}

export async function createExpense(tenantId, e) {
  exigirTenant(tenantId, 'createExpense');
  const errs = validateExpense(e);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const { data, error } = await supabase
    .from('expenses')
    .insert(toRow(e, tenantId))
    .select(COLS)
    .single();

  if (error) {
    console.error('createExpense:', error.message);
    return { __error: 'db', message: error.message };
  }
  return data;
}

/* ─────────────────────────── Anulacion ───────────────────────────── */

// Los codigos que levanta la RPC. Se devuelven tal cual porque la pantalla
// los traduce: la lista vive en `void_expense` (migracion 0030).
const CODIGOS_VOID = ['expense_not_found', 'already_voided', 'is_a_reversal', 'outside_current_month'];

function codigoDeError(mensaje) {
  const m = String(mensaje || '');
  return CODIGOS_VOID.find(c => m.includes(c)) || m;
}

/**
 * Anula un gasto. El original NO se borra: queda marcado y aparece una fila
 * nueva por el monto negativo.
 *
 * Mismo contrato que services/finance.js (`{ ok, original, reversal }` o
 * `{ ok: false, errors }`) para que la pantalla no distinga de donde viene.
 * Los guards y el email de quien anula los pone la DB, no el cliente.
 */
export async function voidExpense({ id, reason }) {
  if (!id) return { ok: false, errors: ['missing id'] };

  const { data, error } = await supabase.rpc('void_expense', {
    p_expense_id: id,
    p_reason: reason || null,
  });

  if (error) {
    console.error('voidExpense:', error.message);
    return { ok: false, errors: [codigoDeError(error.message)] };
  }

  const filas = data || [];
  const reversal = filas.find(f => f.voids_expense_id);
  const original = filas.find(f => !f.voids_expense_id);
  if (!original || !reversal) return { ok: false, errors: ['respuesta_incompleta'] };
  return { ok: true, original, reversal };
}

/* ──────────────────────────── Compras ────────────────────────────── */

const MENSAJES_COMPRA = {
  compra_sin_items: 'La compra no tiene ningún item con cantidad',
  insumo_de_otro_negocio: 'Hay un insumo que no es de este negocio',
  no_sos_miembro: 'No tenés permiso para cargar compras en este negocio',
  falta_tenant: 'Falta el negocio',
};

/**
 * Registra una compra: sube el stock, actualiza el costo de cada insumo al
 * precio que se acaba de pagar, y asienta el gasto. Las tres cosas pasan
 * juntas o no pasa ninguna.
 *
 * El gasto se parte en una fila por categoria de alimento (lo hace la RPC):
 * es lo que va a permitir que el P&L de la Etapa 4 separe comida de packaging
 * sin contar dos veces.
 */
export async function registerPurchase(tenantId, {
  date, items, supplier, supplierId,
  paymentMethod, paymentAccountId, receiptUrl, noReceipt,
} = {}) {
  exigirTenant(tenantId, 'registerPurchase');

  const lineas = (items || [])
    .filter(it => it.ingredient_id && Number(it.qty) > 0)
    .map(it => ({
      ingredient_id: it.ingredient_id,
      qty: Number(it.qty),
      unit_cost: Number(it.unitCost ?? it.unit_cost) || 0,
    }));
  if (lineas.length === 0) {
    return { __error: 'validation', message: MENSAJES_COMPRA.compra_sin_items };
  }

  const { data, error } = await supabase.rpc('register_purchase', {
    p_tenant_id: tenantId,
    p_date: date || null,
    p_items: lineas,
    p_supplier: supplier || null,
    p_supplier_id: supplierId || null,
    p_payment_method: paymentMethod || 'efectivo',
    p_payment_account_id: paymentAccountId || null,
    p_receipt_url: receiptUrl || null,
    p_no_receipt: !!noReceipt,
    // Idempotencia (0040): sin esto, un reintento ingresaba la mercaderia dos
    // veces y asentaba el gasto dos veces.
    p_client_request_id: claveDeIdempotencia(
      'compra', [tenantId, date || null, lineas, supplierId || null, paymentMethod || 'efectivo']),
  });

  if (error) {
    // Sin reiniciar la clave: un reintento por red caida tiene que llevar la
    // misma para no ingresar la mercaderia dos veces.
    console.error('registerPurchase:', error.message);
    const codigo = Object.keys(MENSAJES_COMPRA).find(c => error.message.includes(c));
    return { __error: codigo || 'db', message: MENSAJES_COMPRA[codigo] || error.message };
  }
  // La compra entro: la proxima es otra compra aunque repita proveedor e items.
  reiniciarClave('compra');
  return { ok: true, expenses: data || [] };
}
