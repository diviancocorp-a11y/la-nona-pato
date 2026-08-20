// src/services/platformPagos.js
// La conexión del negocio con MercadoPago (Etapa MP multi-tenant).
//
// TODO pasa por edge functions y NADA por la tabla. `payment_integrations`
// tiene RLS habilitada y cero policies a proposito (migracion 0051): el
// access_token no sale del servidor. Si mañana alguien agrega un
// `supabase.from('payment_integrations')` en el cliente, no va a fallar con un
// error claro — va a devolver vacio, que es peor. Por eso este archivo es el
// unico lugar del front que habla de pagos.
//
// Este archivo esta en PLATFORM_PATHS (scripts/check-supabase-columns.mjs).

import { supabase } from '../lib/supabase';
import { getTenantSlugSync } from '../lib/activeTenant';

async function invocar(fn, payload = {}) {
  const slug = getTenantSlugSync();
  if (!slug) return { __error: 'sin_tenant', message: 'No se pudo identificar el negocio.' };

  const { data, error } = await supabase.functions.invoke(fn, {
    body: { tenant_slug: slug, ...payload },
  });

  if (error) {
    // El cuerpo real de un FunctionsHttpError viene en error.context.
    let message = error.message || 'No se pudo conectar';
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      }
    } catch { /* empty */ }
    return { __error: 'fn', message };
  }
  if (data?.error) return { __error: 'fn', message: data.error };
  return data;
}

/**
 * Si el negocio puede cobrar con MercadoPago, y con que cuenta.
 * Nunca devuelve el access_token: no existe forma de pedirlo desde el front.
 */
export async function estadoMercadoPago() {
  const r = await invocar('mp-status');
  if (r.__error) return { conectado: false, error: r.message };
  return r;
}

/**
 * Conecta la cuenta del negocio.
 *
 * El token viaja una sola vez y no vuelve nunca. La funcion valida contra MP
 * que sea real y que sea de una cuenta argentina antes de guardarlo: un token
 * revocado dejaria el negocio "conectado" y sin cobrar, y eso se descubre
 * recien con el primer cliente esperando.
 */
export async function conectarMercadoPago({ accessToken, publicKey, webhookSecret }) {
  const r = await invocar('mp-connect', {
    access_token: accessToken,
    public_key: publicKey || null,
    webhook_secret: webhookSecret || null,
  });
  if (r.__error) return r;
  return { ok: true, cuenta: r.cuenta, aviso: r.aviso };
}

/**
 * El link de pago de un pedido.
 *
 * El importe NO se manda: lo saca la function de la base. Si viajara desde
 * acá, cualquiera podría pagar $1 un pedido de $20.000.
 */
export async function linkDePago(orderId) {
  const r = await invocar('mp-preference', { order_id: orderId });
  if (r.__error) return r;
  return { ok: true, url: r.init_point, liveMode: r.live_mode };
}
