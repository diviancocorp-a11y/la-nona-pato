// src/services/signup.js
// Alta self-service de un negocio en la plataforma.
//
// El flujo esta partido en dos porque la confirmacion de email esta activada
// y auth.signUp() NO devuelve sesion:
//
//   registrarNegocio()  -> crea el auth user con los datos del negocio en
//                          user_metadata. NO crea el tenant todavia.
//   [el usuario confirma desde el mail, quiza en otro dispositivo]
//   crearTenantPendiente() -> ya con sesion, dispara signup_tenant(), que lee
//                          ese metadata server-side y crea tenant+owner+profile.
//
// Los datos viajan en user_metadata y no en localStorage justamente porque el
// mail se puede abrir en otro equipo, donde localStorage no existe.

import { supabase } from '../lib/supabase';

/** true si el slug esta libre Y es valido segun el server. */
export async function slugDisponible(slug) {
  const { data, error } = await supabase.rpc('slug_available', { p_slug: slug });
  if (error) {
    console.error('slug_available:', error.message);
    return null; // null = no se pudo verificar (distinto de "ocupado")
  }
  return data === true;
}

/**
 * Paso 1: crea la cuenta. El tenant se crea recien tras confirmar el email.
 * @returns {{ ok: boolean, needsConfirmation?: boolean, error?: string }}
 */
export async function registrarNegocio({ email, password, bizName, vertical, slug, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        biz_name: bizName,
        vertical,
        slug: String(slug || '').toLowerCase(),
        full_name: fullName || null,
      },
      // Vuelve SIEMPRE a la raiz: el tenant todavia no existe, asi que su
      // subdominio no resolveria a nada.
      emailRedirectTo: `${window.location.origin}/bienvenido`,
    },
  });

  if (error) return { ok: false, error: traducirError(error.message) };

  // Con confirmacion activada no hay sesion: hay que esperar el mail.
  return { ok: true, needsConfirmation: !data.session };
}

/**
 * Paso 2: con sesion activa, crea el tenant desde el metadata del usuario.
 * @returns {{ ok: boolean, slug?: string, error?: string }}
 */
export async function crearTenantPendiente() {
  const { data, error } = await supabase.rpc('signup_tenant');
  if (error) return { ok: false, error: traducirError(error.message) };
  return { ok: true, slug: data?.slug, vertical: data?.vertical, tenantId: data?.tenant_id };
}

/** URL final del negocio ya creado. */
export function urlDelNegocio(slug) {
  const host = window.location.hostname;
  // En local/preview no hay wildcard: se queda donde esta.
  if (!host.endsWith('divianco.app')) return `${window.location.origin}/`;
  return `https://${slug}.divianco.app/`;
}

/** Mensajes de Supabase/Postgres -> castellano entendible. */
function traducirError(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Ya existe una cuenta con ese email. Probá iniciar sesión.';
  }
  if (m.includes('password') && m.includes('6')) return 'La contraseña necesita al menos 6 caracteres.';
  if (m.includes('invalid') && m.includes('email')) return 'Ese email no parece válido.';
  if (m.includes('esta cuenta ya tiene un negocio')) return 'Esta cuenta ya tiene un negocio creado.';
  if (m.includes('no esta disponible')) return 'Esa dirección se ocupó mientras completabas el registro. Elegí otra.';
  if (m.includes('confirma tu email')) return 'Confirmá tu email antes de continuar.';
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Demasiados intentos. Esperá unos minutos.';
  }
  return msg || 'Algo falló. Intentá de nuevo.';
}
