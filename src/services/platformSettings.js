// src/services/platformSettings.js
// Configuracion del negocio en el edificio (tabla `settings`, migracion 0025).
//
// OJO: `settings` existe en las DOS bases con columnas distintas. La legacy
// tiene `id`, `store_name` y `app_url`; esta tiene `tenant_id` y no tiene esas
// tres. Por eso este archivo esta en PLATFORM_PATHS
// (scripts/check-supabase-columns.mjs): sin eso, el pre-commit validaria estas
// consultas contra el schema equivocado.
//
// Igual que en platformAdmin.js: RLS decide QUE PODES ver, el filtro por
// tenant_id decide QUE ESTAS MIRANDO. Hacen falta los dos.
//
// La tabla es la fuente de verdad. Un trigger espeja las claves del catalogo
// a `tenants.settings` para que get_catalog y submit-order sigan andando sin
// cambios — NO escribir ese jsonb a mano, se pisa en el proximo guardado.

import { supabase } from '../lib/supabase';

// Columnas que el panel puede escribir. Lista blanca explicita: evita mandar
// tenant_id o updated_at en un patch, y deja el punto unico donde se agrega
// una config nueva.
export const CAMPOS_EDITABLES = [
  // Identidad y marca
  'biz_name', 'logo_letter', 'logo_color', 'logo_url', 'favicon_url',
  'cover_url', 'og_image_url', 'slogan', 'banner_text', 'banner_color',
  'catalog_font', 'catalog_theme',
  // Redes
  'whatsapp', 'instagram', 'facebook', 'tiktok', 'linkedin', 'twitter', 'youtube',
  // Local y horarios
  'store_open', 'store_hours', 'show_hours_on_catalog', 'has_physical_store',
  'store_address', 'prep_time_min', 'delivery_time_min',
  // Catalogo
  'min_order_amount', 'hidden_cats', 'cat_names', 'cat_images', 'cat_groups',
  'daily_deals', 'deal_pct',
  // Cobro y envio
  'payment_methods', 'catalog_payment_methods', 'payment_accounts', 'delivery_pricing',
  // Cupones
  'coupon_default_pct', 'birthday_coupon_pct',
  // Costos proyectados y categorias internas
  'waste_pct', 'expense_pct', 'usar_targets', 'exp_cats', 'ing_cats',
];

// Literal a proposito, y no ['tenant_id', ...CAMPOS_EDITABLES].join(', '):
// check-supabase-columns.mjs solo lee `.select('...')` con string literal. Una
// lista armada en runtime lo hace saltear el archivo entero y el check pasa
// sin haber validado nada — un verde que miente es peor que un rojo.
// Que no se separe de CAMPOS_EDITABLES lo cuida un test (settings.test.js),
// mismo patron que los slugs reservados y los estados de pedido.
const COLS = 'tenant_id, biz_name, logo_letter, logo_color, logo_url, favicon_url, cover_url, og_image_url, slogan, banner_text, banner_color, catalog_font, catalog_theme, whatsapp, instagram, facebook, tiktok, linkedin, twitter, youtube, store_open, store_hours, show_hours_on_catalog, has_physical_store, store_address, prep_time_min, delivery_time_min, min_order_amount, hidden_cats, cat_names, cat_images, cat_groups, daily_deals, deal_pct, payment_methods, catalog_payment_methods, payment_accounts, delivery_pricing, coupon_default_pct, birthday_coupon_pct, waste_pct, expense_pct, usar_targets, exp_cats, ing_cats, updated_at';

export { COLS as SELECT_COLS };

export const TEMAS_CATALOGO = ['ambar', 'noche', 'carbon'];

function exigirTenant(tenantId, quien) {
  if (!tenantId) throw new Error(`${quien}: falta tenantId`);
}

/**
 * Identidad visible de un tenant, SIN sesion (RPC publico get_tenant_brand,
 * migracion 0027). Es lo que necesitan las pantallas que se muestran antes de
 * loguearse: el login y el titulo de la pestania.
 *
 * No usa fetchSettings porque esa tabla tiene RLS por tenant y sin sesion no
 * devuelve nada — que es justo como el login termino mostrando la marca del
 * build para todos los tenants.
 */
export async function fetchTenantBrand(slug) {
  if (!slug) return null;
  const { data, error } = await supabase.rpc('get_tenant_brand', { p_slug: slug });
  if (error) { console.error('fetchTenantBrand:', error.message); return null; }
  return data || null;
}

/**
 * La config del tenant. Siempre hay fila: la crea un trigger al dar de alta el
 * tenant (0025), asi que un null aca es un error real y no un tenant nuevo.
 */
export async function fetchSettings(tenantId) {
  exigirTenant(tenantId, 'fetchSettings');
  const { data, error } = await supabase
    .from('settings')
    .select(COLS)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) { console.error('fetchSettings:', error.message); return null; }
  return data;
}

/**
 * Valida lo que se va a guardar. Devuelve array de errores (vacio = ok).
 * Solo lo que puede romper el catalogo si entra mal; el resto es texto libre.
 */
export function validateSettings(patch) {
  const errs = [];

  if (patch.catalog_theme != null && !TEMAS_CATALOGO.includes(patch.catalog_theme)) {
    errs.push(`Tema invalido: ${patch.catalog_theme}`);
  }
  // logo_color es hex LIBRE — no confundir con catalog_theme, que esta acotado.
  if (patch.logo_color != null && patch.logo_color !== '' && !/^#[0-9a-f]{6}$/i.test(patch.logo_color)) {
    errs.push('El color de marca tiene que ser un hex tipo #RRGGBB');
  }

  for (const campo of ['waste_pct', 'expense_pct', 'deal_pct', 'coupon_default_pct', 'birthday_coupon_pct']) {
    const v = patch[campo];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) errs.push(`${campo} tiene que estar entre 0 y 100`);
  }

  for (const campo of ['min_order_amount', 'prep_time_min', 'delivery_time_min']) {
    const v = patch[campo];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) errs.push(`${campo} no puede ser negativo`);
  }

  if (patch.delivery_pricing != null && !Array.isArray(patch.delivery_pricing)) {
    errs.push('delivery_pricing tiene que ser una lista de escalones');
  }
  if (patch.payment_accounts != null && !Array.isArray(patch.payment_accounts)) {
    errs.push('payment_accounts tiene que ser una lista de cuentas');
  }

  return errs;
}

/** Descarta lo que no esta en la lista blanca y normaliza '' -> null. */
function limpiarPatch(patch) {
  const out = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (!(campo in patch)) continue;
    const v = patch[campo];
    out[campo] = v === '' ? null : v;
  }
  return out;
}

/**
 * Guarda un patch parcial. Solo toca los campos que vienen: dos pantallas de
 * config distintas pueden guardar sin pisarse.
 */
export async function saveSettings(tenantId, patch) {
  exigirTenant(tenantId, 'saveSettings');

  const errs = validateSettings(patch);
  if (errs.length) return { __error: 'validation', message: errs.join('. ') };

  const limpio = limpiarPatch(patch);
  if (Object.keys(limpio).length === 0) {
    return { __error: 'validation', message: 'No hay nada para guardar' };
  }

  const { data, error } = await supabase
    .from('settings')
    .update(limpio)
    .eq('tenant_id', tenantId)
    .select(COLS)
    .single();

  if (error) {
    console.error('saveSettings:', error.message);
    return { __error: 'db', message: error.message };
  }
  return data;
}
