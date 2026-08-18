// src/pages/InfoPage.jsx
// Renderiza una pagina informativa desde info_pages (tabla DB).
// Soporta age_gate (modal +18) la primera vez que el user abre la pagina.
// Bloques soportados: hero, rule, footer_legal.
//
// Ruta: /info/:slug
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AgeGate from "../catalog-pro/AgeGate";
import { fetchPublicInfoPage } from "../services/infoPages";

export default function InfoPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gatePassed, setGatePassed] = useState(() => {
    try { return !!localStorage.getItem(`hg_age_18_${slug}`); } catch { return false; }
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Via services/infoPages: en el edificio la pagina se pide por RPC con
    // el slug del negocio (el visitante no tiene sesion ni tenant_id).
    fetchPublicInfoPage(slug).then((data) => {
      if (!alive) return;
      setPage(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [slug]);

  const onGateConfirm = () => {
    try { localStorage.setItem(`hg_age_18_${slug}`, "1"); } catch { /* empty */ }
    setGatePassed(true);
  };

  if (loading) {
    return (
      <div className="cp-root cp-surface" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--t3)", fontSize: 15 }}>Cargando...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="cp-root cp-surface" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>404</div>
        <p style={{ color: "var(--t2)", fontSize: 15 }}>No encontramos esta pagina.</p>
      </div>
    );
  }

  if (page.requires_age_gate && !gatePassed) {
    return <AgeGate onConfirm={onGateConfirm} title={page.title} />;
  }

  return (
    <div className="cp-root cp-surface" style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 80px" }}>
        <h1 style={{ fontFamily: "var(--font-heading, 'DM Serif Display', serif)", fontSize: 30, lineHeight: 1.15, margin: "0 0 24px", color: "var(--tx)" }}>
          {page.title}
        </h1>
        {(page.blocks || []).map((b, i) => <Block key={i} block={b} />)}
      </div>
    </div>
  );
}

// ── Block renderer ────────────────────────────────────
function Block({ block }) {
  if (!block || !block.type) return null;
  if (block.type === "hero") return <HeroBlock {...block} />;
  if (block.type === "rule") return <RuleBlock {...block} />;
  if (block.type === "footer_legal") return <FooterLegal body={block.body} />;
  return null;
}

function HeroBlock({ emoji, title, body }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {emoji && <div style={{ fontSize: 32, marginBottom: 8 }}>{emoji}</div>}
      <h2 style={{ fontFamily: "var(--font-heading, 'DM Serif Display', serif)", fontSize: 22, margin: "0 0 12px", color: "var(--tx)", lineHeight: 1.25 }}>{title}</h2>
      <p style={{ fontSize: 15, color: "var(--t2)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-line" }}>{body}</p>
    </div>
  );
}

function RuleBlock({ emoji, tag, title, body, items, callout }) {
  return (
    <section style={{ marginBottom: 32, padding: "20px 18px", background: "var(--b2)", borderRadius: 16, border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {emoji && <span style={{ fontSize: 22 }}>{emoji}</span>}
        {tag && <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ac)", background: "var(--bg)", padding: "4px 9px", borderRadius: 999 }}>{tag}</span>}
      </div>
      <h3 style={{ fontFamily: "var(--font-heading, 'DM Serif Display', serif)", fontSize: 19, margin: "0 0 10px", color: "var(--tx)", lineHeight: 1.25 }}>{title}</h3>
      {body && <p style={{ fontSize: 14.5, color: "var(--t2)", lineHeight: 1.6, margin: "0 0 14px", whiteSpace: "pre-line" }}>{body}</p>}
      {Array.isArray(items) && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 12 }}>
          {items.map((it, i) => (
            <li key={i} style={{ padding: "12px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--line)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>{it.title}</div>
              <div style={{ fontSize: 13.5, color: "var(--t2)", lineHeight: 1.55 }}>{it.body}</div>
            </li>
          ))}
        </ul>
      )}
      {callout && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--yl, #FFF8E1)", borderLeft: "3px solid var(--yw, #E0A800)", borderRadius: 8, fontSize: 13.5, lineHeight: 1.55, color: "var(--yw, #8D6E00)" }}>
          {callout}
        </div>
      )}
    </section>
  );
}

function FooterLegal({ body }) {
  return (
    <footer style={{ marginTop: 28, padding: "16px 14px", borderTop: "1px solid var(--line)", fontSize: 11.5, color: "var(--t3)", lineHeight: 1.5, textAlign: "center" }}>
      {body}
    </footer>
  );
}
