/**
 * Finance.jsx — Expenses, Purchase y SalesView adaptados al sistema visual v2.
 *
 * Mantiene toda la lógica de datos del módulo original:
 *  - createExpense / createSale
 *  - upsertIngredient / updateIngredientStock
 *  - Combinación de orders completados + ventas manuales
 *
 * Visual:
 *  - Overlays full-screen usan `.ag-page-over*`
 *  - Inputs con `.ag-field-input` + `.ag-field-lbl`
 *  - Cards con `.ag-card`
 *  - Botones con `.ag-btn-primary` / `.ag-btn-ghost`
 *  - Colores vía tokens `var(--ag-c-*)`
 *
 * ETAPA 3 del edificio: todo lo que escribe en la base entra por prop, con
 * default legacy — el admin viejo no cambia en nada. Ojo con los hijos que
 * guardan solos: `ExpForm` y `Purchase` cargan y crean PROVEEDORES por su
 * cuenta, salteando cualquier saver de la pantalla que los contiene. Es la
 * trampa que ya nos mordió con `CatChipsEditor` y `PaymentAccountsEditor`, así
 * que esos dos accesos también viajan por prop.
 */
import { useState, useEffect } from "react";
import { formatInt, todayISO, formatOrderCode } from "../../lib/utils";
import {
  createExpense, createSale,
  upsertIngredient, updateIngredientStock,
  uploadLogoImage, // reusado como uploader genérico de assets
} from "../../lib/adminService";
import { fetchSuppliers, upsertSupplier } from "../../services/suppliers";
import { SupplierForm } from "./Suppliers";
import { voidExpense } from "../../services/finance";
import SlideToConfirm from "../SlideToConfirm";
import DecimalInput from "../ui/DecimalInput";
import { paymentLabel, paymentIcon } from "../../lib/payments";
// PaymentAccountsEditor: se mudo a la pagina de configuracion Finanzas
// (burbuja de perfil → Finanzas → Cuentas y medios de pago) — unica verdad.
import { Avatar } from "../../lib/avatars.jsx";
import { USAR_EXPENSE_CATEGORIES, getUsarExpense } from "../../constants/usar";

const DEFAULT_SETTINGS = {
  exp_cats: ["Materia Prima", "Servicios", "Packaging", "Transporte", "Alquiler", "Equipamiento", "Otros"],
  ing_cats: ["Secos", "Frescos", "Packaging", "Otros"],
};

/* ─── Paleta por categoría de gasto ─── */
/* Mapeo determinístico: las categorías comunes tienen color fijo.
   Las custom rotan en una paleta para diferenciarlas visualmente. */
const CAT_COLORS_KNOWN = {
  "Materia Prima": { fg: "var(--ag-c-sales)",   bg: "var(--ag-c-sales-soft)" },
  "Servicios":     { fg: "var(--ag-c-prep)",    bg: "var(--ag-c-prep-soft)" },
  "Packaging":     { fg: "var(--ag-c-recipes)", bg: "var(--ag-c-recipes-soft)" },
  "Transporte":    { fg: "var(--ag-c-stock)",   bg: "var(--ag-c-stock-soft)" },
  "Alquiler":      { fg: "var(--ag-c-terra)",   bg: "rgba(245,158,11,0.14)" },
  "Equipamiento":  { fg: "var(--ag-c-crm)",     bg: "var(--ag-c-crm-soft)" },
  "Sueldos":       { fg: "var(--ag-c-orders)",  bg: "var(--ag-c-orders-soft)" },
  "Impuestos":     { fg: "#7A2E4A",             bg: "rgba(122,46,74,0.14)" },
  "Seguros":       { fg: "var(--ag-c-crm)",     bg: "var(--ag-c-crm-soft)" },
  "Otros":         { fg: "var(--ag-ink-3)",     bg: "var(--ag-bg-soft)" },
};
const CAT_COLORS_ROTATE = [
  { fg: "var(--ag-c-sales)",   bg: "var(--ag-c-sales-soft)" },
  { fg: "var(--ag-c-prep)",    bg: "var(--ag-c-prep-soft)" },
  { fg: "var(--ag-c-recipes)", bg: "var(--ag-c-recipes-soft)" },
  { fg: "var(--ag-c-stock)",   bg: "var(--ag-c-stock-soft)" },
  { fg: "var(--ag-c-crm)",     bg: "var(--ag-c-crm-soft)" },
];
/* Chips de medio de pago = Efectivo + CUENTAS de Finanzas (unica verdad).
   Solo cuentas con scope proveedores/ambos. onChange(method, accountId):
   efectivo → ("efectivo", null); cuenta → ("transferencia", acc.id) — el
   bucket "transferencia" mantiene compatibles los reportes legacy. */
function PaymentMethodChips({ value, accountId, onChange, settings }) {
  const accounts = (Array.isArray(settings?.payment_accounts) ? settings.payment_accounts : [])
    .filter(a => a && a.active !== false && (a.scope ?? "ambos") !== "checkout");
  const chipStyle = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 12px", borderRadius: 999,
    border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
    background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
    color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
    fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer",
  });
  const cashOn = !accountId && value === "efectivo";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <button type="button" onClick={() => onChange("efectivo", null)} style={chipStyle(cashOn)}>
        💵 Efectivo
      </button>
      {accounts.map(acc => {
        const on = accountId === acc.id;
        return (
          <button
            key={acc.id}
            type="button"
            onClick={() => onChange("transferencia", acc.id)}
            style={chipStyle(on)}
          >
            <span style={{ fontSize: 14 }}>🏦</span>
            {acc.banco || acc.label || "Cuenta"}{acc.label && acc.banco ? ` · ${acc.label}` : ""}
          </button>
        );
      })}
    </div>
  );
}

/* Label de una cuenta por id (para mostrar en filas de gastos/compras) */
function accountLabel(settings, accountId) {
  if (!accountId) return null;
  const acc = (settings?.payment_accounts || []).find(a => a.id === accountId);
  return acc ? (acc.banco || acc.label || "Cuenta") : null;
}

/* Formato compacto para la pill: 3450 → $3K, 312000 → $312K, 1450000 → $1.5M */
function compactMoney(n) {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function colorForCategory(cat) {
  if (!cat) return CAT_COLORS_KNOWN["Otros"];
  if (CAT_COLORS_KNOWN[cat]) return CAT_COLORS_KNOWN[cat];
  // Hash determinístico para custom: misma cat siempre tiene el mismo color
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) | 0;
  return CAT_COLORS_ROTATE[Math.abs(h) % CAT_COLORS_ROTATE.length];
}

// ─── Helpers visuales ───
function BackButton({ onClick, label = "Atrás" }) {
  return (
    <button type="button" className="ag-subpage-back" onClick={onClick} aria-label="Volver">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

function EmptyState({ icon = "📦", text }) {
  return (
    <div className="ag-card" style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: "var(--ag-ink-3)", fontSize: 13 }}>{text}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//                          EXPENSES
// ═══════════════════════════════════════════════════════════════
function Expenses({
  expenses, setExpenses, settings, setSettings, showToast, onClose, user,
  // Puntos de acople del edificio. Los defaults son los del admin viejo.
  onCreate = createExpense,
  onVoid = voidExpense,
  onFetchSuppliers = fetchSuppliers,
  onSaveSupplier = upsertSupplier,
  // La clasificación USAR es contabilidad de restaurante: una barbería no la
  // carga y el registry decide quién la ve.
  permiteUsar = true,
}) {
  const monthStart = todayISO().slice(0, 7) + "-01";
  const sorted = [...expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const monthExpenses = expenses.filter(e => e.date >= monthStart);
  const byC = monthExpenses.reduce((a, e) => {
    const cat = e.category || "Otros";
    a[cat] = (a[cat] || 0) + (e.amount || 0);
    return a;
  }, {});
  const [showForm, setShowForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [filterCat, setFilterCat] = useState(null);   // categoría activa para filtrar la lista
  const [expanded, setExpanded] = useState(null);     // id del gasto expandido
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidFilter, setVoidFilter] = useState("all"); // 'all' | 'voided' | 'active'


  // Código corto compartido entre original anulado y su reversión
  const voidCode = (e) => {
    const refId = e.voids_expense_id || e.id;
    return "ANL-" + String(refId || "").slice(0, 6).toUpperCase();
  };

  // ID del movimiento vinculado (la otra mitad del asiento)
  const linkedId = (e) => {
    if (e.voids_expense_id) return e.voids_expense_id;
    if (e.voided_at) {
      const rev = expenses.find(x => x.voids_expense_id === e.id);
      return rev?.id || null;
    }
    return null;
  };

  // Saltar a la fila vinculada con scroll + flash
  const jumpToLinked = (e) => {
    const id = linkedId(e);
    if (!id) { showToast("No se encontró el movimiento vinculado"); return; }
    const target = expenses.find(x => x.id === id);
    if (!target) { showToast("Vinculado no disponible"); return; }
    setVoidFilter("all");
    setExpanded(id);
    setTimeout(() => {
      const el = document.getElementById(`expense-row-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ag-flash");
        setTimeout(() => el.classList.remove("ag-flash"), 2200);
      }
    }, 120);
  };

  const canVoid = (e) =>
    !e.voided_at && !e.voids_expense_id && (e.date || "").startsWith(todayISO().slice(0, 7));

  const openVoid = (e) => { setVoidTarget(e); setVoidReason(""); };
  const closeVoid = () => { if (!voiding) { setVoidTarget(null); setVoidReason(""); } };
  const submitVoid = async () => {
    if (!voidTarget || voiding) return;
    setVoiding(true);
    const res = await onVoid({ id: voidTarget.id, reason: voidReason, user });
    setVoiding(false);
    if (!res.ok) {
      const msg = res.errors?.[0] === 'outside_current_month'
        ? "Solo se pueden anular gastos del mes actual"
        : res.errors?.[0] === 'already_voided' ? "Este gasto ya fue anulado"
        : res.errors?.[0] === 'is_a_reversal' ? "No se puede anular una anulacion"
        : "Error al anular";
      showToast(msg);
      return;
    }
    setExpanded(null);
    setExpenses(p => [res.reversal, ...p.map(x => x.id === res.original.id ? res.original : x)]);
    setVoidTarget(null);
    setVoidReason("");
    showToast("Gasto anulado, queda huella en el sistema");
  };

  // Búsqueda por nombre/descripción/proveedor
  const [search, setSearch] = useState("");
  const matchesSearch = (e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (e.description || "").toLowerCase().includes(q)
        || (e.supplier || "").toLowerCase().includes(q)
        || (e.category || "").toLowerCase().includes(q);
  };

  // Base: gastos del mes ordenados desc por fecha
  const monthSorted = [...monthExpenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // Filtros aplicados (categoría + búsqueda + estado anulado)
  const filteredSorted = monthSorted.filter(e => {
    if (filterCat && (e.category || "Otros") !== filterCat) return false;
    if (!matchesSearch(e)) return false;
    if (voidFilter === "voided") {
      const isV = !!e.voided_at;
      const isR = !!e.voids_expense_id;
      if (!isV && !isR) return false;
    }
    return true;
  });

  // Total y conteo (afectados por filtros)
  const tM = filteredSorted.reduce((s, e) => s + (e.amount || 0), 0);
  const monthFilteredCount = filteredSorted.length;

  // Agrupar por fecha para separadores tipo "lunes 12 de mayo"
  const groupedByDate = filteredSorted.reduce((acc, e) => {
    const d = e.date || "sin-fecha";
    if (!acc[d]) acc[d] = [];
    acc[d].push(e);
    return acc;
  }, {});
  const dateKeys = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  // Normaliza description: para compras de materia prima muestra "Compra · proveedor"
  const displayDesc = (e) => {
    if ((e.category || "") === "Materia Prima" && /^Compra/i.test(e.description || "")) {
      return e.supplier ? `Compra · ${e.supplier}` : "Compra de insumos";
    }
    return e.description;
  };

  return (
    <div style={{ padding: "12px 16px 100px", position: "relative", zIndex: 2 }}>
      {/* Header tipo página: título + acciones */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0 14px", gap: 8 }}>
        <div>
          <h1 style={{
            fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0,
            color: "var(--ag-ink)", letterSpacing: "-0.01em",
          }}>Gastos</h1>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {/* Cuentas de pago: viven en perfil → Finanzas → Cuentas y medios
              de pago (unica verdad, 12/jun) */}
          <button
            type="button"
            onClick={() => setShowExport(true)}
            aria-label="Exportar"
            title="Exportar gastos"
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "var(--ag-bg-card)",
              border: "1.5px solid var(--ag-c-prep)",
              color: "var(--ag-c-prep)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "var(--ag-sh-sm)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

      <div>

        {/* Total del mes destacado · click limpia filtro de categoría */}
        <button
          type="button"
          onClick={() => setFilterCat(null)}
          className="ag-card"
          style={{
            padding: "14px 16px", marginBottom: 14,
            textAlign: "center",
            background: "var(--ag-c-orders)", color: "#fff",
            border: 0, width: "100%",
            cursor: filterCat ? "pointer" : "default",
            fontFamily: "inherit",
          }}
          title={filterCat ? "Tocar para ver todas las categorías" : ""}
        >
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {filterCat ? `Filtro: ${filterCat} · tocar para limpiar` : "Total del mes"}
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>
            ${formatInt(tM)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            {monthFilteredCount} gasto{monthFilteredCount !== 1 ? "s" : ""}
          </div>
        </button>

        {/* Categorías del mes (chips scrolleables) */}
        {Object.keys(byC).length > 0 && (
          <div style={{
            display: "flex", gap: 8, marginBottom: 14,
            overflowX: "auto", scrollbarWidth: "none",
            padding: "0 2px 4px",
          }}>
            {/* Card "Anulados" al inicio del scroller — solo aparece si hay anulados/reversiones en el mes */}
            {(() => {
              const voidedCount = monthExpenses.filter(e => e.voided_at || e.voids_expense_id).length;
              if (voidedCount === 0) return null;
              const on = voidFilter === "voided";
              return (
                <button
                  key="__voided__"
                  type="button"
                  onClick={() => setVoidFilter(on ? "all" : "voided")}
                  className="ag-card"
                  style={{
                    padding: "8px 12px 8px 16px", minWidth: 110, flexShrink: 0,
                    boxShadow: `inset 5px 0 0 var(--ag-c-orders), ${on ? "var(--ag-sh-md)" : "var(--ag-sh-sm)"}`,
                    border: on ? "2px solid var(--ag-c-orders)" : undefined,
                    background: on ? "var(--ag-c-orders-soft)" : "var(--ag-bg-card)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  title="Filtrar por movimientos de anulación (originales + reversiones)"
                >
                  <div style={{ fontSize: 10, color: "var(--ag-c-orders)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Anulados{on && " ✓"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ag-c-orders)" }}>
                    {voidedCount}
                  </div>
                </button>
              );
            })()}
            {Object.entries(byC).sort((a, b) => b[1] - a[1]).map(([c, a]) => {
              const cc = colorForCategory(c);
              const active = filterCat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCat(active ? null : c)}
                  className="ag-card"
                  style={{
                    padding: "8px 12px 8px 16px", minWidth: 110, flexShrink: 0,
                    // inset 5px da una barra vertical de color que respeta border-radius (no se clipea como un border-left).
                    // Se combina con la sombra normal del card.
                    boxShadow: `inset 5px 0 0 ${cc.fg}, ${active ? "var(--ag-sh-md)" : "var(--ag-sh-sm)"}`,
                    border: active ? `2px solid ${cc.fg}` : undefined,
                    background: active ? cc.bg : "var(--ag-bg-card)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 10, color: cc.fg, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", opacity: active ? 1 : 0.95 }}>
                    {c}{active && " ✓"}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: cc.fg }}>
                    ${formatInt(a)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* CTA registrar gasto */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <button type="button" className="ag-cta" onClick={() => setShowForm(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Registrar gasto</span>
          </button>
        </div>

        {/* Buscador (filtra la lista en tiempo real) */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 14px", marginBottom: 14,
          background: "var(--ag-bg-card)",
          border: "1px solid var(--ag-line)",
          borderRadius: 12,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ag-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descripción, proveedor o categoría..."
            style={{
              flex: 1, border: 0, outline: "none", background: "transparent",
              color: "var(--ag-ink)", fontFamily: "inherit", fontSize: 13,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpiar búsqueda"
              style={{
                width: 22, height: 22, borderRadius: 999,
                border: 0, background: "var(--ag-bg-soft)",
                color: "var(--ag-ink-3)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit",
              }}
            >✕</button>
          )}
        </div>

        {/* Lista agrupada por fecha · marco rojo arriba en la card global */}
        {filteredSorted.length === 0 ? (
          <EmptyState
            icon="💰"
            text={filterCat ? `Sin gastos en "${filterCat}"` : "Sin gastos registrados"}
          />
        ) : (
          dateKeys.map(d => {
            // Dentro de cada día: ordenar por created_at descendente (más recientes primero)
            const items = [...groupedByDate[d]].sort((a, b) =>
              (b.created_at || "").localeCompare(a.created_at || "")
            );
            const dayLabel = d === "sin-fecha"
              ? "Sin fecha"
              : new Date(d + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
            const dayTotal = items.reduce((s, e) => s + (e.amount || 0), 0);
            return (
              <div key={d} style={{ marginBottom: 14 }}>
                {/* Separador de fecha · total del día en gris (mismo color que la fecha) */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0 4px 6px", fontSize: 11, fontWeight: 700,
                  color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <span>{dayLabel}</span>
                  <span>−${formatInt(dayTotal)}</span>
                </div>
                <div className="ag-card" style={{
                  padding: 0,
                  borderTop: "3px solid var(--ag-c-orders)",
                  overflow: "hidden",
                }}>
                  {items.map((e, i) => {
                    const cc = colorForCategory(e.category);
                    const isExp = expanded === e.id;
                    const typeLabel = e.expense_type === "fixed"        ? "FIJO"
                                    : e.expense_type === "installment"  ? `CUOTA ${e.installment_current || "?"}/${e.installment_total || "?"}`
                                    :                                     null;
                    const typeColor = e.expense_type === "fixed"        ? "var(--ag-c-terra)"
                                    : e.expense_type === "installment"  ? "var(--ag-c-prep)"
                                    :                                     null;
                    const isVoided = !!e.voided_at;
                    const isReversal = !!e.voids_expense_id;
                    const amtNum = Number(e.amount) || 0;
                    return (
                      <div key={e.id} id={`expense-row-${e.id}`} className="ag-flash-target" style={{ borderLeft: `4px solid ${isReversal ? 'var(--ag-c-sales)' : cc.fg}`, opacity: isVoided ? 0.55 : 1, transition: "background-color 0.4s ease" }}>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExp ? null : e.id)}
                          style={{
                            width: "100%", border: 0, background: "transparent",
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 12px",
                            borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
                            cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ag-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isVoided ? "line-through" : "none" }}>
                              {isReversal && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: "var(--ag-c-sales)", padding: "1px 6px", borderRadius: 6, letterSpacing: "0.04em", marginRight: 6 }}>ANULACIÓN</span>}
                              {isVoided && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: "var(--ag-c-orders)", padding: "1px 6px", borderRadius: 6, letterSpacing: "0.04em", marginRight: 6 }}>ANULADO</span>}
                              {(isVoided || isReversal) && <span title="Código del asiento de anulación" style={{ fontSize: 9.5, fontWeight: 800, color: "var(--ag-ink-2)", background: "var(--ag-bg-soft)", padding: "1px 6px", borderRadius: 6, letterSpacing: "0.06em", marginRight: 6, fontFamily: "ui-monospace, monospace" }}>{voidCode(e)}</span>}
                              {displayDesc(e)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--ag-ink-3)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                              {typeLabel && (
                                <span style={{
                                  fontSize: 9.5, fontWeight: 800, color: typeColor,
                                  background: e.expense_type === "fixed" ? "rgba(245,158,11,0.12)" : "rgba(58,139,159,0.14)",
                                  padding: "1px 6px", borderRadius: 6, letterSpacing: "0.04em",
                                }}>{typeLabel}</span>
                              )}
                              <span style={{ color: cc.fg, fontWeight: 700 }}>{e.category || "Otros"}</span>
                              {e.payment_method && (
                                <span>· {paymentIcon(e.payment_method)} {accountLabel(settings, e.payment_account_id) || paymentLabel(e.payment_method)}</span>
                              )}
                              {e.receipt_url && <span title="Con comprobante">📎</span>}
                              {e.no_receipt && <span title="Sin recibo" style={{ color: "var(--ag-c-stock)", fontWeight: 700 }}>SIN REC.</span>}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: amtNum < 0 ? "var(--ag-c-sales)" : "var(--ag-c-orders)", flexShrink: 0 }}>
                            {amtNum < 0 ? `+$${formatInt(Math.abs(amtNum))}` : `−$${formatInt(amtNum)}`}
                          </div>
                        </button>

                        {/* Detalle expandido */}
                        {isExp && (
                          <div style={{
                            padding: "12px 14px 14px 14px",
                            borderTop: "1px solid var(--ag-line)",
                            background: "var(--ag-bg-soft)",
                          }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Categoría</div>
                                <div style={{ color: cc.fg, fontWeight: 700, marginTop: 2 }}>{e.category || "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Tipo</div>
                                <div style={{ color: "var(--ag-ink)", marginTop: 2 }}>
                                  {e.expense_type === "fixed" ? "Fijo"
                                    : e.expense_type === "installment" ? `Cuota ${e.installment_current || "?"} de ${e.installment_total || "?"}`
                                    : "Variable"}
                                </div>
                              </div>
                              {e.supplier && (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Proveedor</div>
                                  <div style={{ color: "var(--ag-ink)", marginTop: 2 }}>{e.supplier}</div>
                                </div>
                              )}
                              {e.payment_method && (
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Medio de pago</div>
                                  <div style={{ color: "var(--ag-ink)", marginTop: 2 }}>{paymentIcon(e.payment_method)} {accountLabel(settings, e.payment_account_id) || paymentLabel(e.payment_method)}</div>
                                </div>
                              )}
                            </div>

                            {/* Items (jsonb) — formato tabla con cantidad y unidad */}
                            {Array.isArray(e.items) && e.items.length > 0 && (
                              <div style={{ marginTop: 14 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                                  Items comprados ({e.items.length})
                                </div>
                                <div style={{ background: "var(--ag-bg-card)", borderRadius: 8, padding: 4 }}>
                                  {e.items.map((it, j) => (
                                    <div key={j} style={{
                                      display: "flex", justifyContent: "space-between", alignItems: "center",
                                      padding: "6px 10px",
                                      borderTop: j === 0 ? "none" : "1px solid var(--ag-line)",
                                      fontSize: 12,
                                    }}>
                                      <span style={{ flex: 1, color: "var(--ag-ink)", fontWeight: 600 }}>{it.name}</span>
                                      <span style={{ color: "var(--ag-ink-2)", marginRight: 12 }}>
                                        {it.qty} {it.unit || ""}
                                      </span>
                                      <span style={{ color: "var(--ag-ink)", fontWeight: 700 }}>
                                        ${formatInt(it.subtotal || (it.qty * (it.unit_cost || 0)))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Items legacy (compras viejas guardadas como string en notes) */}
                            {(!e.items || e.items.length === 0) && e.notes && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                                  Detalle
                                </div>
                                <div style={{ fontSize: 12.5, color: "var(--ag-ink)", lineHeight: 1.4 }}>
                                  {e.notes}
                                </div>
                              </div>
                            )}

                            {/* Quién lo registró */}
                            {e.created_by && (
                              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--ag-line)", fontSize: 11, color: "var(--ag-ink-3)" }}>
                                Registrado por: <span style={{ color: "var(--ag-ink-2)", fontWeight: 600 }}>
                                  {user?.id === e.created_by ? (user.user_metadata?.full_name || user.email || "vos") : (e.created_by.slice(0, 8) + "...")}
                                </span>
                              </div>
                            )}

                            {/* Comprobante */}
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                                Comprobante
                              </div>
                              {e.receipt_url ? (
                                <a href={e.receipt_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block" }}>
                                  <img
                                    src={e.receipt_url}
                                    alt="ticket"
                                    style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, border: "1px solid var(--ag-line)" }}
                                    onError={ev => { ev.target.style.display = "none" }}
                                  />
                                </a>
                              ) : e.no_receipt ? (
                                <span style={{ display: "inline-block", padding: "4px 10px", background: "var(--ag-c-stock-soft)", color: "var(--ag-c-stock)", borderRadius: 999, fontSize: 11, fontWeight: 700, border: "1px dashed var(--ag-c-stock)" }}>
                                  Sin recibo (compra en negro)
                                </span>
                              ) : (
                                <span style={{ fontSize: 11.5, color: "var(--ag-ink-3)", fontStyle: "italic" }}>
                                  No registrado
                                </span>
                              )}
                            </div>

                            {isVoided && (
                              <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(232,90,74,0.08)", border: "1px solid var(--ag-c-orders)", borderRadius: 10, fontSize: 11.5 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                  <div style={{ fontWeight: 700, color: "var(--ag-c-orders)" }}>Gasto anulado · {voidCode(e)}</div>
                                  {linkedId(e) && (
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); jumpToLinked(e); }}
                                      style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--ag-c-orders)", background: "transparent", color: "var(--ag-c-orders)", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                      Ver reversión ↗
                                    </button>
                                  )}
                                </div>
                                <div style={{ color: "var(--ag-ink-2)" }}>
                                  Por <strong>{e.voided_by || "—"}</strong> · {new Date(e.voided_at).toLocaleString("es-AR")}
                                </div>
                                {e.voided_reason && (
                                  <div style={{ color: "var(--ag-ink-2)", marginTop: 4, fontStyle: "italic" }}>
                                    Motivo: "{e.voided_reason}"
                                  </div>
                                )}
                              </div>
                            )}
                            {isReversal && (
                              <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(42,157,110,0.08)", border: "1px solid var(--ag-c-sales)", borderRadius: 10, fontSize: 11.5 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                  <div style={{ fontWeight: 700, color: "var(--ag-c-sales)" }}>Reversión · {voidCode(e)}</div>
                                  {linkedId(e) && (
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); jumpToLinked(e); }}
                                      style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid var(--ag-c-sales)", background: "transparent", color: "var(--ag-c-sales)", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                      Ver original ↗
                                    </button>
                                  )}
                                </div>
                                <div style={{ color: "var(--ag-ink-2)" }}>
                                  Por <strong>{e.voided_by || "—"}</strong>
                                  {e.voided_reason && <> · Motivo: "{e.voided_reason}"</>}
                                </div>
                              </div>
                            )}
                            {canVoid(e) && (
                              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--ag-line)" }}>
                                <button
                                  type="button"
                                  onClick={() => openVoid(e)}
                                  style={{
                                    padding: "8px 14px", borderRadius: 999,
                                    background: "transparent", color: "var(--ag-c-orders)",
                                    border: "1px solid var(--ag-c-orders)",
                                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                                  }}
                                >↺ Anular este gasto</button>
                                <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 6 }}>
                                  Crea un movimiento de reversion. El original queda con marca de anulacion.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

      </div>

      {/* Modal: confirmar anulacion de gasto */}
      {voidTarget && (
        <div onClick={closeVoid} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={ev => ev.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "var(--ag-bg-card)", borderRadius: 16, padding: "20px 18px", boxShadow: "var(--ag-sh-lg)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ag-ink)", marginBottom: 4 }}>Anular gasto</div>
            <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)", marginBottom: 14, lineHeight: 1.4 }}>
              Se va a crear un movimiento de reversion por <strong style={{ color: "var(--ag-c-sales)" }}>+${formatInt(Math.abs(Number(voidTarget.amount) || 0))}</strong> que cancela este gasto. El original no se borra: queda marcado como ANULADO con tu email y la fecha.
            </div>
            <div style={{ padding: "10px 12px", background: "var(--ag-bg-soft)", borderRadius: 10, marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "var(--ag-ink)" }}>{voidTarget.description || "(sin descripcion)"}</div>
              <div style={{ color: "var(--ag-ink-3)", marginTop: 2 }}>
                {voidTarget.date} · {voidTarget.category || "Otros"} · −${formatInt(Number(voidTarget.amount) || 0)}
              </div>
            </div>
            <label className="ag-field-lbl">Motivo (opcional)</label>
            <textarea
              className="ag-field-input"
              value={voidReason}
              onChange={ev => setVoidReason(ev.target.value.slice(0, 500))}
              placeholder="ej: monto incorrecto, gasto duplicado, factura erronea..."
              rows={3}
              maxLength={500}
              style={{ resize: "none", marginBottom: 14, fontFamily: "inherit" }}
            />
            <SlideToConfirm
              danger
              disabled={voiding}
              label="Deslizá para anular"
              loadingLabel="Anulando…"
              successLabel="Anulado ✓"
              onConfirm={submitVoid}
            />
            <button type="button" className="ag-btn-ghost" onClick={closeVoid} disabled={voiding}
              style={{ marginTop: 10, width: "100%", padding: "10px", fontSize: 12.5, color: "var(--ag-ink-3)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal: exportar gastos con filtros (fechas + categorías) */}
      {showExport && (
        <ExpensesExportModal
          expenses={expenses}
          settings={settings}
          onClose={() => setShowExport(false)}
          showToast={showToast}
        />
      )}

      {showForm && (
        <ExpForm
          settings={settings}
          user={user}
          showToast={showToast}
          permiteUsar={permiteUsar}
          onFetchSuppliers={onFetchSuppliers}
          onSaveSupplier={onSaveSupplier}
          onClose={() => setShowForm(false)}
          onSave={async (e) => {
            const saved = await onCreate(e);
            // El service del edificio devuelve {__error, message} en vez de
            // null: sin este chequeo un fallo de validación se festejaba como
            // "Gasto registrado ✓" y la fila no existía.
            if (saved && !saved.__error) {
              setExpenses(p => [saved, ...p]);
              setShowForm(false);
              showToast("Gasto registrado ✓");
            } else {
              setShowForm(false);
              showToast(saved?.message || "Error al registrar");
            }
          }}
        />
      )}
    </div>
  );
}

const FIXED_CATS = ["Alquiler", "Servicios", "Sueldos", "Seguros", "Impuestos", "Equipamiento"];

// ─── Modal de exportación de gastos con filtros (auditoría) ───
function ExpensesExportModal({ expenses, settings, onClose, showToast }) {
  const today = todayISO();
  const currentMonth = today.slice(0, 7);                  // 'YYYY-MM'
  const [mode, setMode] = useState("month");               // 'month' | 'date' | 'category'
  const [selMonth, setSelMonth] = useState(currentMonth);  // YYYY-MM para mode 'month' y 'category'
  const [dateFrom, setDateFrom] = useState(currentMonth + "-01");
  const [dateTo, setDateTo] = useState(today);
  const [selectedCats, setSelectedCats] = useState([]);    // solo aplica en mode 'category'
  const [format, setFormat] = useState("xlsx");

  const allCats = settings?.exp_cats || DEFAULT_SETTINGS.exp_cats;
  const toggleCat = (c) => setSelectedCats(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  const filtered = expenses.filter(e => {
    if (mode === "month") {
      if ((e.date || "").slice(0, 7) !== selMonth) return false;
    } else if (mode === "date") {
      if (e.date < dateFrom || e.date > dateTo) return false;
    } else if (mode === "category") {
      if ((e.date || "").slice(0, 7) !== selMonth) return false;
      if (selectedCats.length === 0) return false; // requiere elegir al menos 1
      if (!selectedCats.includes(e.category || "Otros")) return false;
    }
    return true;
  });

  const doExport = async () => {
    const { downloadCSV, downloadXLSX, printAsPDF } = await import("../../lib/exports");
    const headers = ["Fecha", "Descripción", "Categoría", "Tipo", "Cuota", "Proveedor", "Comprobante", "Monto"];
    const rows = filtered.map(e => [
      e.date || "",
      e.description || "",
      e.category || "",
      e.expense_type === "fixed" ? "Fijo" : e.expense_type === "installment" ? "Cuota" : "Variable",
      e.expense_type === "installment" ? `${e.installment_current || ""}/${e.installment_total || ""}` : "",
      e.supplier || "",
      e.no_receipt ? "Sin recibo" : (e.receipt_url ? "Sí" : "No"),
      e.amount || 0,
    ]);
    const baseName = `gastos_${
      mode === "month"    ? selMonth :
      mode === "date"     ? `${dateFrom}_a_${dateTo}` :
      `${selMonth}_${selectedCats.join("-")}`
    }`;
    const subtitle =
      mode === "month"    ? `Mes ${selMonth}` :
      mode === "date"     ? `${dateFrom} a ${dateTo}` :
                            `${selMonth} · ${selectedCats.join(", ")}`;
    try {
      if (format === "csv")  downloadCSV(`${baseName}.csv`, headers, rows);
      if (format === "xlsx") downloadXLSX(`${baseName}.xlsx`, headers, rows, "Gastos");
      if (format === "pdf")  printAsPDF("Reporte de gastos", headers, rows, {
        bizName: settings?.biz_name || "Dico",
        subtitle,
      });
      showToast?.(`${filtered.length} gastos exportados ✓`);
      onClose();
    } catch (err) {
      showToast?.("Error al exportar: " + err.message);
    }
  };

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="ag-page-over" style={{ zIndex: 910 }}>
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span>Cancelar</span>
        </button>
        <h2 className="ag-page-over-title">Exportar gastos</h2>
      </div>
      <div className="ag-page-over-body">

        {/* Modo de exportación */}
        <label className="ag-field-lbl">¿Qué exportar?</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {[
            { key: "month",    label: "Mes" },
            { key: "date",     label: "Por fecha" },
            { key: "category", label: "Por categorías" },
          ].map(m => {
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  padding: "10px 6px", borderRadius: 10,
                  border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
                  background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
                  color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}
              >{m.label}</button>
            );
          })}
        </div>

        {/* Modo MES → selector de mes */}
        {mode === "month" && (
          <div style={{ marginBottom: 14 }}>
            <label className="ag-field-lbl">Mes a exportar</label>
            <input
              className="ag-field-input"
              type="month"
              value={selMonth}
              onChange={e => setSelMonth(e.target.value)}
              max={currentMonth}
            />
          </div>
        )}

        {/* Modo POR FECHA → desde/hasta */}
        {mode === "date" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label className="ag-field-lbl">Desde</label>
              <input className="ag-field-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
            </div>
            <div>
              <label className="ag-field-lbl">Hasta</label>
              <input className="ag-field-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={today} />
            </div>
          </div>
        )}

        {/* Modo POR CATEGORÍAS → selector mes + chips */}
        {mode === "category" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="ag-field-lbl">Mes a exportar</label>
              <input
                className="ag-field-input"
                type="month"
                value={selMonth}
                onChange={e => setSelMonth(e.target.value)}
                max={currentMonth}
              />
            </div>
            <label className="ag-field-lbl">Categorías</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {allCats.map(c => {
                const on = selectedCats.includes(c);
                const cc = colorForCategory(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCat(c)}
                    style={{
                      padding: "6px 10px", borderRadius: 999,
                      border: on ? `2px solid ${cc.fg}` : "1px solid var(--ag-line)",
                      background: on ? cc.bg : "var(--ag-bg)",
                      color: on ? cc.fg : "var(--ag-ink-2)",
                      fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >{on && "✓ "}{c}</button>
                );
              })}
            </div>
            {selectedCats.length === 0 && (
              <div style={{
                padding: "8px 12px", marginBottom: 12,
                background: "var(--ag-c-stock-soft)",
                color: "var(--ag-c-stock)",
                borderRadius: 8, fontSize: 11.5, fontWeight: 600,
              }}>
                Seleccioná al menos una categoría
              </div>
            )}
          </>
        )}

        {/* Formato */}
        <label className="ag-field-lbl">Formato</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {[
            { key: "xlsx", label: "Excel", icon: "📊" },
            { key: "csv",  label: "CSV",   icon: "📄" },
            { key: "pdf",  label: "PDF",   icon: "🖨" },
          ].map(f => {
            const on = format === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFormat(f.key)}
                style={{
                  padding: "10px 6px", borderRadius: 10,
                  border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
                  background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
                  color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
              >
                <span style={{ fontSize: 16 }}>{f.icon}</span>
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Preview del resultado */}
        <div className="ag-card" style={{
          padding: "12px 14px", background: "var(--ag-bg-card)",
        }}>
          <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginBottom: 2 }}>Se van a exportar</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ag-ink)" }}>
            {filtered.length} gastos · ${formatInt(total)}
          </div>
        </div>

        <button
          type="button"
          className="ag-btn-primary"
          style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: filtered.length > 0 ? 1 : 0.5 }}
          disabled={filtered.length === 0}
          onClick={doExport}
        >⬇ Exportar {filtered.length} gastos</button>

        {/* Volver al pie · evita scrollear arriba para cerrar */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button type="button" className="ag-btn-ghost" onClick={onClose}>← Volver</button>
        </div>
      </div>
    </div>
  );
}

function ExpForm({
  onClose, onSave, settings, user, showToast,
  permiteUsar = true,
  onFetchSuppliers = fetchSuppliers,
  onSaveSupplier = upsertSupplier,
}) {
  // "Materia Prima" y "Packaging" se EXCLUYEN acá: ambos son insumos físicos
  // que se registran via Compras para mantener stock + items + proveedor.
  const CATS_PURCHASE_ONLY = ["Materia Prima", "Packaging"];
  const availableCats = (settings?.exp_cats || DEFAULT_SETTINGS.exp_cats)
    .filter(c => !CATS_PURCHASE_ONLY.includes(c));
  const defaultCat = availableCats[0] || "Servicios";

  const [f, setF] = useState({
    date: todayISO(), description: "", amount: 0,
    category: defaultCat, supplier: "", supplier_id: null, expense_type: "variable",
    // Sin clasificación USAR el campo queda null, no "other_opex": un negocio
    // que no lleva contabilidad de restaurante no tiene por qué declarar que
    // todo es "otros gastos operativos".
    usar_category: permiteUsar ? "other_opex" : null,
    installment_current: 1, installment_total: 12,
    payment_method: "efectivo",
    payment_account_id: null,
  });
  const [err, setErr] = useState("");
  // Proveedores ACTIVOS (los pausados no aparecen) + alta sin salir del gasto
  const [sups, setSups] = useState([]);
  const [newSup, setNewSup] = useState(false);
  useEffect(() => { onFetchSuppliers().then(setSups); }, [onFetchSuppliers]);
  const s = (k, v) => {
    setErr("");
    setF(p => {
      const next = { ...p, [k]: v };
      if (k === "category") next.expense_type = FIXED_CATS.includes(v) ? "fixed" : "variable";
      return next;
    });
  };
  const descOk = f.description.trim().length >= 4;
  const amtOk = (f.amount || 0) > 0;
  const canSave = descOk && amtOk;
  const handleSave = () => {
    if (!descOk) { setErr("La descripción debe tener al menos 4 caracteres."); return; }
    if (!amtOk)  { setErr("El monto debe ser mayor a 0."); return; }
    onSave({ ...f, description: f.description.trim(), created_by: user?.id || null });
  };

  return (
    <div className="ag-page-over" style={{ zIndex: 910 }}>
      <div className="ag-page-over-head">
        <BackButton onClick={onClose} label="Cancelar" />
        <h2 className="ag-page-over-title">Registrar gasto</h2>
      </div>

      <div className="ag-page-over-body">
        <label className="ag-field-lbl">Descripción *</label>
        <input
          className="ag-field-input"
          value={f.description}
          onChange={e => s("description", e.target.value)}
          placeholder="Ej: Pago de luz"
          style={{ marginBottom: 4 }}
        />
        {f.description && !descOk && (
          <p style={{ fontSize: 11, color: "var(--ag-c-orders)", margin: "2px 0 8px 2px" }}>
            Mínimo 4 caracteres · ({f.description.trim().length}/4)
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <div>
            <label className="ag-field-lbl">Monto *</label>
            <DecimalInput
              className="ag-field-input"
              step="0.01"
              value={f.amount}
              onChange={(n) => s("amount", n)}
              placeholder="0"
            />
            {f.amount !== 0 && !amtOk && (
              <p style={{ fontSize: 11, color: "var(--ag-c-orders)", margin: "3px 0 0 2px" }}>Debe ser &gt; 0</p>
            )}
          </div>
          <div>
            <label className="ag-field-lbl">Fecha</label>
            <input
              className="ag-field-input"
              type="date"
              value={f.date}
              onChange={e => s("date", e.target.value)}
            />
          </div>
        </div>

        {permiteUsar && (
          <>
            <label className="ag-field-lbl" style={{ marginTop: 14 }}>Categoría USAR</label>
            <select
              className="ag-field-input"
              value={f.usar_category || ""}
              onChange={e => s("usar_category", e.target.value)}
            >
              {/* Labels en espanol para los grupos USAR (las keys internas no cambian) */}
              {[
                { key: "COGS", label: "Mercadería (COGS)" },
                { key: "Labor", label: "Personal" },
                { key: "OPEX", label: "Gastos operativos (OPEX)" },
              ].map(group => (
                <optgroup key={group.key} label={group.label}>
                  {USAR_EXPENSE_CATEGORIES
                    .filter(c => c.group === group.key)
                    .filter(c => !c.value.startsWith("food_") && c.value !== "packaging")
                    .map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </optgroup>
              ))}
            </select>
            <p style={{ fontSize: 11, color: "var(--ag-ink-3)", margin: "4px 0 12px 2px" }}>
              Comida y packaging se registran en <strong>Compras</strong> (alimentan stock).
            </p>
          </>
        )}

        <label className="ag-field-lbl" style={{ marginTop: 14 }}>Tipo de gasto</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[
            { key: "variable",    label: "Variable",     icon: "📦" },
            { key: "fixed",       label: "Fijo",         icon: "🏠" },
            { key: "installment", label: "Cuota",        icon: "🧩" },
          ].map(t => {
            const on = f.expense_type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => s("expense_type", t.key)}
                style={{
                  padding: "10px 6px", borderRadius: 10,
                  border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
                  background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
                  color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "var(--ag-ink-3)", margin: "4px 0 12px 2px" }}>
          Fijo = alquiler, sueldos, servicios. Variable = materia prima, packaging. Cuota = parte de pago a plazos.
        </p>

        {f.expense_type === "installment" && (
          <div style={{
            padding: "10px 12px",
            background: "var(--ag-bg-card)",
            border: "1px solid var(--ag-c-prep)",
            borderRadius: 10,
            marginBottom: 12,
          }}>
            <label className="ag-field-lbl" style={{ color: "var(--ag-c-prep)" }}>Cuota / plan de pago</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <DecimalInput
                className="ag-field-input"
                min={1} step="1"
                value={f.installment_current}
                onChange={(n) => s("installment_current", n || 1)}
                style={{ width: 80, textAlign: "center" }}
              />
              <span style={{ fontSize: 13, color: "var(--ag-ink-2)", fontWeight: 700 }}>de</span>
              <DecimalInput
                className="ag-field-input"
                min={1} step="1"
                value={f.installment_total}
                onChange={(n) => s("installment_total", n || 1)}
                style={{ width: 80, textAlign: "center" }}
              />
              <span style={{ fontSize: 11.5, color: "var(--ag-ink-3)", flex: 1 }}>
                Ej: cuota {f.installment_current} de {f.installment_total}
              </span>
            </div>
          </div>
        )}

        <label className="ag-field-lbl">Proveedor</label>
        {/* Desplegable de proveedores activos + alta inline (12/jun).
            Antes era texto libre — generaba nombres duplicados. */}
        <select
          className="ag-field-input"
          value={f.supplier_id || ""}
          onChange={e => {
            const v = e.target.value;
            if (v === "__new__") { setNewSup(true); return; }
            const found = sups.find(x => x.id === v);
            // Los dos juntos y en este orden: el id es el vínculo vivo y el
            // nombre es la copia que sobrevive si el proveedor se elimina.
            s("supplier_id", v || null);
            s("supplier", found?.name || "");
          }}
        >
          <option value="">— Sin proveedor —</option>
          {sups.map(sp => (
            <option key={sp.id} value={sp.id}>
              {sp.name}{sp.category ? ` · ${sp.category}` : ""}
            </option>
          ))}
          <option value="__new__">➕ Cargar nuevo proveedor…</option>
        </select>

        <label className="ag-field-lbl" style={{ marginTop: 14 }}>Medio de pago</label>
        <PaymentMethodChips value={f.payment_method} accountId={f.payment_account_id}
          onChange={(m, accId) => { s("payment_method", m); s("payment_account_id", accId ?? null); }} settings={settings} />

        {err && (
          <div style={{
            background: "var(--ag-c-orders-soft)",
            color: "var(--ag-c-orders)",
            fontSize: 12.5, padding: "8px 12px",
            borderRadius: 10, marginTop: 14,
          }}>⚠ {err}</div>
        )}

        <button
          type="button"
          className="ag-btn-primary"
          style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: canSave ? 1 : 0.5 }}
          disabled={!canSave}
          onClick={handleSave}
        >✓ Registrar gasto</button>

        {/* Volver al pie · evita scrollear arriba para cerrar */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button type="button" className="ag-btn-ghost" onClick={onClose}>← Volver</button>
        </div>
      </div>

      {/* Alta de proveedor sin salir del gasto */}
      {newSup && (
        <SupplierForm
          supplier={{ name: "", phone: "", email: "", category: "", notes: "", cuit: "", can_invoice: false, location: "" }}
          onClose={() => setNewSup(false)}
          onSave={async (data) => {
            const saved = await onSaveSupplier(data);
            if (saved?.__error) { showToast?.("Error: " + (saved.message || saved.__error)); return; }
            setSups(p => [...p, saved].sort((a, b) => a.name.localeCompare(b.name)));
            s("supplier_id", saved.id);
            s("supplier", saved.name);
            setNewSup(false);
            showToast?.("Proveedor creado ✓");
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//                           PURCHASE
// ═══════════════════════════════════════════════════════════════
function Purchase({
  ingredients, setIngredients, setExpenses, settings, onClose, showToast, loadAll, user,
  // Registrar la compra entera de una. Null = comportamiento legacy: un bucle
  // de llamadas sueltas (N ajustes de stock + N gastos) sin nada que las ate.
  // El edificio pasa la RPC `register_purchase`, que hace todo en una
  // transacción — si algo falla, no queda mercadería ingresada sin su gasto.
  onRegistrar = null,
  onCrearInsumo = upsertIngredient,
  onFetchSuppliers = fetchSuppliers,
  onSaveSupplier = upsertSupplier,
  // La foto del ticket necesita un bucket de Storage, que el edificio todavía
  // no tiene. Con esto en false la sección no se muestra y no se exige.
  permiteComprobante = true,
}) {
  const [supId, setSupId] = useState("");
  const [supName, setSupName] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [newSup, setNewSup] = useState(false); // alta de proveedor inline
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([]);
  const [sn, setSn] = useState(false);
  const [ni, setNi] = useState({ name: "", unit: "kg", category: "Secos", cost: 0, min_stock: 0 });
  const [receiptUrl, setReceiptUrl] = useState("");
  const [noReceipt, setNoReceipt] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [paymentAccountId, setPaymentAccountId] = useState(null);

  // Cargar proveedores activos al abrir
  useEffect(() => { onFetchSuppliers().then(setSuppliers); }, [onFetchSuppliers]);

  // Si suben foto, desactivar "sin recibo" (son mutuamente excluyentes)
  useEffect(() => { if (receiptUrl && noReceipt) setNoReceipt(false); }, [receiptUrl, noReceipt]);

  // Si seleccionan un proveedor del dropdown, autocompletar supName con su nombre
  useEffect(() => {
    if (supId) {
      const found = suppliers.find(x => x.id === supId);
      if (found) setSupName(found.name);
    }
  }, [supId, suppliers]);

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingReceipt(true);
    const result = await uploadLogoImage(file);
    setUploadingReceipt(false);
    if (result?.__error) { showToast(result.__error); return; }
    if (result) { setReceiptUrl(result); showToast("Ticket cargado ✓"); }
  };

  const add = () => setItems(p => [...p, { ingredient_id: "", qty: 0, unitCost: 0 }]);
  const upd = (i, k, v) => setItems(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const rm = i => setItems(p => p.filter((_, j) => j !== i));
  const sel = (i, id) => {
    const ig = ingredients.find(x => x.id === id);
    upd(i, "ingredient_id", id);
    if (ig) upd(i, "unitCost", ig.cost || 0);
  };

  const cr = async () => {
    if (!ni.name) return;
    const saved = await onCrearInsumo({ ...ni, stock: 0 });
    if (!saved || saved.__error) {
      // El índice único por nombre del edificio cae acá: sin este chequeo el
      // insumo duplicado se anunciaba como creado y no aparecía en la lista.
      showToast(saved?.message || "No se pudo crear el insumo");
      return;
    }
    setIngredients(p => [...p, saved]);
    setSn(false);
    setNi({ name: "", unit: "kg", category: "Secos", cost: 0, min_stock: 0 });
    showToast("Insumo creado: " + saved.name);
  };

  const tot = items.reduce((s, it) => s + (it.qty || 0) * (it.unitCost || 0), 0);

  const sub = async () => {
    const v = items.filter(it => it.ingredient_id && it.qty > 0);
    if (!v.length) return;

    // Camino del edificio: una sola llamada, una sola transacción. El
    // desglose por categoría de alimento lo hace la RPC, no la pantalla.
    if (onRegistrar) {
      const res = await onRegistrar({
        date, items: v,
        supplier: supName, supplierId: supId || null,
        paymentMethod, paymentAccountId,
        receiptUrl: receiptUrl || null, noReceipt,
      });
      if (!res || res.__error) { showToast(res?.message || "No se pudo registrar la compra"); return; }
      if (res.expenses?.length) setExpenses(p => [...res.expenses, ...p]);
      await loadAll();
      showToast("Compra registrada ✓");
      onClose();
      return;
    }

    for (const it of v) {
      await updateIngredientStock(it.ingredient_id, it.qty);
      if (it.unitCost > 0) await upsertIngredient({ id: it.ingredient_id, cost: it.unitCost });
    }
    if (tot > 0) {
      // Desglose por categoria de alimento (Sprint post-4, fix doble conteo):
      // un expense POR categoria con usar_category food_* correcto. Esto:
      //  1. Alimenta el Detector de fugas (Teorico vs Real) con datos reales.
      //  2. Permite que Resultado Operativo y P&L USAR excluyan estos gastos
      //     del bucket de gastos (la comida ya vive en costo de produccion).
      const USAR_BY_FOOD_CAT = {
        protein: 'food_protein', dairy: 'food_dairy', vegetable: 'food_vegetable',
        dry: 'food_dry', beverage: 'food_beverage', packaging: 'packaging',
      };
      const FOOD_CAT_LABEL = {
        protein: 'Proteínas', dairy: 'Lácteos', vegetable: 'Vegetales',
        dry: 'Secos', beverage: 'Bebidas', packaging: 'Packaging',
      };
      const groups = {};
      v.forEach(it => {
        const ig = ingredients.find(x => x.id === it.ingredient_id);
        const fc = ig?.food_category || 'dry';
        if (!groups[fc]) groups[fc] = [];
        groups[fc].push({
          name: ig?.name || '?',
          qty: it.qty || 0,
          unit: ig?.unit || '',
          unit_cost: it.unitCost || 0,
          subtotal: (it.qty || 0) * (it.unitCost || 0),
        });
      });
      for (const [fc, groupItems] of Object.entries(groups)) {
        const groupTotal = groupItems.reduce((s, x) => s + x.subtotal, 0);
        if (groupTotal <= 0) continue;
        const saved = await createExpense({
          date,
          description: `Compra materia prima — ${FOOD_CAT_LABEL[fc] || fc}`,
          notes: '',
          items: groupItems,
          amount: groupTotal,
          category: "Materia Prima",
          usar_category: USAR_BY_FOOD_CAT[fc] || 'food_dry',
          expense_type: 'variable',
          supplier: supName,
          supplier_id: supId || null,
          payment_method: paymentMethod,
          payment_account_id: paymentAccountId || null,
          receipt_url: receiptUrl || '',
          no_receipt: noReceipt,
          created_by: user?.id || null,
        });
        if (saved) setExpenses(p => [saved, ...p]);
      }
    }
    await loadAll();
    showToast("Compra registrada ✓");
    onClose();
  };

  const ic = settings?.ing_cats || DEFAULT_SETTINGS.ing_cats;

  return (
    <div style={{ padding: "12px 16px 100px", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0 14px" }}>
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0,
          color: "var(--ag-ink)", letterSpacing: "-0.01em",
        }}>Registrar compra</h1>
      </div>

      <div>

        {/* Proveedor (dropdown del catálogo) + Fecha */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label className="ag-field-lbl">Proveedor</label>
            <select
              className="ag-field-input"
              value={supId}
              onChange={e => {
                const v = e.target.value;
                if (v === "__new__") { setNewSup(true); return; }
                setSupId(v);
                if (!v) setSupName("");
              }}
            >
              <option value="">— sin especificar —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.category ? ` · ${s.category}` : ""}
                </option>
              ))}
              <option value="__new__">➕ Cargar nuevo proveedor…</option>
            </select>
            <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 3 }}>
              {suppliers.length === 0
                ? "Tu primer proveedor se crea acá mismo con ➕."
                : `${suppliers.length} en catálogo · gestionar en menú ☰ → Proveedores`}
            </div>
          </div>
          <div>
            <label className="ag-field-lbl">Fecha</label>
            <input className="ag-field-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {/* Medio de pago */}
        <div style={{ marginBottom: 14 }}>
          <label className="ag-field-lbl">Medio de pago</label>
          <PaymentMethodChips value={paymentMethod} accountId={paymentAccountId}
            onChange={(m, accId) => { setPaymentMethod(m); setPaymentAccountId(accId ?? null); }} settings={settings} />
        </div>

        {/* Comprobante · uno de los dos es obligatorio (foto o "sin recibo") */}
        {permiteComprobante && (
        <div style={{ marginBottom: 14 }}>
          <label className="ag-field-lbl">
            Comprobante <span style={{ color: "var(--ag-c-orders)" }}>*</span>
          </label>

          {/* Estado 1: foto cargada · muestra preview + acciones */}
          {receiptUrl && (
            <div style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--ag-bg-card)",
              border: "1px solid var(--ag-line)",
            }}>
              <img
                src={receiptUrl}
                alt="ticket"
                style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }}
                onError={e => { e.target.style.display = "none" }}
              />
              <button
                type="button"
                onClick={() => setReceiptUrl("")}
                aria-label="Quitar foto"
                style={{
                  position: "absolute", top: 8, right: 8,
                  width: 30, height: 30, borderRadius: 999,
                  background: "rgba(20,18,16,0.7)", color: "#fff",
                  border: 0, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(4px)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Estado 2: marcado sin recibo · chip claro */}
          {noReceipt && !receiptUrl && (
            <div
              onClick={() => setNoReceipt(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--ag-bg-card)",
                border: "1.5px dashed var(--ag-c-stock)",
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "var(--ag-c-stock)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ag-c-stock)" }}>Sin recibo</div>
                <div style={{ fontSize: 11, color: "var(--ag-ink-3)" }}>Tocá para cambiar</div>
              </div>
            </div>
          )}

          {/* Estado 0: sin foto ni flag → 2 acciones grandes lado a lado */}
          {!receiptUrl && !noReceipt && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label
                className="ag-card"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 6, padding: "16px 10px",
                  border: "1.5px solid var(--ag-c-terra)",
                  background: "var(--ag-bg-card)",
                  color: "var(--ag-c-terra)",
                  cursor: uploadingReceipt ? "wait" : "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                  textAlign: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>{uploadingReceipt ? "Subiendo…" : "Foto del ticket"}</span>
                {/* Sin `capture` → el navegador ofrece elegir entre cámara y archivos */}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleReceiptUpload} disabled={uploadingReceipt} />
              </label>

              <button
                type="button"
                onClick={() => setNoReceipt(true)}
                className="ag-card"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 6, padding: "16px 10px",
                  border: "1.5px solid var(--ag-c-stock)",
                  background: "var(--ag-bg-card)",
                  color: "var(--ag-c-stock)",
                  cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                  textAlign: "center",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                <span>Sin recibo</span>
              </button>
            </div>
          )}
        </div>
        )}

        {/* Items header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ag-ink-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Items ({items.length})
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="ag-btn-ghost" onClick={() => setSn(true)} style={{ padding: "6px 10px", fontSize: 12 }}>
              + Crear
            </button>
            <button type="button" className="ag-btn-primary" onClick={add} style={{ padding: "6px 12px", fontSize: 12 }}>
              + Item
            </button>
          </div>
        </div>

        {/* Crear nuevo insumo (inline) */}
        {sn && (
          <div className="ag-card" style={{
            padding: 12, marginBottom: 12,
            border: "2px solid var(--ag-c-prep)",
            background: "var(--ag-bg-card)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ag-c-prep)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Crear insumo
            </div>
            <label className="ag-field-lbl">Nombre</label>
            <input
              className="ag-field-input"
              placeholder="Ej: Harina 000"
              value={ni.name}
              onChange={e => setNi(p => ({ ...p, name: e.target.value }))}
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label className="ag-field-lbl">Unidad</label>
                <select className="ag-field-input" value={ni.unit} onChange={e => setNi(p => ({ ...p, unit: e.target.value }))}>
                  {["kg", "g", "lt", "ml", "uni"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="ag-field-lbl">Categoría</label>
                <select className="ag-field-input" value={ni.category} onChange={e => setNi(p => ({ ...p, category: e.target.value }))}>
                  {ic.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label className="ag-field-lbl">$ por unidad</label>
                <DecimalInput className="ag-field-input" value={ni.cost} onChange={(n) => setNi(p => ({ ...p, cost: n }))} />
              </div>
              <div>
                <label className="ag-field-lbl">Stock mínimo</label>
                <DecimalInput className="ag-field-input" value={ni.min_stock} onChange={(n) => setNi(p => ({ ...p, min_stock: n }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="ag-btn-ghost" style={{ flex: 1 }} onClick={() => setSn(false)}>Cancelar</button>
              <button type="button" className="ag-btn-primary" style={{ flex: 1 }} onClick={cr}>✓ Crear</button>
            </div>
          </div>
        )}

        {/* Items */}
        {items.map((it, i) => {
          const ig = ingredients.find(x => x.id === it.ingredient_id);
          const unit = ig?.unit || 'unidad';
          return (
            <div key={i} className="ag-card" style={{ padding: 12, marginBottom: 8 }}>
              {/* Header del item: nº + botón quitar a la derecha */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ag-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Item {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => rm(i)}
                  aria-label="Quitar item"
                  className="ag-o-icon-btn"
                  style={{
                    background: 'rgba(232,90,74,0.10)',
                    color: 'var(--ag-c-orders)',
                    width: 26, height: 26,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <select
                className="ag-field-input"
                value={it.ingredient_id}
                onChange={e => sel(i, e.target.value)}
                style={{ marginBottom: 10 }}
              >
                <option value="">Seleccionar insumo...</option>
                {ingredients.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.unit}) — stock: {x.stock || 0}
                  </option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label className="ag-field-lbl">Cantidad ({unit})</label>
                  <DecimalInput className="ag-field-input" value={it.qty} onChange={(n) => upd(i, "qty", n)} />
                </div>
                <div>
                  <label className="ag-field-lbl">Precio por {unit}</label>
                  <DecimalInput className="ag-field-input" value={it.unitCost} onChange={(n) => upd(i, "unitCost", n)} />
                </div>
                <div>
                  <label className="ag-field-lbl">Subtotal</label>
                  <div style={{ padding: "9px 10px", fontWeight: 700, color: "var(--ag-ink)", fontSize: 13 }}>
                    ${formatInt((it.qty || 0) * (it.unitCost || 0))}
                  </div>
                </div>
              </div>
              {ig && (
                <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 6 }}>
                  Stock actual: {ig.stock || 0} {ig.unit} · pasará a {(ig.stock || 0) + (it.qty || 0)} {ig.unit}
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && !sn && (
          <EmptyState icon="📦" text='Tocá "+ Item" para empezar' />
        )}

        {/* Total */}
        {items.length > 0 && (
          <div
            className="ag-card"
            style={{
              textAlign: "center", marginTop: 14, padding: "14px 12px",
              background: "var(--ag-c-terra)", color: "#fff",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: "0.08em" }}>TOTAL</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>
              ${formatInt(tot)}
            </div>
          </div>
        )}

        {(() => {
          const validItems = items.filter(it => it.ingredient_id && it.qty > 0).length > 0;
          // Sin sección de comprobante no hay nada que exigir: pedir una foto
          // que no se puede subir dejaría el botón trabado para siempre.
          const hasProof = !permiteComprobante || !!receiptUrl || noReceipt;
          const canConfirm = validItems && hasProof;
          return (
            <button
              type="button"
              className="ag-btn-primary"
              style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: canConfirm ? 1 : 0.5 }}
              onClick={sub}
              disabled={!canConfirm}
            >
              {canConfirm ? "✓ Confirmar compra" : (!validItems ? "Agregá al menos 1 item" : "Falta comprobante")}
            </button>
          );
        })()}
      </div>

      {/* Alta de proveedor sin salir de la compra */}
      {newSup && (
        <SupplierForm
          supplier={{ name: "", phone: "", email: "", category: "", notes: "", cuit: "", can_invoice: false, location: "" }}
          onClose={() => setNewSup(false)}
          onSave={async (data) => {
            const saved = await onSaveSupplier(data);
            if (saved?.__error) { showToast?.("Error: " + (saved.message || saved.__error)); return; }
            setSuppliers(p => [...p, saved].sort((a, b) => a.name.localeCompare(b.name)));
            setSupId(saved.id);
            setSupName(saved.name);
            setNewSup(false);
            showToast?.("Proveedor creado ✓");
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//                          SALES VIEW
// ═══════════════════════════════════════════════════════════════
function SalesView({ sales, setSales, orders, recipes, overlay, setOverlay, showToast }) {
  const monthStart = todayISO().slice(0, 7) + "-01";
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const ST_DONE = "completed";
  const completedOrders = (orders || []).filter(o => o.status === ST_DONE);

  const allSales = [
    ...completedOrders.map(o => ({
      id: o.id, type: "order", code: formatOrderCode(o.id),
      customer: o.customer || "Sin nombre",
      date: o.date || (o.created_at || "").split("T")[0],
      items: (o.order_items || o.items || []).map(it => {
        const r = recipes.find(x => x.id === it.recipe_id);
        return { name: r?.name || "?", qty: it.quantity || it.qty || 1, price: it.unit_price || 0 };
      }),
      itemCount: (o.order_items || o.items || []).reduce((s, it) => s + (it.quantity || it.qty || 1), 0),
      total: o.total || 0, payment: o.payment || "—", phone: o.phone || "",
      completedAt: o.completedAt || o.created_at || "",
    })),
    ...sales.map(s => {
      const r = recipes.find(x => x.id === s.recipe_id);
      return {
        id: s.id, type: "manual", code: formatOrderCode(s.id),
        customer: "Venta manual",
        date: s.date,
        items: [{ name: r?.name || "?", qty: s.qty || 1, price: s.unit_price || 0 }],
        itemCount: s.qty || 1,
        total: s.total || 0, payment: "—", phone: "",
        completedAt: s.created_at || s.date || "",
      };
    }),
  ].sort((a, b) => (b.completedAt || b.date || "").localeCompare(a.completedAt || a.date || ""));

  const filtered = search.trim()
    ? allSales.filter(s =>
        s.customer.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.items.some(it => it.name.toLowerCase().includes(search.toLowerCase()))
      )
    : allSales;

  const grouped = filtered.reduce((a, s) => {
    const d = s.date || "sin-fecha";
    if (!a[d]) a[d] = [];
    a[d].push(s);
    return a;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const tM = allSales.filter(s => s.date >= monthStart).reduce((a, x) => a + (x.total || 0), 0);
  const countM = allSales.filter(s => s.date >= monthStart).length;

  return (
    <div style={{ padding: "12px 16px 100px", position: "relative", zIndex: 2 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, color: "var(--ag-ink)", letterSpacing: "-0.01em" }}>
            Ventas
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ag-ink-3)" }}>
            Historial de ventas e ingresos
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ag-c-sales)" }}>${formatInt(tM)}</div>
          <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)" }}>{countM} este mes</div>
        </div>
      </div>

      {/* Búsqueda */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", marginBottom: 14,
        background: "var(--ag-bg-card)",
        border: "1px solid var(--ag-line)",
        borderRadius: 12,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ag-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente, código o producto..."
          style={{
            flex: 1, border: 0, outline: "none",
            background: "transparent",
            color: "var(--ag-ink)",
            fontFamily: "inherit", fontSize: 13,
          }}
        />
      </div>

      {/* Lista agrupada por día */}
      {sortedDates.length === 0 ? (
        <EmptyState icon="🛒" text={search ? "Sin resultados" : "Sin ventas registradas"} />
      ) : sortedDates.map(d => {
        const daySales = grouped[d];
        const dayTotal = daySales.reduce((a, s) => a + s.total, 0);
        return (
          <div key={d} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px 8px", fontSize: 11.5, fontWeight: 700, color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>{new Date(d + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}</span>
              <span>{daySales.length} ventas · ${formatInt(dayTotal)}</span>
            </div>
            <div className="ag-card" style={{ padding: 4 }}>
              {daySales.map((s, i) => {
                const isExp = expanded === s.id;
                return (
                  <div key={s.id} style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
                    padding: "10px 10px",
                    cursor: "pointer",
                  }} onClick={() => setExpanded(isExp ? null : s.id)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      {/* Avatar doodle deterministico por nombre (mismo que ve
                          el cliente en el ranking del catalogo) */}
                      <Avatar name={s.customer} size={36} style={{ marginRight: 10, background: "var(--ag-bg-soft)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ag-ink)" }}>{s.customer}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--ag-ink-3)", background: "var(--ag-bg-soft)", padding: "1px 6px", borderRadius: 6, letterSpacing: "0.04em" }}>{s.code}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 2 }}>
                          {s.itemCount} {s.itemCount === 1 ? "item" : "items"}{s.payment !== "—" ? ` · ${s.payment}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ag-c-sales)" }}>${formatInt(s.total)}</div>
                        <div style={{ fontSize: 10, color: "var(--ag-ink-3)" }}>{isExp ? "▲" : "▼"}</div>
                      </div>
                    </div>
                    {isExp && (
                      <div style={{ borderTop: "1px solid var(--ag-line)", padding: "10px 0 2px", marginTop: 8 }}>
                        {s.items.map((it, j) => (
                          <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5, color: "var(--ag-ink-2)" }}>
                            <span>{it.name} × {it.qty}</span>
                            <span style={{ fontWeight: 700 }}>${formatInt(it.qty * it.price)}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid var(--ag-line)", marginTop: 6, fontWeight: 800, fontSize: 13 }}>
                          <span>Total</span><span>${formatInt(s.total)}</span>
                        </div>
                        {s.phone && <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 6 }}>📞 {s.phone}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button type="button" className="ag-btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={e => { e.stopPropagation(); showToast("Impresión de recibo próximamente"); }}>
                            🖨 Recibo
                          </button>
                          <button type="button" className="ag-btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={e => { e.stopPropagation(); showToast("Impresión de factura próximamente"); }}>
                            🧾 Factura
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* CTA centrado al pie */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
        <button type="button" className="ag-cta" onClick={() => setOverlay({ type: "addSale" })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Registrar venta</span>
        </button>
      </div>

      {overlay?.type === "addSale" && (
        <SaleForm
          recipes={recipes}
          onClose={() => setOverlay(null)}
          onSave={async (s) => {
            const saved = await createSale(s);
            if (saved) {
              setSales(p => [saved, ...p]);
              setOverlay(null);
              showToast("Venta registrada ✓");
            }
          }}
        />
      )}
    </div>
  );
}

function SaleForm({ recipes, onClose, onSave }) {
  const [ri, setRi] = useState("");
  const [q, setQ]   = useState(1);
  const [p, setP]   = useState(0);
  const [d, setD]   = useState(todayISO());
  const r = recipes.find(x => x.id === ri);

  useEffect(() => { if (r) setP(r.sale_price || 0); }, [r]);

  const canSave = ri && q > 0 && p > 0;

  return (
    <div className="ag-page-over" style={{ zIndex: 910 }}>
      <div className="ag-page-over-head">
        <BackButton onClick={onClose} label="Cancelar" />
        <h2 className="ag-page-over-title">Registrar venta</h2>
      </div>

      <div className="ag-page-over-body">
        <label className="ag-field-lbl">Producto *</label>
        <select className="ag-field-input" value={ri} onChange={e => setRi(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">Seleccionar producto...</option>
          {recipes.map(r2 => <option key={r2.id} value={r2.id}>{r2.name} — ${formatInt(r2.sale_price)}</option>)}
        </select>

        <label className="ag-field-lbl">Fecha</label>
        <input className="ag-field-input" type="date" value={d} onChange={e => setD(e.target.value)} style={{ marginBottom: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label className="ag-field-lbl">Cantidad</label>
            <DecimalInput className="ag-field-input" min={1} step="1" value={q} onChange={(n) => setQ(n)} />
          </div>
          <div>
            <label className="ag-field-lbl">$ por unidad</label>
            <DecimalInput className="ag-field-input" value={p} onChange={(n) => setP(n)} />
          </div>
        </div>

        {canSave && (
          <div
            className="ag-card"
            style={{
              background: "var(--ag-c-sales)", color: "#fff",
              textAlign: "center", padding: "14px 12px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: "0.08em" }}>TOTAL</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>
              ${formatInt(q * p)}
            </div>
          </div>
        )}

        <button
          type="button"
          className="ag-btn-primary"
          style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: canSave ? 1 : 0.5 }}
          disabled={!canSave}
          onClick={() => canSave && onSave({ date: d, recipe_id: ri, qty: q, unit_price: p, total: q * p })}
        >✓ Registrar venta</button>
      </div>
    </div>
  );
}

export { Expenses, Purchase, SalesView };
