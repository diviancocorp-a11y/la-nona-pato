import React from 'react';

// ─── ICONS ──────────────────────────────────────────────────────────
const Ic = ({ d, size = 20, color = "currentColor", d2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
);

export const Icon = {
  home: p => <Ic {...p} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  box: p => <Ic {...p} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />,
  recipe: p => <Ic {...p} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />,
  dollar: p => <Ic {...p} d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  cart: p => <Ic {...p} d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />,
  plus: p => <Ic {...p} d="M12 5v14M5 12h14" />,
  minus: p => <Ic {...p} d="M5 12h14" />,
  trash: p => <Ic {...p} d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />,
  edit: p => <Ic {...p} d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />,
  alert: p => <Ic {...p} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />,
  back: p => <Ic {...p} d="M19 12H5M12 19l-7-7 7-7" />,
  check: p => <Ic {...p} d="M20 6L9 17l-5-5" />,
  search: p => <Ic {...p} d="M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35" />,
  settings: p => <Ic {...p} d="M12 15a3 3 0 100-6 3 3 0 000 6z" d2="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />,
  truck: p => <Ic {...p} d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
  x: p => <Ic {...p} d="M18 6L6 18M6 6l12 12" />,
  orders: p => <Ic {...p} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
  eye: p => <Ic {...p} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" d2="M12 9a3 3 0 100 6 3 3 0 000-6z" />,
  eyeOff: p => <Ic {...p} d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 01-4.24-4.24M1 1l22 22" />,
  fire: p => <Ic {...p} d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1012 0c0-1.532-1.056-3.94-2-5-1.786 3-2 2-4 2z" />,
  zap: p => <Ic {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
  hist: p => <Ic {...p} d="M3 3v5h5M3.05 13A9 9 0 1 0 5 5.3L3 8" />,
  store: p => <Ic {...p} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  mail: p => <Ic {...p} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" />,
  phone: p => <Ic {...p} d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />,
  user: p => <Ic {...p} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" />,
  map: p => <Ic {...p} d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z" />,
  globe: p => <Ic {...p} d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />,
  chart: p => <Ic {...p} d="M18 20V10M12 20V4M6 20v-6" />,
  download: p => <Ic {...p} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  bell: p => <Ic {...p} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />,
};

// ─── CONSTANTS & HELPERS ────────────────────────────────────────────
export const formatMoney = (n) => typeof n === "number" ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
export const formatInt = (n) => typeof n === "number" ? n.toLocaleString("es-AR") : "0";
// Cantidades de receta (kg/lt/uni): recorta el ruido de float (ej: la
// calculadora por tanda genera 0.0072499999999999995 al dividir) y limita a
// pocos decimales para no contaminar la vista. Mas decimales para cantidades
// chicas, menos para grandes.
export const formatQty = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num === 0) return "0";
  const abs = Math.abs(num);
  const dp = abs >= 1 ? 2 : abs >= 0.1 ? 3 : 5;
  return num.toLocaleString("es-AR", { maximumFractionDigits: dp });
};
export const todayISO = () => new Date().toISOString().split("T")[0];
// 8 caracteres de azar, no 4. Con 4 hay ~1,68M combinaciones y cien ids
// generados en el mismo milisegundo colisionan con ~0,3% de probabilidad —lo
// suficiente para que el test de unicidad fallara solo cada tantas corridas y
// bloqueara commits al azar—. Con 8 la probabilidad baja a ~2e-9. Mismo
// formato base36, solo mas largo.
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
// Código corto unificado para pedidos y recibos: #XXXXXX (últimos 6 chars del ID sin guiones)
export const formatOrderCode = (id) => { const s = String(id || "").replace(/-/g, ""); return "#" + s.slice(-6).toUpperCase(); };

// ─── Telefono → E.164 Argentina para WhatsApp ───────────────────────
// Bug: el cliente carga su numero sin codigo de pais (ej "3814123456") y al
// hacer solo replace(/\D/g,'') el link wa.me quedaba sin 54 → WhatsApp lo
// interpretaba como US (+1) y "no existe". Esto normaliza a 549 + numero.
// Devuelve solo digitos (sin +), o null si no hay nada usable.
export function waPhoneAr(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);          // prefijo internacional
  if (d.startsWith("54")) {                        // ya trae codigo de pais AR
    let rest = d.slice(2);
    if (rest.startsWith("0")) rest = rest.slice(1);
    if (!rest.startsWith("9")) rest = "9" + rest;  // 9 de movil que suele faltar
    return "54" + rest;
  }
  if (d.startsWith("0")) d = d.slice(1);           // 0 de larga distancia nacional
  if (d.startsWith("9") && d.length >= 11) return "54" + d; // ya trae el 9 de movil
  return "549" + d;
}

// Link wa.me listo para abrir. null si no hay telefono.
export const waLink = (raw) => { const p = waPhoneAr(raw); return p ? `https://wa.me/${p}` : null; };

// ─── Supabase Storage image transform ───────────────────────────────
// Convierte una URL pública de Supabase Storage a la variante con resize.
// Ej: .../object/public/bucket/path → .../render/image/public/bucket/path?width=300&quality=75
//
// NOTE: Image Transformations require Supabase Pro plan. If not available,
// the render endpoint returns errors. We detect this at runtime and fall back
// to serving original URLs directly.

// Default to false (disabled) — image transforms require Supabase Pro plan.
// Call probeImageTransforms() to auto-detect.
let _transformsAvailable = false;

/** Test if Supabase image transforms are available (Pro plan feature). */
export async function probeImageTransforms(sampleUrl) {
  if (_transformsAvailable !== null) return _transformsAvailable;
  if (!sampleUrl || !sampleUrl.includes('/storage/v1/object/public/')) {
    _transformsAvailable = false;
    return false;
  }
  try {
    const testUrl = sampleUrl.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + '?width=1&quality=1';
    const res = await fetch(testUrl, { method: 'HEAD', mode: 'no-cors' }).catch(() => null);
    // If we get any non-error response or an opaque response (no-cors), try it.
    // But if it clearly 4xx/5xx, disable transforms.
    if (res && res.status >= 400) {
      _transformsAvailable = false;
    } else {
      // no-cors gives opaque response (status 0) — assume transforms MAY work;
      // we'll still fall back per-image via onError handlers.
      _transformsAvailable = true;
    }
  } catch {
    _transformsAvailable = false;
  }
  return _transformsAvailable;
}

/** Force-disable image transforms (called when a render URL fails at runtime). */
export function disableImageTransforms() {
  _transformsAvailable = false;
}

/** Reset transforms state to untested (for testing). */
export function resetImageTransforms() {
  _transformsAvailable = null;
}

export const optimizeImage = (url, { width, height, quality = 75, format } = {}) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('/storage/v1/object/public/')) return url;
  if (_transformsAvailable !== true && _transformsAvailable !== null) return url;
  let out = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const params = [];
  if (width) params.push(`width=${width}`);
  if (height) params.push(`height=${height}`);
  params.push(`quality=${quality}`);
  // Supabase Image Transformation soporta format=avif|webp|origin
  // Por default Supabase autodetecta el mejor formato vía Accept header.
  // Pasar explícitamente solo cuando el caller lo requiere.
  if (format) params.push(`format=${format}`);
  return out + '?' + params.join('&');
};

/** Convert a render/image URL back to the original object/public URL. */
export const originalImageUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('/storage/v1/render/image/public/')) return url;
  return url.replace('/storage/v1/render/image/public/', '/storage/v1/object/public/').split('?')[0];
};

// ─── Order status — single source of truth ─────────────────────────
// Keys are SCREAMING_SNAKE; values are the literal strings stored in DB.
// The values are also what the realtime payload, Zod schemas, and edge
// functions speak. Never invent shortened aliases ('prep', 'done', ...).
export const OrderStatus = Object.freeze({
  NEW:       "new",
  PREPARING: "preparing",
  ACTIVE:    "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});
/** Lifecycle subsets — use these instead of inline string arrays. */
export const ACTIVE_ORDER_STATUSES   = [OrderStatus.NEW, OrderStatus.PREPARING, OrderStatus.ACTIVE];

export const OrderStatusLabels = {
  [OrderStatus.NEW]:       "Nuevo",
  [OrderStatus.PREPARING]: "En preparación",
  [OrderStatus.ACTIVE]:    "Activo",
  [OrderStatus.COMPLETED]: "Completado",
  [OrderStatus.CANCELLED]: "Cancelado",
};
export const OrderStatusColors = {
  [OrderStatus.NEW]:       { bg: "#E3F2FD", tx: "#1565C0" },
  [OrderStatus.PREPARING]: { bg: "#FFF8E1", tx: "#8D6E00" },
  [OrderStatus.ACTIVE]:    { bg: "#E8F5E9", tx: "#3A7D44" },
  [OrderStatus.COMPLETED]: { bg: "#F3EDE4", tx: "#9C8B7A" },
  [OrderStatus.CANCELLED]: { bg: "#FFEBEE", tx: "#C62828" },
};
export const OrderStatusBorders = {
  [OrderStatus.NEW]:       "#1565C0",
  [OrderStatus.PREPARING]: "#D4A017",
  [OrderStatus.ACTIVE]:    "#3A7D44",
  [OrderStatus.COMPLETED]: "#9C8B7A",
  [OrderStatus.CANCELLED]: "#C62828",
};

export const COLORS = [{ h: "#C45D3E" }, { h: "#5D7A2E" }, { h: "#2E5D7A" }, { h: "#7A2E4A" }, { h: "#C49A3E" }, { h: "#2D1B0E" }, { h: "#6B3FA0" }, { h: "#2E7A6B" }];

export function playNotificationSound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1108, 1318].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(.3, c.currentTime + i * .12);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + i * .12 + .4);
      o.start(c.currentTime + i * .12);
      o.stop(c.currentTime + i * .12 + .4);
    });
  } catch { }
}

// Deprecated short aliases (I, fi, fm, td, uid, ST, ST_L, ST_C, ST_B,
// saleCode, imgOpt, playNotif) were removed in the FASE 1 cleanup. Use
// the full names directly: Icon, formatInt, formatMoney, todayISO,
// generateId, OrderStatus, OrderStatusLabels, OrderStatusColors,
// OrderStatusBorders, formatOrderCode, optimizeImage, playNotificationSound.
