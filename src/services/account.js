// src/services/account.js
// La cuenta del COMPRADOR en el catalogo: perfil, direcciones, favoritos e
// historial de pedidos. ETAPA 5b.
//
// Bifurca por `business.platform` igual que fetchCatalog (services/catalog.js):
// es el patron del lado del catalogo, donde no hay un panel que inyecte
// savers. El camino legacy queda EXACTAMENTE como estaba.
//
// Lo que cambia entre las dos bases es poco y siempre lo mismo:
//   - favoritos: `recipe_id` sobre `recipes` (legacy) vs `product_id` sobre
//     `products` (edificio, donde la receta ES el producto — Etapa 2)
//   - pedidos: `date`/`customer` (legacy) vs `created_at`/`customer_name`
// Se traduce ACA, en el borde, para que las pantallas del catalogo no tengan
// que saber contra que base estan.
//
// Este archivo consulta las dos bases, asi que NO va en PLATFORM_PATHS: el
// validador de columnas lo mide contra el legacy, y las consultas del
// edificio usan constantes que resuelve igual. Si alguna vez falla, es
// senal de que conviene partirlo en dos.

import { supabase } from '../lib/supabase';
import business from '@business';

const esPlataforma = () => business?.platform === true;

/* ─────────────────── Carga inicial de la cuenta ─────────────────── */

/**
 * Perfil + direcciones + favoritos de un usuario logueado.
 *
 * Devuelve SIEMPRE las tres claves aunque alguna consulta falle: el llamador
 * (AuthContext) pisa su estado con esto, y un undefined ahi dejaria la
 * pantalla mostrando los datos del usuario anterior.
 */
export async function fetchUserData(userId) {
  if (!userId) return { profile: null, addresses: [], favorites: [] };

  const colFav = esPlataforma() ? 'product_id' : 'recipe_id';

  const [profRes, addrRes, favRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('addresses').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('favorites').select(colFav).eq('user_id', userId),
  ]);

  if (profRes.error) console.warn('perfil:', profRes.error.message);
  if (addrRes.error) console.warn('direcciones:', addrRes.error.message);
  if (favRes.error) console.warn('favoritos:', favRes.error.message);

  return {
    profile: profRes.data || null,
    addresses: addrRes.data || [],
    favorites: (favRes.data || []).map(f => f[colFav]),
  };
}

/* ─────────────────────────── Perfil ─────────────────────────────── */

export async function updateProfile(userId, data) {
  if (!userId) return false;
  // upsert y no update: en el edificio el comprador se registra en el
  // catalogo y NO tiene fila de profiles todavia (la de 0008 solo la creaba
  // provision_owner, para duenos). Con update, guardar su nombre no hacia
  // nada y no avisaba.
  const fila = { ...data, id: userId, updated_at: new Date().toISOString() };
  const { error } = esPlataforma()
    ? await supabase.from('profiles').upsert(fila)
    : await supabase.from('profiles').update({ ...data, updated_at: fila.updated_at }).eq('id', userId);
  if (error) { console.error('updateProfile:', error.message); return false; }
  return true;
}

/* ───────────────────────── Direcciones ──────────────────────────── */

export async function addAddress(userId, addr) {
  if (!userId) return null;
  const { data, error } = await supabase.from('addresses').insert({
    user_id: userId,
    label: addr.label || 'Casa',
    address: addr.address,
    lat: addr.lat || null,
    lng: addr.lng || null,
    notes: addr.notes || null,
  }).select().single();
  if (error) { console.error('addAddress:', error.message); return null; }
  return data;
}

export async function removeAddress(userId, id) {
  if (!userId) return false;
  // El .eq('user_id') es redundante con la RLS y se deja igual: si algun dia
  // la policy se afloja, este filtro sigue impidiendo borrar lo ajeno.
  const { error } = await supabase.from('addresses').delete().eq('id', id).eq('user_id', userId);
  return !error;
}

export async function updateAddress(userId, id, data) {
  if (!userId) return false;
  const { error } = await supabase.from('addresses').update(data).eq('id', id).eq('user_id', userId);
  return !error;
}

/* ────────────────────────── Favoritos ───────────────────────────── */

/** @param esFav estado ACTUAL: true = estaba marcado y hay que sacarlo. */
export async function toggleFavorite(userId, itemId, esFav) {
  if (!userId) return false;
  const col = esPlataforma() ? 'product_id' : 'recipe_id';
  const { error } = esFav
    ? await supabase.from('favorites').delete().eq('user_id', userId).eq(col, itemId)
    : await supabase.from('favorites').insert({ user_id: userId, [col]: itemId });
  if (error) { console.error('toggleFavorite:', error.message); return false; }
  return true;
}

/**
 * Los productos favoritos, con el shape que muestra la pantalla
 * (`sale_price`, el nombre del legacy).
 */
export async function fetchFavoriteProducts(ids) {
  if (!ids?.length) return [];
  if (esPlataforma()) {
    const { data, error } = await supabase
      .from('products').select('id, name, price, image_url, category').in('id', ids);
    if (error) { console.error('favoritos:', error.message); return []; }
    return (data || []).map(p => ({ ...p, sale_price: p.price }));
  }
  const { data, error } = await supabase
    .from('recipes').select('id, name, sale_price, image_url, category').in('id', ids);
  if (error) { console.error('favoritos:', error.message); return []; }
  return data || [];
}

/* ───────────────────────── Historial ────────────────────────────── */

/**
 * Pedidos del comprador. Con cuenta se resuelven por `user_id` y la RLS
 * (0035); sin cuenta, por telefono.
 *
 * OJO — en el edificio el historial POR TELEFONO devuelve vacio a proposito.
 * El legacy lo resuelve con un RPC SECURITY DEFINER que matchea el telefono,
 * o sea que cualquiera que escriba un numero ajeno ve esos pedidos. En un
 * negocio solo es un riesgo acotado; en una plataforma con muchos locales es
 * el mismo agujero multiplicado. Portarlo tal cual seria heredar la decision
 * sin tomarla: queda anotado en el PLAN-ERP para resolverlo a proposito.
 */
export async function fetchOrderHistory({ user, phone }) {
  if (!user) {
    if (!phone || esPlataforma()) return [];
    const { data } = await supabase.rpc('get_phone_customer_orders', { phone_search: phone });
    return data || [];
  }

  if (esPlataforma()) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, total, status, delivery, payment, customer_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('historial:', error.message); return []; }
    // Al shape del legacy: la pantalla ya cae a created_at si no hay date.
    return (data || []).map(o => ({ ...o, customer: o.customer_name }));
  }

  const { data } = await supabase
    .from('orders')
    .select('id, date, total, status, created_at, delivery, payment, customer')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}
