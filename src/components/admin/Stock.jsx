/**
 * Stock.jsx — Inventario de ingredientes (sistema visual v2).
 *
 * Vista principal:
 *   - Header con título "Inventario" + KPI de inversión total
 *   - Búsqueda + tabs (Todos / Bajo stock / categorías dinámicas)
 *   - Lista de ingredientes con avatar de estado:
 *     · verde (sales) = OK
 *     · amarillo (stock) = bajo (<= min)
 *     · rojo (orders) = agotado (0)
 *   - CTAs: Registrar merma + Agregar insumo
 *
 * Modales (full-screen ag-page-over):
 *   - IngForm: crear / editar / eliminar insumo
 *   - WasteForm: registrar merma con preview de stock resultante
 *
 * Nota: la edición de categorías de stock vive en Settings → Finanzas →
 * Categorías de stock (no más editor inline acá).
 */
import { useState, useMemo } from "react";
import { formatInt, formatMoney } from "../../lib/utils";
import { upsertIngredient, archiveIngredient, registerWaste } from "../../lib/adminService";
import { useConfirm } from "../ConfirmSlideProvider";
import DecimalInput from "../ui/DecimalInput";

const DEFAULT_SETTINGS = { ing_cats: ["Secos", "Frescos", "Packaging", "Otros"] };

const WASTE_REASONS = [
  { key: "vencimiento", label: "Vencimiento", icon: "🗓️" },
  { key: "rotura",      label: "Rotura",      icon: "💥" },
  { key: "prueba",      label: "Prueba",      icon: "🧪" },
  { key: "derrame",     label: "Derrame",     icon: "💧" },
  { key: "otro",        label: "Otro",        icon: "❓" },
];

import { FOOD_CATEGORIES, getFoodCategory } from "../../constants/usar";

// Estado de stock por ingrediente → color del sistema visual v2
function stockState(it) {
  const s = it.stock || 0;
  const m = it.min_stock || 0;
  if (s <= 0)  return { key: "zero", color: "var(--ag-c-orders)", soft: "var(--ag-c-orders-soft)", label: "Agotado" };
  if (s <= m)  return { key: "low",  color: "var(--ag-c-stock)",  soft: "var(--ag-c-stock-soft)",  label: "Bajo" };
  return { key: "ok", color: "var(--ag-c-sales)", soft: "var(--ag-c-sales-soft)", label: "OK" };
}

/**
 * Acople inyectable, mismo patron que Settings.jsx: los defaults escriben en
 * la base legacy, asi que el admin viejo no cambia en nada. El panel del
 * edificio pasa las versiones por tenant.
 *
 * @param onUpsert  (insumo) => Promise<guardado|{__error}|null>
 * @param onArchive (id) => Promise<bool>
 * @param permiteMerma  false apaga el registro de merma: vive en waste_log,
 *                      tabla que el edificio todavia no tiene (Etapa 6).
 */
function Stock({
  ingredients, setIngredients, recipes, overlay, setOverlay, showToast, settings,
  onUpsert = upsertIngredient,
  onArchive = archiveIngredient,
  permiteMerma = true,
}) {
  const confirmSlide = useConfirm();
  const [search, setSearch] = useState("");
  const [fil, setFil] = useState("all");  // 'all' | 'low' | <categoría>

  const cats = useMemo(
    () => FOOD_CATEGORIES.map(c => c.value),
    [ingredients]
  );

  // Conteos para mostrar en tabs
  const counts = useMemo(() => {
    const c = { all: ingredients.length, low: 0 };
    cats.forEach(k => { c[k] = 0; });
    ingredients.forEach(i => {
      if ((i.stock || 0) <= (i.min_stock || 0)) c.low++;
      if (i.food_category && c[i.food_category] !== undefined) c[i.food_category]++;
    });
    return c;
  }, [ingredients, cats]);

  // Filtrado
  const filt = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ingredients.filter(i => {
      if (i.is_archived) return false;
      if (q && !(i.name || "").toLowerCase().includes(q)) return false;
      if (fil === "low") return (i.stock || 0) <= (i.min_stock || 0);
      if (fil !== "all" && i.food_category !== fil) return false;
      return true;
    });
  }, [ingredients, search, fil]);

  // KPI: valor total invertido en inventario
  const tInv = useMemo(
    () => ingredients.reduce((s, i) => s + (i.cost || 0) * (i.stock || 0), 0),
    [ingredients]
  );

  const tabs = [
    { id: "all", label: "Todos", count: counts.all },
    { id: "low", label: "Bajo",  count: counts.low, color: "var(--ag-c-stock)" },
    ...cats.map(c => { const fc = getFoodCategory(c); return { id: c, label: `${fc.icon} ${fc.short}`, count: counts[c] }; }),
  ];

  return (
    <>
      <div style={{ padding: "12px 16px 6px", position: "relative", zIndex: 2 }}>
        {/* Header: título + KPI inversión */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22,
              margin: 0, color: "var(--ag-ink)", letterSpacing: "-0.01em", lineHeight: 1.1,
            }}>Inventario</h1>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ag-ink-3)" }}>
              {ingredients.length} insumo{ingredients.length !== 1 ? "s" : ""} · {counts.low} bajo stock
            </p>
          </div>
          <div style={{
            padding: "8px 14px",
            background: "var(--ag-bg-card)",
            borderRadius: 14,
            boxShadow: "var(--ag-sh-sm)",
            borderTop: "3px solid var(--ag-c-recipes)",
            textAlign: "right", flexShrink: 0,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Invertido
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ag-c-recipes)", lineHeight: 1.1 }}>
              ${formatInt(tInv)}
            </div>
          </div>
        </div>

        {/* Buscador */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ag-ink-3)", pointerEvents: "none" }}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="ag-field-input"
            placeholder="Buscar insumo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Tabs (pills horizontales scrolleables) */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 12,
          overflowX: "auto", scrollbarWidth: "none",
          padding: "0 2px 4px",
        }}>
          {tabs.map(t => {
            const on = fil === t.id;
            const c = t.color || "var(--ag-c-terra)";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFil(t.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px",
                  borderRadius: 999,
                  border: on ? `2px solid ${c}` : "1px solid var(--ag-line)",
                  background: on ? c : "var(--ag-bg-card)",
                  color: on ? "#fff" : "var(--ag-ink-2)",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: 999,
                    background: on ? "rgba(255,255,255,0.25)" : "var(--ag-bg-soft)",
                    color: on ? "#fff" : "var(--ag-ink-3)",
                  }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* CTAs: Merma + Agregar — arriba de la lista para que sean accesibles sin scroll */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {permiteMerma && <button
            type="button"
            onClick={() => setOverlay({ type: "waste" })}
            style={{
              flex: 1, padding: "12px", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "var(--ag-bg-card)",
              border: "1.5px solid var(--ag-c-stock)",
              color: "var(--ag-c-stock)",
              borderRadius: 12,
              fontFamily: "inherit", fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Registrar merma
          </button>}
          <button
            type="button"
            onClick={() => setOverlay({ type: "editIng", data: null })}
            className="ag-btn-primary"
            style={{ flex: 1, padding: "12px", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar insumo
          </button>
        </div>

        {/* Lista de ingredientes agrupada en un card */}
        {filt.length === 0 ? (
          <div className="ag-card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ color: "var(--ag-ink-3)", fontSize: 13 }}>
              {search ? `Sin resultados para "${search}"` :
               fil === "low" ? "Ningún insumo en bajo stock 🎉" :
               "Sin insumos registrados"}
            </div>
          </div>
        ) : (
          <div className="ag-card" style={{
            padding: 0,
            borderTop: "3px solid var(--ag-c-terra)",
            overflow: "hidden",
            marginBottom: 14,
          }}>
            {filt.map((it, i) => {
              const st = stockState(it);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setOverlay({ type: "editIng", data: it })}
                  style={{
                    width: "100%", border: 0, background: "transparent",
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px",
                    borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  {/* Avatar estado */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10,
                    background: st.soft, color: st.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {st.key === "ok" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    )}
                  </div>

                  {/* Nombre + categoría + costo/unit */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ag-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 1 }}>
                      {getFoodCategory(it.food_category).icon} {getFoodCategory(it.food_category).label} · ${formatMoney(it.cost || 0)}/{it.unit}
                    </div>
                  </div>

                  {/* Stock + min */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: st.color }}>
                      {it.stock || 0} {it.unit}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)" }}>
                      mín: {it.min_stock || 0}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* Modales */}
      {overlay?.type === "editIng" && (
        <IngForm
          data={overlay.data}
          settings={settings}
          onClose={() => setOverlay(null)}
          onSave={async (it) => {
            const saved = await onUpsert(it);
            if (saved?.__error) { showToast(saved.message || ("Error: " + saved.__error)); return; }
            if (saved) {
              if (it.id) setIngredients(p => p.map(i => i.id === it.id ? saved : i));
              else setIngredients(p => [...p, saved]);
              setOverlay(null);
              showToast(it.id ? "Actualizado ✓" : "Agregado ✓");
            } else {
              showToast("Error al guardar insumo");
            }
          }}
          onDel={async (id) => {
            const ing = (ingredients || []).find(i => i.id === id);
            const usedIn = (recipes || []).filter(r => (r.ingredients || []).some(ri => ri.ingredient_id === id));
            const body = usedIn.length > 0
              ? `Sigue usándose en: ${usedIn.map(r => r.name).join(", ")}. Las recetas seguirán funcionando, pero el ingrediente deja de aparecer en stock activo. La historia (compras, mermas) se preserva.`
              : "Deja de aparecer en stock activo. Toda la historia (compras, mermas, recetas) se preserva. Podés restaurarlo después.";
            const ok = await confirmSlide({
              title: `Archivar "${ing?.name || "ingrediente"}"`,
              body,
              label: "Deslizá para archivar",
              loadingLabel: "Archivando…",
              successLabel: "Archivado ✓",
            });
            if (!ok) return;
            await onArchive(id);
            setIngredients(p => p.map(i => i.id === id ? { ...i, is_archived: true } : i));
            setOverlay(null);
            showToast("Ingrediente archivado · historia conservada");
          }}
        />
      )}
      {permiteMerma && overlay?.type === "waste" && (
        <WasteForm
          ingredients={ingredients}
          setIngredients={setIngredients}
          showToast={showToast}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}

/* ─── IngForm: crear/editar/eliminar insumo ─────────────────── */
function IngForm({ data, onClose, onSave, onDel, settings }) {
  const [f, setF] = useState(data || { name: "", unit: "kg", cost: 0, stock: 0, min_stock: 0, food_category: "dry" });
  const [err, setErr] = useState("");
  const s = (k, v) => { setErr(""); setF(p => ({ ...p, [k]: v })); };
  const canSave = f.name && (f.cost || 0) > 0 && (f.stock || 0) >= 0;

  const handleSave = () => {
    if (!f.name)                  { setErr("El nombre es obligatorio."); return; }
    if ((f.cost || 0) <= 0)       { setErr("El costo debe ser mayor a 0."); return; }
    if ((f.stock || 0) < 0)       { setErr("El stock no puede ser negativo."); return; }
    // Derivar `category` (campo NOT NULL del schema) desde food_category USAR
    const CATEGORY_FROM_FOOD = {
      protein: "Frescos", dairy: "Frescos", vegetable: "Frescos",
      dry: "Secos", beverage: "Bebidas", packaging: "Packaging",
    };
    const derivedCategory = CATEGORY_FROM_FOOD[f.food_category] || f.category || "Otros";
    onSave({ ...f, category: derivedCategory });
  };

  return (
    <div className="ag-page-over">
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose} aria-label="Cancelar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Atrás</span>
        </button>
        <h2 className="ag-page-over-title">{data ? "Editar insumo" : "Nuevo insumo"}</h2>
      </div>

      <div className="ag-page-over-body">
        <label className="ag-field-lbl">Nombre *</label>
        <input
          className="ag-field-input"
          value={f.name}
          onChange={e => s("name", e.target.value)}
          placeholder="Ej: Harina 000"
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="ag-field-lbl">Unidad</label>
            <select className="ag-field-input" value={f.unit} onChange={e => s("unit", e.target.value)}>
              {["kg", "g", "lt", "ml", "uni"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="ag-field-lbl">Categoría USAR</label>
            <select className="ag-field-input" value={f.food_category || "dry"} onChange={e => s("food_category", e.target.value)}>
              {FOOD_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
          </div>
        </div>

        <label className="ag-field-lbl">Costo por {f.unit} *</label>
        <DecimalInput
          className="ag-field-input"
          step="0.01"
          value={f.cost}
          onChange={(n) => s("cost", n)}
          placeholder="0"
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="ag-field-lbl">Stock actual</label>
            <DecimalInput
              className="ag-field-input"
              step="0.001"
              value={f.stock}
              onChange={(n) => s("stock", n)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="ag-field-lbl">Stock mínimo</label>
            <DecimalInput
              className="ag-field-input"
              step="0.001"
              value={f.min_stock}
              onChange={(n) => s("min_stock", n)}
              placeholder="0"
            />
          </div>
        </div>

        {err && (
          <div style={{
            background: "var(--ag-c-orders-soft)",
            color: "var(--ag-c-orders)",
            border: "1px solid var(--ag-c-orders)",
            padding: "10px 12px", borderRadius: 10,
            fontSize: 12.5, fontWeight: 600,
            marginBottom: 12,
          }}>⚠ {err}</div>
        )}

        <button
          type="button"
          className="ag-btn-primary"
          style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 6, opacity: canSave ? 1 : 0.5 }}
          disabled={!canSave}
          onClick={handleSave}
        >
          {data ? "✓ Guardar cambios" : "✓ Agregar insumo"}
        </button>

        {/* Archivar (solo al editar) — botón directo al slide */}
        {data && (
          <button
            type="button"
            onClick={() => onDel(data.id)}
            style={{
              width: "100%", marginTop: 10, padding: "12px",
              background: "transparent",
              border: "1px solid var(--ag-c-orders)",
              color: "var(--ag-c-orders)",
              borderRadius: 12, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            Archivar insumo
          </button>
        )}

        {/* Volver al pie */}
        <button
          type="button"
          className="ag-btn-ghost"
          onClick={onClose}
          style={{ marginTop: 10, width: "100%", padding: "12px", fontSize: 13 }}
        >← Volver</button>
      </div>
    </div>
  );
}

/* ─── WasteForm: registrar merma ────────────────────────────── */
function WasteForm({ ingredients, setIngredients, showToast, onClose }) {
  const [ingId, setIngId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("vencimiento");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const ing = ingredients.find(x => x.id === ingId);
  const qtyNum = Number(qty) || 0;
  const newStock = ing ? Math.max(0, (ing.stock || 0) - qtyNum) : 0;
  const canSave = ingId && qtyNum > 0;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await registerWaste(ingId, qtyNum, reason, note);
    setSaving(false);
    if (ok) {
      setIngredients(p => p.map(i => i.id === ingId ? { ...i, stock: newStock } : i));
      showToast(`Merma registrada: ${qtyNum} ${ing?.unit || ""}`);
      onClose();
    } else {
      showToast("Error al registrar merma");
    }
  };

  return (
    <div className="ag-page-over">
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose} aria-label="Cancelar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Atrás</span>
        </button>
        <h2 className="ag-page-over-title">Registrar merma</h2>
      </div>

      <div className="ag-page-over-body">
        {/* Banner explicativo */}
        <div style={{
          padding: "10px 12px",
          background: "var(--ag-bg-card)",
          border: "1px solid var(--ag-c-stock)",
          borderRadius: 10,
          marginBottom: 16,
          fontSize: 12, color: "var(--ag-ink-2)", lineHeight: 1.5,
        }}>
          <strong style={{ color: "var(--ag-c-stock)" }}>⚠ Ajuste sin venta.</strong> Esto descuenta stock por vencimientos, roturas o pruebas. No genera ingreso.
        </div>

        <label className="ag-field-lbl">Insumo *</label>
        <select
          className="ag-field-input"
          value={ingId}
          onChange={e => setIngId(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          <option value="">Seleccionar insumo...</option>
          {ingredients.map(i => (
            <option key={i.id} value={i.id}>
              {i.name} (stock: {i.stock || 0} {i.unit})
            </option>
          ))}
        </select>

        <label className="ag-field-lbl">
          Cantidad a descontar {ing && <span style={{ color: "var(--ag-ink-3)", fontWeight: 600 }}>({ing.unit})</span>}
        </label>
        <input
          className="ag-field-input"
          type="number" min="0.001" step="0.001"
          value={qty}
          onChange={e => setQty(e.target.value)}
          placeholder="Ej: 0.5"
          style={{ marginBottom: 12 }}
        />

        {/* Preview stock resultante */}
        {ing && qtyNum > 0 && (
          <div style={{
            padding: "10px 12px",
            background: "var(--ag-bg-card)",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 12.5,
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          }}>
            <span style={{ color: "var(--ag-ink-3)" }}>Stock actual:</span>
            <strong style={{ color: "var(--ag-ink)" }}>{ing.stock || 0} {ing.unit}</strong>
            <span style={{ color: "var(--ag-ink-3)" }}>→</span>
            <span style={{ color: "var(--ag-ink-3)" }}>nuevo:</span>
            <strong style={{ color: newStock <= 0 ? "var(--ag-c-orders)" : "var(--ag-c-stock)" }}>
              {newStock} {ing.unit}
            </strong>
          </div>
        )}

        <label className="ag-field-lbl">Motivo</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {WASTE_REASONS.map(r => {
            const on = reason === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
                  background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
                  color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
                  fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14 }}>{r.icon}</span>
                {r.label}
              </button>
            );
          })}
        </div>

        <label className="ag-field-lbl">Nota (opcional)</label>
        <input
          className="ag-field-input"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Ej: Caja dañada al descargar"
          style={{ marginBottom: 14 }}
        />

        <button
          type="button"
          className="ag-btn-primary"
          style={{ width: "100%", padding: "14px", fontSize: 15, opacity: canSave && !saving ? 1 : 0.5 }}
          disabled={!canSave || saving}
          onClick={save}
        >
          {saving ? "Guardando…" : "⚠ Confirmar merma"}
        </button>

        <button
          type="button"
          className="ag-btn-ghost"
          onClick={onClose}
          style={{ marginTop: 10, width: "100%", padding: "12px", fontSize: 13 }}
        >← Volver</button>
      </div>
    </div>
  );
}

export default Stock;
