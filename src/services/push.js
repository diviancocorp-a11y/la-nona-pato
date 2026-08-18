// src/services/push.js
// Web Push notifications.
//
// En el EDIFICIO cada suscripcion lleva ademas el negocio del host: sin eso,
// un local le mandaria notificaciones a los clientes de otro. Viaja el SLUG
// y no el uuid porque el slug ya esta en la URL — traducirlo a id habria
// pedido un RPC publico nuevo solo para eso.
//
// Suscripciones se asocian con:
//   - user_id (si esta logueado)
//   - phone (si es guest)
//   - role: 'customer' para el catalogo, 'admin' para el panel admin.
// La edge function send-push usa esto para targetear especificos vs broadcast.
import { supabase } from '../lib/supabase';
import business from '@business';
import { resolveTenantSlug } from '../lib/activeTenant';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

async function requestPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  return await Notification.requestPermission();
}

/**
 * Suscribe el browser actual a push notifications.
 * @param {Object} opts
 * @param {'customer'|'admin'} opts.role - quien se suscribe
 * @param {string|null} opts.userId - auth user id (logueado)
 * @param {string|null} opts.phone - phone (guest)
 */
export async function subscribeToPush({ role = 'customer', userId = null, phone = null } = {}) {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return null;

  const permission = await requestPushPermission();
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = subscription.toJSON();
  // RPC SECURITY DEFINER: solo toca la fila de ESTE endpoint.
  // El acceso directo a push_subscriptions se cerro en Sprint 1 (anon podia borrar todo).
  const args = {
    p_endpoint: subJson.endpoint,
    p_p256dh: subJson.keys?.p256dh || '',
    p_auth: subJson.keys?.auth || '',
    p_user_agent: navigator.userAgent,
    p_user_id: userId,
    p_phone: phone,
    p_role: role,
  };
  if (business?.platform) {
    const slug = await resolveTenantSlug();
    // Sin negocio no se guarda: una suscripcion suelta no le sirve a nadie y
    // el RPC del edificio la rechaza igual.
    if (!slug) { console.warn('push: no se pudo resolver el negocio'); return subscription; }
    args.p_tenant_slug = slug;
  }
  const { error } = await supabase.rpc('upsert_push_subscription', args);

  if (error) console.error('Push subscription save error:', error);
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint });
  }
}

export async function isSubscribed() {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  return !!(await registration.pushManager.getSubscription());
}

/**
 * Envia push notification via Edge Function.
 * @param {Object} payload
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {string} [payload.url]
 * @param {string} [payload.icon]
 * @param {Object} [payload.target] - { role?, user_id?, phone? }
 */
export async function sendPushNotification({ title, body, url, icon, target = { role: 'customer' } }) {
  const cuerpo = { title, body, url, icon, target };
  if (business?.platform) {
    const slug = await resolveTenantSlug();
    if (!slug) throw new Error('No se pudo resolver el negocio para el envio');
    cuerpo.tenant_slug = slug;
  }
  const { data, error } = await supabase.functions.invoke('send-push', { body: cuerpo });
  if (error) throw error;
  return data;
}


// Helper para mapear order.status -> push payload listo para sendPushNotification.
// Solo dispara para los 3 status que el cliente quiere saber.
// OJO: las keys deben ser los valores REALES de OrderStatus (lib/utils.jsx):
// preparing / active / completed. Antes decia ready/done (status inexistentes)
// y al cliente solo le llegaba el push de "cocina" — fix 12/jun.
const ORDER_STATUS_PUSH = {
  preparing: { title: 'Estamos preparando tu pedido 👩‍🍳', body: 'La cocina arrancó. Te avisamos cuando esté listo.' },
  active:    { title: '¡Tu pedido está listo! 🛵',          body: 'Sale en camino o ya podés pasar a buscarlo.' },
  completed: { title: 'Pedido entregado 💛',                body: 'Gracias por elegirnos. ¡Hasta la próxima!' },
};

/**
 * Notifica al cliente (por phone) el cambio de status. Fire-and-forget.
 */
export async function notifyOrderStatusChange(phone, status) {
  if (!phone || !ORDER_STATUS_PUSH[status]) return;
  try {
    const payload = ORDER_STATUS_PUSH[status];
    await sendPushNotification({ ...payload, url: '/mi-cuenta?tab=historial', target: { phone } });
  } catch (e) {
    console.warn('notifyOrderStatusChange (non-blocking):', e?.message);
  }
}

export async function getSubscriberCount(role = 'customer') {
  const args = { p_role: role };
  if (business?.platform) {
    const slug = await resolveTenantSlug();
    if (!slug) return 0;
    args.p_tenant_slug = slug;
  }
  const { data, error } = await supabase.rpc('count_push_subscriptions', args);
  if (error) return 0;
  return data || 0;
}
