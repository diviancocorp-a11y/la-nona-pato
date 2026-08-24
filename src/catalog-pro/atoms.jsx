// Catálogo Pro — átomos reutilizables. Portados del prototipo a módulo ESM.
// Todos asumen estar dentro de un contenedor .cp-root (para los tokens CSS).

import { useState } from "react";
import Icon from "./Icon";
import { fmtAR } from "./format";

// ── ProductPhoto — imagen con fallback a tone gradient + fade-in ──
// dim: atenua la foto (grayscale + opacity) para productos agotados.
export function ProductPhoto({ src, alt = "", tone = "var(--b3)", height = 120, radius = 10, ratio, dim = false }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <div style={{
      position: "relative", width: "100%",
      height: ratio ? undefined : height, aspectRatio: ratio,
      background: tone, borderRadius: radius, overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg, ${tone} 0%, color-mix(in oklab, ${tone} 70%, #000) 100%)`,
        opacity: err || !loaded ? 1 : 0, transition: "opacity 240ms ease",
      }} />
      {!err && src && (
        <img src={src} alt={alt}
          loading="lazy" decoding="async"
          onLoad={() => setLoaded(true)} onError={() => setErr(true)}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", opacity: loaded ? (dim ? 0.45 : 1) : 0,
            filter: dim ? "grayscale(0.8)" : "none",
            transition: "opacity 240ms ease",
          }} />
      )}
    </div>
  );
}

// ── SoldOutBadge — pill "Agotado" para overlay sobre la foto ──
export function SoldOutBadge({ compact = false }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: "color-mix(in oklab, var(--tx) 80%, transparent)", color: "var(--bg)",
      fontSize: compact ? 9 : 10, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", padding: compact ? "3px 7px" : "4px 9px",
      borderRadius: 4, backdropFilter: "blur(4px)",
    }}>Agotado</span>
  );
}

// ── PriceTag — precio AR + tachado opcional ──
export function PriceTag({ price, oldPrice, size = "md", tone = "var(--tx)" }) {
  const fs = size === "lg" ? 18 : size === "sm" ? 13 : 15;
  return (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: fs, color: tone, letterSpacing: "-0.005em" }}>
        {fmtAR(price)}
      </span>
      {oldPrice ? (
        <span style={{ fontSize: fs - 2, color: "var(--t3)", textDecoration: "line-through" }}>
          {fmtAR(oldPrice)}
        </span>
      ) : null}
    </div>
  );
}

// ── Rating — estrella amber + valor + count ──
export function Rating({ value, count, mode = "inline" }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--t2)" }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--ac)" aria-hidden="true">
        <path d="M12 2 14.5 8.5 21 9 16 14l1.5 7L12 17l-5.5 4L8 14 3 9l6.5-.5L12 2Z" />
      </svg>
      <span style={{ fontWeight: 600, color: "var(--tx)" }}>{Number(value || 0).toFixed(1)}</span>
      {count != null && mode === "inline" && <span style={{ color: "var(--t3)" }}>({count})</span>}
    </div>
  );
}

// ── StickyCart — barra dark fixed bottom con hint opcional ──
export function StickyCart({ count = 0, total = 0, label = "Ver pedido", onClick, hint }) {
  return (
    <div style={{ position: "fixed", left: 16, right: 16, bottom: 24, zIndex: 50, maxWidth: 460, margin: "0 auto" }}>
      {hint && (
        <div style={{
          background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12,
          padding: "8px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
          boxShadow: "var(--sh-sm)",
        }}>
          <Icon name="sparkle" size={13} style={{ color: "var(--ac)" }} />
          <div style={{ color: "var(--tx)", flex: 1, fontSize: 12 }}>{hint}</div>
        </div>
      )}
      <button onClick={onClick} style={{
        width: "100%", height: 60, background: "var(--tx)", color: "var(--bg)",
        borderRadius: 14, border: 0, display: "flex", alignItems: "center",
        padding: "0 18px", gap: 14, boxShadow: "var(--sh-md)", cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 999, background: "rgba(251,247,242,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 600,
        }}>{count}</div>
        <div style={{ flex: 1, textAlign: "left", fontWeight: 500, fontSize: 14 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{fmtAR(total)}</div>
      </button>
    </div>
  );
}

// ── BottomNav — 5 tabs ──
export function BottomNav({ active = "home", onChange }) {
  const tabs = [
    { id: "home", label: "Inicio", icon: "home" },
    { id: "search", label: "Buscar", icon: "search" },
    { id: "orders", label: "Pedidos", icon: "bag" },
    { id: "favs", label: "Favoritos", icon: "heart" },
    { id: "me", label: "Yo", icon: "user" },
  ];
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      background: "var(--bg)", borderTop: "1px solid var(--line)",
      padding: "8px 0 max(10px, env(safe-area-inset-bottom))",
      display: "grid", gridTemplateColumns: "repeat(5, 1fr)", zIndex: 40,
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange?.(t.id)} style={{
          background: "transparent", border: 0, padding: "6px 0", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          color: active === t.id ? "var(--tx)" : "var(--t3)", fontFamily: "var(--font-body)",
        }}>
          <Icon name={t.icon} size={20} stroke={active === t.id ? 2 : 1.5} />
          <span style={{ fontSize: 10, fontWeight: active === t.id ? 600 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── SectionHeader — kicker + title display con em italic + action ──
export function SectionHeader({ kicker, title, action, onAction, em }) {
  return (
    <div style={{ padding: "22px 22px 22px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <div>
        {kicker && <div className="caption" style={{ color: "var(--ac)", marginBottom: 4 }}>{kicker}</div>}
        <h2 className="h-2" style={{ margin: 0 }}>
          {title}
          {em && <em style={{ fontStyle: "italic", color: "var(--ac)" }}> {em}</em>}
        </h2>
      </div>
      {action && (
        <button onClick={onAction} style={{
          background: "transparent", border: 0, color: "var(--t2)",
          fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          fontFamily: "var(--font-body)",
        }}>
          {action} <Icon name="chevron-right" size={14} />
        </button>
      )}
    </div>
  );
}

// ── Stepper — pill round − valor + ──
export function Stepper({ value, onChange, size = "md" }) {
  const h = size === "sm" ? 28 : size === "lg" ? 44 : 36;
  const w = h;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      border: "1px solid var(--line)", borderRadius: 999, overflow: "hidden", background: "var(--bg)",
    }}>
      <button onClick={() => onChange(Math.max(0, value - 1))} style={{
        width: w, height: h, border: 0, background: "transparent", color: "var(--t2)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><Icon name="minus" size={size === "sm" ? 12 : 14} /></button>
      <div style={{ minWidth: 24, textAlign: "center", fontWeight: 600, fontSize: size === "sm" ? 12 : 14 }}>{value}</div>
      <button onClick={() => onChange(value + 1)} style={{
        width: w, height: h, border: 0, background: "transparent", color: "var(--tx)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}><Icon name="plus" size={size === "sm" ? 12 : 14} /></button>
    </div>
  );
}

// ── AddRound — botón circular + (dark o amber). disabled = producto agotado ──
export function AddRound({ size = 32, onClick, dark = true, disabled = false }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      aria-label={disabled ? "Producto agotado" : "Agregar al carrito"} style={{
      width: size, height: size, borderRadius: 999,
      background: disabled ? "var(--b3)" : (dark ? "var(--tx)" : "var(--ac)"),
      color: disabled ? "var(--t3)" : (dark ? "var(--bg)" : "#fff"),
      border: dark ? "2px solid var(--bg)" : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : "0 2px 6px rgba(0,0,0,0.12)",
      opacity: disabled ? 0.7 : 1,
    }}><Icon name="plus" size={size < 32 ? 12 : 14} stroke={2} /></button>
  );
}

// ── TagChip — pill uppercase ──
export function TagChip({ children, tone = "neutral" }) {
  const styles = {
    neutral: { bg: "var(--b2)", fg: "var(--t2)" },
    new: { bg: "color-mix(in oklab, var(--ac) 12%, transparent)", fg: "var(--ac)" },
    off: { bg: "color-mix(in oklab, var(--err) 12%, transparent)", fg: "var(--err)" },
    ok: { bg: "color-mix(in oklab, var(--ok) 14%, transparent)", fg: "var(--ok)" },
  };
  const s = styles[tone] || styles.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      height: 22, padding: "0 9px", borderRadius: 6,
      background: s.bg, color: s.fg,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{children}</span>
  );
}

/**
 * Props para que un `div` que abre algo se comporte como un boton de verdad.
 *
 * POR QUE EXISTE
 * Las tarjetas de la carta eran `<div onClick>`: con el mouse abren el detalle
 * del producto, con el teclado no existen. Un `div` sin `role` ni `tabIndex` no
 * lo alcanza el Tab y un lector de pantalla no lo anuncia, asi que quien navega
 * con teclado podia AGREGAR al carrito —ese si es un `<button>`— pero no abrir
 * el producto para leer la descripcion ni las aclaraciones.
 *
 * Space se previene ademas de manejarse: en un `div` focusable, la barra
 * espaciadora scrollea la pagina, y sin el `preventDefault` la carta se va
 * saltando mientras se intenta abrir un producto.
 *
 * Se usa en las cuatro tarjetas del catalogo (HomeScreen y CategoryScreen) en
 * vez de repetir cuatro veces lo mismo: cuatro copias son cuatro formas de que
 * una quede distinta.
 */
export function abrible(onOpen, etiqueta) {
  if (!onOpen) return {};
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": etiqueta,
    onClick: onOpen,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}
