// src/components/ui/CatChipsEditor.jsx
// Editor de categorías (lista + agregar + eliminar) con look del sistema visual v2.
// Usado en Stock (ing_cats) y Expenses (exp_cats). Persiste en settings.
import { useConfirm } from "../ConfirmSlideProvider";
import { useState } from "react";
import { updateSettings } from "../../services/settings";

// onSave: (settings) => Promise<guardado|null>. Por defecto escribe en la
// tabla settings legacy. El panel del edificio inyecta la version por tenant.
// Sin esto el editor guardaba por su cuenta, salteando el onSave de la
// pantalla que lo contiene — y en el edificio eso es un cambio que no
// persiste y no avisa.
export default function CatChipsEditor({ settings, setSettings, field, label, icon, showToast, onSave = updateSettings }) {
  const confirmSlide = useConfirm();
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const cats = settings?.[field] || [];

  const persist = async (next) => {
    setSaving(true);
    const saved = await onSave({ ...settings, [field]: next });
    setSaving(false);
    if (saved) {
      setSettings(saved);
      showToast?.("Categorías actualizadas ✓");
    } else {
      showToast?.("Error al guardar");
    }
  };

  const add = () => {
    const v = val.trim();
    if (!v) return;
    if (cats.includes(v)) { showToast?.(`"${v}" ya existe`); return; }
    persist([...cats, v]);
    setVal("");
  };

  const remove = async (c) => {
    const ok = await confirmSlide({ title: `Eliminar "${c}"`, body: "Los gastos viejos en esta categoría no se borran, solo dejan de aparecer en el selector.", label: "Deslizá para eliminar" });
    if (!ok) return;
    persist(cats.filter((x) => x !== c));
  };

  return (
    <div>
      {/* Input para agregar nueva */}
      <label className="ag-field-lbl">{icon ? `${icon} ` : ""}{label || "Categorías"}</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          className="ag-field-input"
          placeholder="Ej: Servicios"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          disabled={saving}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="ag-btn-primary"
          onClick={add}
          disabled={saving || !val.trim()}
          style={{ opacity: !val.trim() ? 0.5 : 1 }}
        >+ Agregar</button>
      </div>

      {/* Conteo + lista */}
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {cats.length} categoría{cats.length !== 1 ? "s" : ""}
      </div>

      {cats.length === 0 ? (
        <div className="ag-card" style={{ padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div>
          <div style={{ color: "var(--ag-ink-3)", fontSize: 13 }}>Sin categorías. Agregá la primera.</div>
        </div>
      ) : (
        <div className="ag-card" style={{ padding: 4 }}>
          {cats.map((c, i) => (
            <div
              key={c}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "var(--ag-bg-soft)",
                color: "var(--ag-ink-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 800,
                flexShrink: 0,
              }}>
                {c.charAt(0).toUpperCase()}
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ag-ink)" }}>{c}</span>
              <button
                type="button"
                onClick={() => remove(c)}
                disabled={saving}
                aria-label={`Eliminar ${c}`}
                style={{
                  width: 28, height: 28,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: 0, borderRadius: 8,
                  background: "rgba(232,90,74,0.10)",
                  color: "var(--ag-c-orders)",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  fontFamily: "inherit",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
