// src/catalog-pro/PromoCarousel.jsx
// Carrusel de promos (galeria circular: card 4/5, reveal clip-path circle
// desde las burbujas-thumbnail). El slide de RANKING muestra el leaderboard
// COMPLETO dentro del card (podio con avatares/coronas/columnas + lista +
// fila con la posicion real del cliente). El boton "Saber mas" abre solo la
// explicacion de como funciona. Sin GSAP/Tailwind: CSS + tokens.
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGuestUser } from "../lib/guestUser.js";
import { useWeeklyTop, useMyRanking } from "./useTopCustomers";
import { Avatar } from "../lib/avatars.jsx";
import useMediaQuery from "../lib/useMediaQuery";

const AUTO_PLAY_MS = 4500;
const TOUCH_HOLD_MS = 15000; // si alguien toco, esta leyendo: pausa larga
const REVEAL_MS = 650;
const DOT_SIZE = 30;
const DOT_GAP = 10;
const DOT_BOTTOM = 20;

/* ---------- Corona (oro / plata / bronce) ---------- */
function Crown({ color = "#E8A33D", size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M3 8 L7.5 12 L12 5 L16.5 12 L21 8 L19 18 Q12 20 5 18 Z" />
    </svg>
  );
}
const CROWN_COLORS = { 1: "#E8A33D", 2: "#9CA3AF", 3: "#B0763B" };

/* ---------- Rango de la semana actual (lunes a domingo, es-AR) ---------- */
function weekRangeLabel() {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = (d) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${f(mon)} - ${f(sun)}`;
}

/* Fila de la lista (sobre fondo oscuro del card) */
function LeaderRow({ pos, name, pts, mine, placeholder }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "18px 18px 30px 1fr auto",
      alignItems: "center", gap: 9, padding: "9px 12px",
      background: mine ? "color-mix(in srgb, var(--ac, #D97706) 22%, transparent)" : "transparent",
      borderRadius: mine ? 12 : 0,
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{pos ?? "—"}</span>
      <span style={{ display: "flex", alignItems: "center" }}>
        {pos && pos <= 3 ? <Crown color={CROWN_COLORS[pos]} /> : <span style={{ width: 14 }} />}
      </span>
      <span style={{
        width: 30, height: 30, borderRadius: 999,
        background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12.5, fontWeight: 800,
      }}>{(name || "?").charAt(0).toUpperCase()}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: "block", fontSize: 13, fontWeight: 700, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{name}</span>
        {placeholder && (
          <span style={{ display: "block", fontSize: 10.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>{placeholder}</span>
        )}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fff" }}>
        {pts !== null ? `${pts} pts` : ""}
      </span>
    </div>
  );
}

/* ---------- Leaderboard completo (vive DENTRO del card del carrusel) ---------- */
function RankingBoard({ top }) {
  const { user, profile, session } = useAuth();
  const guest = useGuestUser();
  const myEmail = user?.email || guest?.email || "";
  const myPhone = profile?.phone || guest?.phone || "";
  const isIdentified = !!(myEmail || myPhone);
  const { ranking } = useMyRanking({ email: myEmail, phone: myPhone });

  const podium = top.slice(0, 3);
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean); // 2 | 1 | 3
  const colHeight = { 1: 64, 2: 46, 3: 38 };
  const colBg = { 1: "#E8B23D", 2: "#6B6B66", 3: "#A06A33" };

  const myFirstRaw = session?.firstName || (profile?.name || guest?.name || "").trim().split(/\s+/)[0];
  const myName = myFirstRaw || "Vos";
  const myPos = ranking?.my_position ?? null;
  const showMyRow = myPos === null || myPos > 3;

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      justifyContent: "flex-end", padding: "0 16px",
      paddingBottom: DOT_BOTTOM + DOT_SIZE + 58, // deja lugar para CTA + burbujas
      paddingTop: 54,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
        {weekRangeLabel()} · los lunes premiamos al podio
      </div>

      {/* Podio: avatar + corona + nombre + pts + columna */}
      {podiumOrder.length > 0 && (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, marginBottom: 12 }}>
          {podiumOrder.map((row) => {
            const pos = row.rank_position ?? row.position;
            const isFirst = pos === 1;
            return (
              <div key={pos} style={{ flex: 1, maxWidth: 104, textAlign: "center" }}>
                <div style={{ position: "relative", display: "inline-block", marginBottom: 5 }}>
                  <div style={{
                    width: isFirst ? 54 : 42, height: isFirst ? 54 : 42, borderRadius: 999,
                    overflow: "hidden", border: "2px solid rgba(255,255,255,0.85)", background: "#fff",
                  }}>
                    <Avatar name={row.display_name} avatarKey={row.avatar_key} size={isFirst ? 50 : 38} />
                  </div>
                  <span style={{
                    position: "absolute", bottom: -3, right: -5,
                    width: 18, height: 18, borderRadius: 999, background: "#1a1611",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Crown color={CROWN_COLORS[pos]} size={10} />
                  </span>
                </div>
                <div style={{
                  fontSize: 11.5, fontWeight: 700, color: "#fff",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{row.display_name}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>{row.points} pts</div>
                <div style={{
                  height: colHeight[pos], borderRadius: "10px 10px 0 0", background: colBg[pos],
                  display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 7,
                  color: "#fff", fontSize: 17, fontWeight: 800,
                  fontFamily: "var(--font-heading, serif)",
                }}>{pos}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lista: posicion · corona · inicial · nombre · puntos + fila del cliente */}
      <div style={{
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, overflow: "hidden",
      }}>
        {top.slice(0, 3).map((row, i) => {
          const pos = row.rank_position ?? row.position;
          return (
            <div key={pos} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)" }}>
              <LeaderRow pos={pos} name={row.display_name + (myPos === pos ? " (vos)" : "")} pts={row.points} mine={myPos === pos} />
            </div>
          );
        })}
        {showMyRow && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: 3 }}>
            {ranking ? (
              <LeaderRow pos={myPos} name={myName} pts={ranking.my_points} mine
                placeholder={ranking.points_to_top5 > 0 ? `Te faltan ${ranking.points_to_top5} pts para el top 5` : "¡Estás en el top 5!"} />
            ) : (
              <LeaderRow pos={null} name={myName} pts={null} mine
                placeholder={isIdentified ? "Todavía sin puntos — tu próximo pedido te suma" : "Hacé tu primer pedido y entrás al ranking"} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Modal "Saber mas": solo la explicacion ---------- */
function HowItWorksModal({ onClose }) {
  return (
    <div className="cp-root" onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 8000,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "cp-promo-fade 250ms ease both",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 380,
        background: "var(--bg, #FBF7F2)", borderRadius: 22,
        border: "1px solid var(--line, #E8DFD2)", padding: "22px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        animation: "cp-promo-pop 350ms cubic-bezier(0.34,1.56,0.64,1) both",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <h2 style={{ fontFamily: "var(--font-heading, 'DM Serif Display', serif)", fontSize: 21, margin: 0, color: "var(--tx, #2D2418)" }}>
            ¿Cómo funciona?
          </h2>
          <button onClick={onClose} aria-label="Cerrar" style={{
            width: 32, height: 32, borderRadius: 99, border: "none", flexShrink: 0,
            background: "var(--b2, #F4EDE3)", color: "var(--t2, #8A7A66)",
            fontSize: 15, cursor: "pointer", lineHeight: 1,
          }}>✕</button>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--t2, #8A7A66)", lineHeight: 1.6, margin: 0 }}>
          Cada <strong style={{ color: "var(--tx, #2D2418)" }}>$10.000 en pedidos suma 1 punto</strong>.
          La semana corre de lunes a domingo y arranca de cero cada lunes, cuando premiamos
          al podio de la semana anterior. No hace falta registrarse: con tu primer pedido
          ya estás compitiendo.
        </p>
        <button onClick={onClose} style={{
          marginTop: 16, width: "100%", padding: "11px 0", borderRadius: 99, border: "none",
          background: "var(--ac, #D97706)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>¡A sumar puntos!</button>
      </div>
    </div>
  );
}

/* ---------- Fondo de gradientes animados (adaptacion del
   BackgroundGradientAnimation de aceternity, sin Tailwind: blobs radiales
   con mix-blend-mode + keyframes CSS, colores derivados del acento) ---------- */
function GradientBackdrop() {
  const blob = (color, anim, origin, opacity = 1) => (
    <div aria-hidden style={{
      position: "absolute", width: "80%", height: "80%",
      top: "10%", left: "10%", borderRadius: "50%",
      background: `radial-gradient(circle at center, ${color} 0, transparent 50%)`,
      mixBlendMode: "hard-light", transformOrigin: origin, opacity,
      animation: anim,
    }} />
  );
  return (
    <div style={{
      position: "absolute", inset: 0, overflow: "hidden",
      background: "linear-gradient(40deg, color-mix(in srgb, var(--ac, #D97706) 40%, #14100c), #14100c)",
    }}>
      <div style={{ position: "absolute", inset: 0, filter: "blur(36px)" }}>
        {blob("color-mix(in srgb, var(--ac, #D97706) 85%, transparent)", "cp-pcg-vert 30s ease infinite", "center center")}
        {blob("rgba(232, 93, 117, 0.7)", "cp-pcg-circle 20s reverse infinite", "calc(50% - 200px)")}
        {blob("rgba(242, 193, 78, 0.7)", "cp-pcg-circle 40s linear infinite", "calc(50% + 200px)")}
        {blob("rgba(160, 106, 51, 0.75)", "cp-pcg-horiz 40s ease infinite", "calc(50% - 100px)", 0.7)}
        {blob("color-mix(in srgb, var(--ac, #D97706) 65%, #fff)", "cp-pcg-circle 24s ease infinite", "calc(50% - 300px) calc(50% + 300px)", 0.8)}
      </div>
    </div>
  );
}

/* ---------- Visual de un slide: fondo animado + emoji ---------- */
function SlideVisual({ slide }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <GradientBackdrop />
      {!slide.board && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 120, filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.35))" }} aria-hidden>
            {slide.emoji}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Carrusel circular ---------- */
export default function PromoCarousel({ onOpenAccount }) {
  const { top, loading: topLoading } = useWeeklyTop();
  const [showHelp, setShowHelp] = useState(false);

  const slides = [];
  if (topLoading || top.length > 0) {
    slides.push({
      id: "ranking", emoji: "🏆", label: "Ranking semanal",
      board: true, // leaderboard adentro del card
      cta: "Saber más", onCta: () => setShowHelp(true),
    });
  }
  slides.push({
    id: "cumple", emoji: "🎂", label: "Regalo de cumple",
    desc: "Contanos tu fecha de nacimiento y tu cumple llega con regalo.",
    cta: "Completar mi perfil", onCta: () => onOpenAccount?.(),
  });
  slides.push({
    id: "programados", emoji: "📅", label: "Pedidos programados",
    desc: "Elegí día y horario en el checkout. Tu pedido sale justo a tiempo.",
  });
  const len = slides.length;

  const [base, setBase] = useState(0);
  const [incoming, setIncoming] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const busy = incoming !== null;
  const pauseUntil = useRef(0);

  const goTo = useCallback((index) => {
    setIncoming((cur) => (cur !== null ? cur : index));
  }, []);

  useEffect(() => {
    if (incoming === null) return;
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setRevealed(true)); });
    const t = setTimeout(() => {
      setBase(incoming);
      setIncoming(null);
      setRevealed(false);
    }, REVEAL_MS + 80);
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); clearTimeout(t); };
  }, [incoming]);

  const next = useCallback(() => goTo((base + 1) % len), [base, len, goTo]);
  // Toco algo = esta mirando/analizando → pausa larga, renovable con cada toque
  const holdAutoplay = () => { pauseUntil.current = Date.now() + TOUCH_HOLD_MS; };
  const userGo = (fn) => { holdAutoplay(); fn(); };

  // El CSS de mas abajo apagaba las transiciones con reduced motion, pero el
  // carrusel SEGUIA avanzando solo cada 4,5s: contenido que se actualiza sin
  // que el usuario pueda pararlo, que es justo lo que WCAG 2.2.2 pide evitar.
  //
  // Y de paso arregla un nondeterminismo real del gate: el avance es un
  // `setInterval`, o sea un timer de JS que el harness no puede congelar —el
  // mismo caso que el verbo rotante del home—, asi que dos corridas del MISMO
  // commit podian fotografiar el carrusel con la capa de transicion montada o
  // sin ella. Los pixeles daban identicos y el DOM no.
  const menosMovimiento = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (len < 2 || menosMovimiento) return;
    const t = setInterval(() => {
      if (busy || showHelp || hovering || Date.now() < pauseUntil.current) return;
      next();
    }, AUTO_PLAY_MS);
    return () => clearInterval(t);
  }, [len, busy, showHelp, hovering, next, menosMovimiento]);

  if (len === 0) return null;
  const active = incoming ?? base;
  const slide = slides[active];

  const dotOffset = (i) => (i - (len - 1) / 2) * (DOT_SIZE + DOT_GAP);
  const clipFrom = (i) =>
    `circle(${DOT_SIZE / 2}px at calc(50% + ${dotOffset(i)}px) calc(100% - ${DOT_BOTTOM + DOT_SIZE / 2}px))`;
  const clipFull = `circle(140% at 50% 50%)`;

  // Capa de un slide: fondo animado (+leaderboard si es el ranking)
  const renderLayer = (s) => (
    <>
      <SlideVisual slide={s} />
      {s.board && (
        <>
          {/* velo suave: el board lee bien y los blobs siguen vivos atras */}
          <div style={{ position: "absolute", inset: 0, background: "rgba(16,13,10,0.45)" }} />
          <RankingBoard top={top} />
        </>
      )}
    </>
  );

  return (
    <div style={{ padding: "18px 16px 26px", display: "flex", justifyContent: "center" }}>
      <div className="cp-pcg-card"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onTouchStart={holdAutoplay}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          {renderLayer(slides[base])}
        </div>

        {incoming !== null && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 5,
            clipPath: revealed ? clipFull : clipFrom(incoming),
            WebkitClipPath: revealed ? clipFull : clipFrom(incoming),
            transition: `clip-path ${REVEAL_MS}ms cubic-bezier(0.5, 0, 0.15, 1), -webkit-clip-path ${REVEAL_MS}ms cubic-bezier(0.5, 0, 0.15, 1)`,
          }}>
            {renderLayer(slides[incoming])}
          </div>
        )}

        {/* Velo inferior solo para slides con texto sobre foto */}
        {!slide.board && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
            background: "linear-gradient(180deg, rgba(0,0,0,0.35), transparent 32%, transparent 50%, rgba(0,0,0,0.72))",
          }} />
        )}

        <div key={slide.id} style={{
          position: "absolute", left: 18, right: 18, top: 16, zIndex: 20,
          animation: "cp-pcg-rise 450ms ease both",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.92)", color: "#1a1611",
            padding: "5px 13px", borderRadius: 999,
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em",
          }}>
            <span aria-hidden>{slide.emoji}</span> {active + 1} • {slide.label}
          </div>
        </div>

        <div key={slide.id + "-b"} style={{
          position: "absolute", left: 18, right: 18, zIndex: 20,
          bottom: DOT_BOTTOM + DOT_SIZE + 14,
          animation: "cp-pcg-rise 450ms ease 80ms both",
        }}>
          {slide.desc && (
            <p style={{
              color: "#fff", fontSize: 19, lineHeight: 1.3, margin: "0 0 10px",
              letterSpacing: "-0.01em", textShadow: "0 2px 10px rgba(0,0,0,0.5)", maxWidth: 340,
            }}>{slide.desc}</p>
          )}
          {slide.cta && (
            <button onClick={() => { holdAutoplay(); slide.onCta?.(); }} style={{
              padding: "9px 18px", borderRadius: 999, border: "none",
              background: "#fff", color: "#1a1611", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>{slide.cta} →</button>
          )}
        </div>

        <div style={{
          position: "absolute", bottom: DOT_BOTTOM, left: 0, right: 0, zIndex: 30,
          display: "flex", justifyContent: "center", gap: DOT_GAP,
        }}>
          {slides.map((s, i) => {
            const isActive = i === active;
            return (
              <button key={s.id} onClick={() => !busy && userGo(() => goTo(i))}
                aria-label={s.label} disabled={busy}
                style={{
                  width: DOT_SIZE, height: DOT_SIZE, borderRadius: 999, padding: 0,
                  overflow: "hidden", cursor: busy ? "default" : "pointer",
                  border: isActive ? "2px solid #fff" : "2px solid rgba(255,255,255,0.55)",
                  boxShadow: isActive ? "0 0 0 2px rgba(255,255,255,0.25), 0 4px 12px rgba(0,0,0,0.35)" : "0 2px 8px rgba(0,0,0,0.3)",
                  transform: isActive ? "scale(1.18)" : "scale(1)",
                  transition: "transform 300ms ease, border-color 300ms ease, box-shadow 300ms ease",
                  background: "transparent",
                }}>
                <div style={{ width: "100%", height: "100%" }}>
                  <div style={{ width: "100%", height: "100%", background: "color-mix(in srgb, var(--ac, #D97706) 70%, #1a1611)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }} aria-hidden>{s.emoji}</div>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {showHelp && <HowItWorksModal onClose={() => setShowHelp(false)} />}

      <style>{`
        .cp-pcg-card {
          position: relative; width: 100%; max-width: 440px;
          /* isolation: los z-index internos (badge, burbujas, CTA) quedan
             contenidos en el card y nunca superan al header sticky del home */
          isolation: isolate; z-index: 0;
          /* No pintar/animar fuera de pantalla: los blobs con blur son caros
             en el WebView de Instagram (jank de scroll) */
          content-visibility: auto;
          contain-intrinsic-size: 440px 640px;
          /* min-height fijo: el leaderboard (podio + 4 filas + CTA + burbujas)
             necesita ~600px de alto sin importar el ancho del telefono */
          aspect-ratio: 4 / 5; min-height: 610px;
          overflow: hidden; border-radius: 20px;
          background: #1a1611;
          box-shadow: 0 2.8px 2.2px rgba(0,0,0,0.02), 0 6.7px 5.3px rgba(0,0,0,0.028),
            0 12.5px 10px rgba(0,0,0,0.035), 0 22.3px 17.9px rgba(0,0,0,0.042),
            0 41.8px 33.4px rgba(0,0,0,0.05), 0 100px 80px rgba(0,0,0,0.07);
        }
        @keyframes cp-pcg-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        /* keyframes de los blobs (adaptados del BackgroundGradientAnimation) */
        @keyframes cp-pcg-vert {
          0% { transform: translateY(-50%); }
          50% { transform: translateY(50%); }
          100% { transform: translateY(-50%); }
        }
        @keyframes cp-pcg-horiz {
          0% { transform: translateX(-50%) translateY(-10%); }
          50% { transform: translateX(50%) translateY(10%); }
          100% { transform: translateX(-50%) translateY(-10%); }
        }
        @keyframes cp-pcg-circle {
          0% { transform: rotate(0deg); }
          50% { transform: rotate(180deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes cp-promo-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cp-promo-pop { from { opacity: 0; transform: scale(0.9) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .cp-pcg-card * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  );
}
