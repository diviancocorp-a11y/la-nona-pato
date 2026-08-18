// src/pages/admin/InfoPages.jsx
// Gestion de paginas informativas (12/jun 2026, v2 simplificada).
//
// Pensado para usuarios BASICOS: el caso real es "le pedi el texto a una
// IA y lo pego". Por eso el editor es: titulo + UN solo cuadro de texto.
// Sin bloques visibles, sin campos de emoji (si quieren emojis los
// escriben en el texto y listo).
//
// El texto pegado se convierte automaticamente al formato blocks[] que ya
// renderiza InfoPage.jsx (hero / rule / footer_legal — cero migracion):
//   · Lineas "## Titulo" (o "# ") → nueva seccion con titulo
//   · Lineas "- punto" o "* punto" o "1. punto" → lista de puntos
//   · Lineas "> nota" → recuadro destacado
//   · Lineas "--- texto" → nota legal al pie
//   · Todo lo demas → parrafos
// Las IA ya devuelven ese formato (markdown), asi que pegar "tal cual"
// funciona sin que el usuario sepa que existen las convenciones.
//
// Se usa de dos formas:
//   · Operacion → Paginas informativas (overlay): embedded
//   · Ruta /admin/paginas (compat con links viejos): standalone
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import useAdminGate from "../../hooks/useAdminGate";
import AccessDenied from "../../components/admin/AccessDenied";
import { fetchInfoPages, saveInfoPage, deleteInfoPage } from "../../services/infoPages";

// ── Helpers ──────────────────────────────────────────────
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // saca tildes
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

// ── Texto plano ↔ blocks[] ───────────────────────────────

// Texto pegado → blocks (formato que renderiza InfoPage.jsx)
function parseText(text) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const hasContent = (cur.title || cur.body || (cur.items && cur.items.length) || cur.callout);
    if (hasContent) {
      // limpiar campos vacios para que el JSON quede prolijo
      const b = { type: cur.type };
      if (cur.tag) b.tag = cur.tag;
      if (cur.title) b.title = cur.title;
      if (cur.body) b.body = cur.body.trim();
      if (cur.items && cur.items.length) b.items = cur.items;
      if (cur.callout) b.callout = cur.callout;
      blocks.push(b);
    }
    cur = null;
  };
  const ensure = () => {
    if (!cur) cur = { type: blocks.length === 0 ? "hero" : "rule", title: "", body: "", items: [], callout: "" };
    return cur;
  };

  for (const raw of lines) {
    const line = raw.trim();

    // "--- texto" → nota legal al pie
    const legal = line.match(/^-{3,}\s+(.+)$/);
    if (legal) { flush(); blocks.push({ type: "footer_legal", body: legal[1] }); continue; }

    // "## Titulo" (1-3 #) → nueva seccion. "[ETIQUETA] Titulo" preserva el tag.
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      cur = { type: blocks.length === 0 ? "hero" : "rule", title: heading[1], body: "", items: [], callout: "" };
      const tagged = cur.title.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (tagged) { cur.tag = tagged[1]; cur.title = tagged[2]; }
      // los titulos en negrita markdown (**x**) quedan limpios
      cur.title = cur.title.replace(/\*\*/g, "");
      continue;
    }

    // "- punto" / "* punto" / "• punto" / "1. punto" → item de lista
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (item) {
      const it = item[1].replace(/\*\*/g, "");
      const split = it.match(/^([^:]{1,60}):\s+(.+)$/);
      ensure().items.push(split ? { title: split[1], body: split[2] } : { title: it, body: "" });
      continue;
    }

    // "> nota" → recuadro destacado
    const callout = line.match(/^>\s+(.+)$/);
    if (callout) {
      const c = ensure();
      c.callout = c.callout ? `${c.callout} ${callout[1]}` : callout[1];
      continue;
    }

    // Parrafos (linea en blanco = separacion)
    if (!line) {
      if (cur && cur.body && !cur.body.endsWith("\n\n")) cur.body += "\n\n";
      continue;
    }
    const c = ensure();
    c.body += (c.body && !c.body.endsWith("\n\n") ? "\n" : "") + line.replace(/\*\*/g, "");
  }
  flush();
  return blocks;
}

// blocks → texto plano (para re-editar paginas existentes)
function blocksToText(blocks) {
  return (blocks || []).map((b) => {
    if (b.type === "footer_legal") return `--- ${b.body || ""}`;
    const out = [];
    const emoji = b.emoji ? `${b.emoji} ` : ""; // paginas viejas: el emoji pasa al titulo
    const tag = b.tag ? `[${b.tag}] ` : "";
    if (b.title) out.push(`${b.type === "hero" ? "#" : "##"} ${tag}${emoji}${b.title}`);
    if (b.body) out.push(b.body);
    (b.items || []).forEach((it) => out.push(`- ${it.title}${it.body ? `: ${it.body}` : ""}`));
    if (b.callout) out.push(`> ${b.callout}`);
    return out.join("\n");
  }).join("\n\n");
}

// ── Pantalla principal ───────────────────────────────────
export default function InfoPagesAdmin({ embedded = false, onBack }) {
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [draft, setDraft] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Gate (solo standalone /admin/paginas; embedded ya esta detras del gate
  // del Admin). Cliente de catalogo con sesion -> AccessDenied.
  const [authUser, setAuthUser] = useState(undefined);
  useEffect(() => {
    if (embedded) { setAuthUser(false); return; } // false = no aplica
    supabase.auth.getSession().then(({ data }) => setAuthUser(data?.session?.user || null));
  }, [embedded]);
  const gate = useAdminGate(!embedded && authUser ? authUser.id : null);
  useEffect(() => {
    if (!embedded && authUser === null) navigate("/admin", { replace: true });
  }, [embedded, authUser, navigate]);

  const goBack = onBack || (() => navigate("/admin"));

  const load = async () => {
    setLoading(true);
    const data = await fetchInfoPages();
    setPages(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing("new");
    setSlugTouched(false);
    setError("");
    setDraft({ slug: "", title: "", text: "", requires_age_gate: false, visible: true });
  };

  const openEdit = (p) => {
    setEditing(p.id);
    setSlugTouched(true);
    setError("");
    setDraft({
      slug: p.slug,
      title: p.title,
      text: blocksToText(p.blocks),
      requires_age_gate: p.requires_age_gate,
      visible: p.visible,
    });
  };

  const save = async () => {
    const slug = slugify(draft.slug);
    if (!draft.title.trim()) { setError("Poné un título."); return; }
    if (!slug) { setError("Poné una dirección (link) válida."); return; }
    setSaving(true);
    setError("");
    const payload = {
      slug,
      title: draft.title.trim(),
      blocks: parseText(draft.text),
      requires_age_gate: draft.requires_age_gate,
      visible: draft.visible,
      updated_at: new Date().toISOString(),
    };
    // .select('id') para detectar el guardado SILENCIOSO: si RLS bloquea,
    // Supabase devuelve 0 filas SIN error (paso el 12/jun — faltaban las
    // policies de escritura y el editor "guardaba" nada).
    const res = await saveInfoPage({ id: editing, ...payload });
    setSaving(false);
    if (res.__error) { setError(res.__error); return; }
    setEditing(null);
    setDraft(null);
    load();
  };

  const remove = async (p) => {
    if (!window.confirm(`¿Borrar "${p.title}"? Los QRs que apunten a /info/${p.slug} van a quedar rotos.`)) return;
    await deleteInfoPage(p.id);
    load();
  };

  const setD = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const body = (
    <div style={{ padding: "12px 16px 28px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* Head */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 14px" }}>
        <button type="button" onClick={goBack} aria-label="Volver" style={{
          width: 34, height: 34, borderRadius: 10, border: "1px solid var(--ag-line)",
          background: "var(--ag-bg-card)", color: "var(--ag-ink)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, color: "var(--ag-ink)", letterSpacing: "-0.01em" }}>
            Páginas informativas
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ag-ink-3)" }}>
            Contenido al que pueden apuntar tus QRs y links
          </p>
        </div>
        <button type="button" className="ag-cta" onClick={openNew} style={{ padding: "8px 14px", fontSize: 12, flexShrink: 0 }}>
          + Nueva
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ag-ink-3)" }}>Cargando...</div>
      ) : pages.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ag-ink-3)", border: "1px dashed var(--ag-line)", borderRadius: 14 }}>
          No hay páginas todavía. Creá la primera con "+ Nueva".
        </div>
      ) : pages.map(p => (
        <div key={p.id} style={{
          display: "flex", gap: 12, alignItems: "center", padding: "13px 14px", marginBottom: 8,
          background: "var(--ag-bg-card)", border: "1px solid var(--ag-line)", borderRadius: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14, color: "var(--ag-ink)" }}>{p.title}</strong>
              {!p.visible && <span style={{ fontSize: 10, padding: "2px 7px", background: "var(--ag-bg-soft)", color: "var(--ag-ink-3)", borderRadius: 999, fontWeight: 700 }}>oculta</span>}
              {p.requires_age_gate && <span style={{ fontSize: 10, padding: "2px 7px", background: "rgba(245,158,11,0.14)", color: "var(--ag-c-terra)", borderRadius: 999, fontWeight: 800 }}>+18</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", fontFamily: "monospace" }}>/info/{p.slug}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <a href={`/info/${p.slug}`} target="_blank" rel="noreferrer" className="ag-btn-ghost"
              style={{ textDecoration: "none", padding: "7px 11px", fontSize: 12.5 }}>Ver</a>
            <button type="button" className="ag-btn-ghost" onClick={() => openEdit(p)} style={{ padding: "7px 11px", fontSize: 12.5 }}>Editar</button>
            <button type="button" className="ag-btn-ghost" onClick={() => remove(p)}
              style={{ padding: "7px 11px", fontSize: 12.5, color: "var(--ag-c-orders)" }}>Borrar</button>
          </div>
        </div>
      ))}

      {/* ── Editor: titulo + UN cuadro de texto ── */}
      {editing && draft && (
        <div className="ag-page-over">
          <div className="ag-page-over-head">
            <button type="button" className="ag-subpage-back" onClick={() => setEditing(null)} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Atrás</span>
            </button>
            <h2 className="ag-page-over-title">{editing === "new" ? "Nueva página" : "Editar página"}</h2>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 100px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
            <label className="ag-field-lbl">Título de la página</label>
            <input
              className="ag-field-input"
              value={draft.title}
              onChange={e => {
                setD("title", e.target.value);
                if (!slugTouched) setD("slug", slugify(e.target.value));
              }}
              placeholder="Ej: Cómo consumir Crazy Cookie"
              maxLength={120}
            />

            <label className="ag-field-lbl" style={{ marginTop: 12 }}>Dirección (link)</label>
            <input
              className="ag-field-input"
              value={draft.slug}
              onChange={e => { setSlugTouched(true); setD("slug", slugify(e.target.value)); }}
              placeholder="crazy-cookie"
              maxLength={60}
            />
            <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 3 }}>
              Tu página va a vivir en /info/{slugify(draft.slug) || "..."} — es a donde apunta el QR.
            </div>

            <label className="ag-field-lbl" style={{ marginTop: 14 }}>Contenido</label>
            <textarea
              className="ag-field-input"
              value={draft.text}
              onChange={e => setD("text", e.target.value)}
              rows={16}
              placeholder={"Escribí o pegá acá el texto completo de la página.\n\nTip: podés pedírselo a una IA (ChatGPT, Claude) y pegarlo tal cual — los títulos y las listas se formatean solos."}
              style={{ resize: "vertical", lineHeight: 1.55, fontSize: 13.5 }}
            />
            <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 4, lineHeight: 1.5 }}>
              Se formatea solo: <b>## Texto</b> arma un título, <b>- texto</b> arma una lista, <b>&gt; texto</b> arma una nota destacada.
            </div>

            <div style={{ display: "flex", gap: 18, margin: "14px 0 4px" }}>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--ag-ink)", cursor: "pointer" }}>
                <input type="checkbox" checked={draft.visible} onChange={e => setD("visible", e.target.checked)} />
                Visible
              </label>
              <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: "var(--ag-ink)", cursor: "pointer" }}>
                <input type="checkbox" checked={draft.requires_age_gate} onChange={e => setD("requires_age_gate", e.target.checked)} />
                Pedir +18 para entrar
              </label>
            </div>

            {error && <div style={{ color: "var(--ag-c-orders)", fontSize: 12.5, fontWeight: 700, marginTop: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button type="button" className="ag-btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="ag-btn-primary" onClick={save} disabled={saving} style={{ minWidth: 120 }}>
                {saving ? "Guardando..." : "Guardar página"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Acceso standalone: cliente de catalogo logueado sin rol -> denied.
  if (!embedded && authUser && gate.status === "denied") {
    return <AccessDenied email={authUser?.email || ""} />;
  }

  // Standalone (ruta /admin/paginas): envolver con el tema del admin para
  // que los tokens ag-* existan fuera del ag-root de Admin.jsx
  if (!embedded) {
    let theme = "light";
    try { theme = localStorage.getItem("ag-theme") || "light"; } catch { /* default */ }
    return (
      <div className={`ag-root ${theme === "dark" ? "ag-theme-dark" : "ag-theme-light"}`} style={{ minHeight: "100vh", background: "var(--ag-bg)" }}>
        {body}
      </div>
    );
  }
  return body;
}
