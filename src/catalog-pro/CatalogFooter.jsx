// src/catalog-pro/CatalogFooter.jsx
// Footer corporativo del catálogo público.
//
// Estructura:
//   1. Bloque del NEGOCIO (cliente de Dico): FAQ, T&C, cookies,
//      libro de quejas, contacto, trabajá con nosotros.
//   2. Banda Dico (logo + CTA "para tu negocio") — pequeño y claro
//      de que es la plataforma, no el negocio.

import { useState } from "react";
import HermesMark from "../components/HermesMark";

// Datos de contacto de Dico (la plataforma). Mientras sean null, los botones
// de contacto del modal "para tu negocio" NO se muestran — antes habia un
// WhatsApp falso (5491100000000) en produccion. Ver TAREAS-MANUALES.md.
const HERMES = {
  whatsapp: null,   // ej: "5491122334455" (solo digitos, con 54 9)
  email: null,      // ej: "hola@hermesgastro.com"
  instagram: null,  // ej: "hermesgastro"
};

const DEFENSA_CONSUMIDOR_AR = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";

// Convierte un hex (#RGB o #RRGGBB) a rgba con alpha dado. Si falla, devuelve fallback.
function hexToRgba(hex, alpha, fallback = "rgba(245,158,11,0.06)") {
  if (!hex || typeof hex !== "string") return fallback;
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function bizCopy(biz) {
  const bizName = biz?.biz_name || "el negocio";
  return {
    terms: `Estos términos rigen el uso del catálogo público de ${bizName}.

Al hacer un pedido aceptás que tus datos (nombre, teléfono, dirección, email) se usen para procesar tu compra y mantener contacto comercial con ${bizName}. No se ceden a terceros con fines publicitarios.

${bizName} es responsable por la calidad, entrega y condiciones del producto/servicio ofrecido. Para reclamos contactanos por WhatsApp o email.

La plataforma técnica del catálogo está provista por Divianco, que actúa como proveedor de infraestructura y no es parte de la relación comercial entre vos y ${bizName}.

Última actualización: 2026`,

    cookies: `${bizName} usa cookies y almacenamiento local del navegador para:
· Recordar tu carrito y datos de contacto entre visitas.
· Mantener tu sesión activa cuando volvés a la página.
· Estadísticas anónimas de uso para mejorar el servicio.

No usamos cookies de terceros para publicidad dirigida. No vendemos tu información.

Podés borrar las cookies desde la configuración de tu navegador en cualquier momento.`,

    faq: [
      { q: "¿Cómo hago un pedido?", a: "Elegí los productos del catálogo, sumalos al carrito y completá tus datos en el checkout. Te llega un resumen por WhatsApp." },
      { q: "¿Cómo pago?", a: `Los métodos disponibles en ${bizName} aparecen en el checkout (efectivo, transferencia, MercadoPago, tarjeta — según corresponda).` },
      { q: "¿Cuánto tarda mi pedido?", a: "El tiempo estimado depende del tipo de pedido. Te avisamos cuando entra a preparación y cuando sale." },
      { q: "¿Puedo cancelar un pedido?", a: "Sí, hasta que entre a preparación. Después contactanos por WhatsApp para coordinar." },
      { q: "¿Mis datos están seguros?", a: "Sí. Los datos personales no se ceden a terceros y se usan solo para procesar tu pedido." },
      { q: "¿Tengo que registrarme?", a: "No. Completás tus datos en el primer pedido y la próxima vez te reconocemos automáticamente." },
    ],

    worksWithUs: `${bizName} busca sumar gente al equipo. Si te interesa trabajar con nosotros, contactanos por WhatsApp o email y contanos tu experiencia.`,

    // Politica de privacidad — Ley 25.326 de Proteccion de Datos Personales (AR)
    privacy: `POLÍTICA DE PRIVACIDAD — ${bizName}

1. Qué datos recolectamos
Para procesar tu pedido guardamos: nombre, teléfono, email (opcional), dirección de entrega (solo pedidos con envío) y el historial de tus pedidos.

2. Para qué los usamos
· Procesar y entregarte tu pedido.
· Contactarte por WhatsApp o email sobre el estado del pedido.
· Avisarte de promociones de ${bizName} (podés pedir que no, en cualquier momento).
Nunca vendemos ni cedemos tus datos a terceros con fines publicitarios.

3. Dónde se guardan
Los datos se almacenan en servidores seguros (Supabase) con acceso restringido al personal autorizado de ${bizName}.

4. Tus derechos (Ley 25.326)
Podés pedir acceso, rectificación o eliminación de tus datos contactando a ${bizName} por WhatsApp o email. La Agencia de Acceso a la Información Pública (www.argentina.gob.ar/aaip) es el órgano de control de la Ley 25.326 y atiende denuncias por incumplimiento.

5. Plataforma
La infraestructura técnica está provista por Divianco, que procesa los datos únicamente por cuenta y orden de ${bizName}.

Última actualización: 2026`,
  };
}

const HERMES_BUSINESS_COPY = `Dico es la plataforma todo-en-uno para tu local gastronómico. Catálogo público, gestión de pedidos, stock, gastos, recetas, reportes USAR P&L y mucho más. Sin instalaciones, sin servidores, sin dolor de cabeza.

Escribinos por WhatsApp o email y agendamos una demo gratuita para tu negocio.`;

function Modal({ title, children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          maxHeight: "85vh", overflowY: "auto",
          background: "var(--b2, #1A1A1A)", color: "var(--tx, #F4EAD0)",
          borderRadius: 18, padding: "22px 22px 18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          border: "1px solid var(--line, rgba(255,255,255,0.08))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 400 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            style={{
              width: 32, height: 32, borderRadius: 999,
              background: "transparent", border: "1px solid var(--line)",
              color: "var(--t2)", cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--t2, #B5A98E)", whiteSpace: "pre-line" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FaqList({ items }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width: "100%", padding: "12px 14px",
                background: "transparent", border: 0, color: "var(--tx)",
                fontFamily: "inherit", fontSize: 13, fontWeight: 700, textAlign: "left",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span>{item.q}</span>
              <span style={{ color: "var(--ac, #F59E0B)", fontWeight: 800 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 14px 14px", fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5 }}>
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CatalogFooter({ settings = {} }) {
  const [modal, setModal] = useState(null);
  const year = new Date().getFullYear();
  const open = (k) => setModal(k);
  const close = () => setModal(null);
  const copy = bizCopy(settings);

  const bizName = settings.biz_name || "Negocio";
  const bizWhatsapp = (settings.whatsapp || "").replace(/\D/g, "");
  const bizInstagram = settings.instagram || "";
  const bizFacebook = settings.facebook || "";
  const bizTiktok = settings.tiktok || "";
  const bizYoutube = settings.youtube || "";
  const bizTwitter = settings.twitter || "";
  const bizLinkedin = settings.linkedin || "";
  // Color de marca del tenant — si no está, cae al ámbar de Dico
  const accentColor = settings.logo_color || "#F59E0B";

  return (
    <>
      <footer
        style={{
          marginTop: 32,
          padding: "40px 22px 24px",
          background: hexToRgba(accentColor, 0.08, "rgba(245,158,11,0.05)"),
          color: "var(--tx, #2D1B0E)",
          borderTop: `2px solid ${hexToRgba(accentColor, 0.35, "rgba(245,158,11,0.25)")}`,
        }}
      >
        {/* ─── HERO CIRCULAR (logo grande + redes) ─── */}
        <CircularHero
          logoUrl={settings.logo_url}
          bizName={bizName}
          logoLetter={settings.logo_letter || bizName.charAt(0)}
          logoColor={settings.logo_color || accentColor}
          accentColor={accentColor}
          socials={[
            { key: "wp", url: bizWhatsapp ? `https://wa.me/${bizWhatsapp}` : null, label: "WhatsApp", svg: <SvgWp /> },
            { key: "ig", url: bizInstagram ? `https://instagram.com/${bizInstagram}` : null, label: "Instagram", svg: <SvgIg /> },
            { key: "fb", url: bizFacebook ? `https://facebook.com/${bizFacebook}` : null, label: "Facebook", svg: <SvgFb /> },
            { key: "tt", url: bizTiktok ? `https://tiktok.com/@${bizTiktok}` : null, label: "TikTok", svg: <SvgTt /> },
            { key: "yt", url: bizYoutube ? (bizYoutube.startsWith("@") ? `https://youtube.com/${bizYoutube}` : `https://youtube.com/channel/${bizYoutube}`) : null, label: "YouTube", svg: <SvgYt /> },
            { key: "x", url: bizTwitter ? `https://x.com/${bizTwitter}` : null, label: "X", svg: <SvgX /> },
            { key: "in", url: bizLinkedin ? `https://linkedin.com/${bizLinkedin}` : null, label: "LinkedIn", svg: <SvgIn /> },
          ]}
        />

        {/* ─── BLOQUE DEL NEGOCIO ─── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 22, marginBottom: 28, marginTop: 36,
        }}>
          <FooterCol title="Legal" items={[
            { label: "Términos y condiciones", onClick: () => open("terms") },
            { label: "Política de privacidad", onClick: () => open("privacy") },
            { label: "Política de cookies", onClick: () => open("cookies") },
            { label: "Libro de quejas", href: DEFENSA_CONSUMIDOR_AR, external: true },
          ]} />

          <FooterCol title="Ayuda" items={[
            { label: "Preguntas frecuentes", onClick: () => open("faq") },
          ]} />

          <FooterCol title={bizName} items={[
            { label: "Trabajá con nosotros", onClick: () => open("worksWithUs") },
          ]} />

          <FooterCol title="Contacto" items={[
            ...(bizWhatsapp ? [{ label: "WhatsApp", href: `https://wa.me/${bizWhatsapp}`, external: true }] : []),
            ...(bizInstagram ? [{ label: "Instagram", href: `https://instagram.com/${bizInstagram}`, external: true }] : []),
            ...(bizFacebook ? [{ label: "Facebook", href: `https://facebook.com/${bizFacebook}`, external: true }] : []),
            ...(bizTiktok ? [{ label: "TikTok", href: `https://tiktok.com/@${bizTiktok}`, external: true }] : []),
            ...(bizYoutube ? [{ label: "YouTube", href: bizYoutube.startsWith("@") ? `https://youtube.com/${bizYoutube}` : `https://youtube.com/channel/${bizYoutube}`, external: true }] : []),
            ...(bizTwitter ? [{ label: "X / Twitter", href: `https://x.com/${bizTwitter}`, external: true }] : []),
            ...(bizLinkedin ? [{ label: "LinkedIn", href: `https://linkedin.com/${bizLinkedin}`, external: true }] : []),
          ]} />
        </div>

        {/* Copyright del negocio */}
        <div style={{
          paddingTop: 14, paddingBottom: 22,
          borderTop: "1px solid var(--line)",
          fontSize: 10.5, color: "var(--t3)", letterSpacing: "0.04em",
          textAlign: "center",
        }}>
          © {year} {bizName}. Todos los derechos reservados.
        </div>

        {/* ─── BANDA HERMES (plataforma) ─── */}
        <div
          onClick={() => open("forBusiness")}
          style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 16px",
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.20)",
            borderRadius: 14,
            cursor: "pointer",
          }}
        >
          {/* Logo de Dico a la izquierda, fondo claro */}
          <div style={{ flexShrink: 0 }}>
            <HermesMark as="logo" size={56} fallback="H" theme="light" color="#000" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx, #2D1B0E)", lineHeight: 1.3 }}>
              ¿Tenés un negocio? Dico para tu local
            </div>
            <div style={{ fontSize: 11, color: "var(--t2, #5B5552)", marginTop: 2, lineHeight: 1.35 }}>
              Catálogo, pedidos, stock, recetas y reportes. Tocá para conocer más.
            </div>
          </div>
          <div style={{ color: "#F59E0B", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>→</div>
        </div>
      </footer>

      {/* ─── MODALES ─── */}
      {modal === "terms" && <Modal title="Términos y condiciones" onClose={close}>{copy.terms}</Modal>}
      {modal === "privacy" && <Modal title="Política de privacidad" onClose={close}>{copy.privacy}</Modal>}
      {modal === "cookies" && <Modal title="Política de cookies" onClose={close}>{copy.cookies}</Modal>}
      {modal === "faq" && <Modal title="Preguntas frecuentes" onClose={close}><FaqList items={copy.faq} /></Modal>}
      {modal === "worksWithUs" && <Modal title="Trabajá con nosotros" onClose={close}>{copy.worksWithUs}</Modal>}
      {modal === "forBusiness" && (
        <Modal title="Dico para tu negocio" onClose={close}>
          <div style={{ whiteSpace: "pre-line", marginBottom: 18 }}>{HERMES_BUSINESS_COPY}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {HERMES.whatsapp && (
              <a
                href={`https://wa.me/${HERMES.whatsapp}?text=${encodeURIComponent("Hola! Tengo un local gastronómico y me interesa Dico.")}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  padding: "12px 16px", background: "#25D366", color: "#fff",
                  borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 14,
                  textAlign: "center", display: "block",
                }}
              >📱 Hablar por WhatsApp</a>
            )}
            {HERMES.email && (
              <a
                href={`mailto:${HERMES.email}?subject=${encodeURIComponent("Dico para mi negocio")}`}
                style={{
                  padding: "12px 16px", background: "#F59E0B", color: "#000",
                  borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 14,
                  textAlign: "center", display: "block",
                }}
              >📧 Enviar email</a>
            )}
            {!HERMES.whatsapp && !HERMES.email && (
              <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center" }}>
                Datos de contacto disponibles próximamente.
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function FooterCol({ title, items, accent = "#F59E0B" }) {
  if (!items?.length) return null;
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em",
        textTransform: "uppercase", color: accent, marginBottom: 10,
      }}>
        {title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <li key={i}>
            {it.href ? (
              <a
                href={it.href}
                target={it.external ? "_blank" : undefined}
                rel={it.external ? "noopener noreferrer" : undefined}
                style={{ color: "var(--t2)", textDecoration: "none", fontSize: 12.5, display: "inline-block", lineHeight: 1.4 }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--tx)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--t2)"}
              >
                {it.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={it.onClick}
                style={{
                  background: "transparent", border: 0, padding: 0,
                  color: "var(--t2)", fontSize: 12.5, lineHeight: 1.4,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--tx)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--t2)"}
              >
                {it.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============ HERO CIRCULAR (logo grande + redes) ============
// Mantiene el bloque legal/ayuda/contacto debajo (sigue existiendo).
// Aqui solo va el bloque hero visual: logo en burbuja + circulos de redes.
function CircularHero({ logoUrl, bizName, logoLetter, logoColor, accentColor, socials = [] }) {
  const activeSocials = socials.filter(s => s.url);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* Logo en burbuja (el arco "GRACIAS POR VISITARNOS" vive en el
          WelcomeSplash — aca se veia enorme y lo saco a pedido del user) */}
      <div style={{
        width: 96, height: 96, borderRadius: 999,
        background: hexToRgba(accentColor, 0.15, "rgba(245,158,11,0.12)"),
        padding: 8, display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          width: "100%", height: "100%", borderRadius: 999,
          background: logoColor || accentColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", color: "#fff",
          fontFamily: "var(--font-heading, 'DM Serif Display', serif)", fontSize: 38,
        }}>
          {logoUrl ? (
            <img src={logoUrl} alt={bizName} loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (logoLetter || "").toUpperCase()}
        </div>
      </div>

      {/* Circulos de redes */}
      {activeSocials.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {activeSocials.map(s => (
            <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.label}
              style={{
                width: 40, height: 40, borderRadius: 999,
                border: `1px solid ${hexToRgba(accentColor, 0.35, "rgba(245,158,11,0.3)")}`,
                background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--tx, #2D1B0E)", textDecoration: "none",
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = hexToRgba(accentColor, 0.15, "rgba(245,158,11,0.12)"); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {s.svg}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ SVG ICONS de redes ============
const S = 18;
function SvgWp() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 22h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26C2.166 6.65 6.6 2.215 12.054 2.215c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.893-9.885 9.893" />
    </svg>
  );
}
function SvgIg() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function SvgFb() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06c0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7c4.78-.75 8.44-4.9 8.44-9.9 0-5.53-4.5-10.02-10-10.02z" />
    </svg>
  );
}
function SvgTt() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.96a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.39z" />
    </svg>
  );
}
function SvgYt() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1.1 1.9 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.9-1.1 2.1-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
    </svg>
  );
}
function SvgX() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function SvgIn() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.21 0 22.23 0z" />
    </svg>
  );
}
