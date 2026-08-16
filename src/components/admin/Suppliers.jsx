/**
 * Suppliers.jsx — gestión de proveedores (jun 2026, v2).
 *
 * Cards con la ficha completa (CUIT, factura o no, ubicación, notas),
 * burbujas de contacto directo (llamar / WhatsApp / email) y botón
 * pause/play: pausado va al fondo de la lista y NO aparece como opción
 * al cargar gastos ni compras.
 *
 * SupplierForm se exporta: lo reusa Finanzas para crear un proveedor
 * sin salir del formulario de gasto/compra.
 *
 * Accesible desde el menú ☰ → Proveedores.
 * Migraciones: 20260525_suppliers_and_receipts.sql,
 *              20260612_suppliers_cuit_invoice_location.sql
 *
 * ETAPA 3 del edificio: los cuatro accesos a la base se inyectan por prop con
 * default legacy, así que el admin viejo no cambia en nada. El edificio pasa
 * los suyos (platformSuppliers.js), que filtran por tenant.
 */
import { useConfirm } from "../ConfirmSlideProvider";
import { useState, useEffect, useCallback } from "react";
import { fetchSuppliers, upsertSupplier, deleteSupplier, toggleSupplierActive } from "../../services/suppliers";
import ToggleSwitch from "./shared/forms/ToggleSwitch";

const DEFAULT_CATEGORIES = [
  "Carnicería", "Verdulería", "Almacén", "Lácteos",
  "Panadería", "Bebidas", "Limpieza", "Packaging",
  "Servicios", "Equipamiento", "Otros",
];

/* Burbuja de contacto directo (tel: / wa.me / mailto:) */
function ContactBubble({ href, label, children }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      aria-label={label}
      title={label}
      onClick={e => e.stopPropagation()}
      style={{
        width: 34, height: 34, borderRadius: 999, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--ag-bg-soft)", border: "1px solid var(--ag-line)",
        color: "var(--ag-ink-2)", textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

export default function Suppliers({
  onBack, showToast,
  // Puntos de acople del edificio. Los defaults son los del admin viejo.
  onFetch = fetchSuppliers,
  onSave = upsertSupplier,
  onToggle = toggleSupplierActive,
  onDelete = deleteSupplier,
  // asPage: renderizar como pantalla comun en vez de overlay full-screen.
  // `.ag-page-over` esconde el topbar y el bottom nav mientras exista en el
  // DOM (regla de admin-shared.css). En el panel del edificio esto es una
  // pestaña, no un takeover: sin esto el usuario se queda sin barra ni
  // engranaje, que es exactamente el bug del 16/ago.
  asPage = false,
}) {
  const confirmSlide = useConfirm();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    // Todos (activos primero, pausados al fondo — lo ordena el servicio)
    const data = await onFetch({ activeOnly: false });
    setList(data);
    setLoading(false);
  }, [onFetch]);
  useEffect(() => { load(); }, [load]);

  const filtered = list.filter(s =>
    !search.trim() ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const togglePause = async (s) => {
    const r = await onToggle(s.id, !s.is_active);
    if (r?.__error) { showToast?.("Error: " + (r.message || r.__error)); return; }
    showToast?.(s.is_active ? `${s.name} pausado — no aparece al cargar gastos` : `${s.name} activo de nuevo ✓`);
    await load();
  };

  return (
    <div
      className={asPage ? undefined : "ag-page-over"}
      style={asPage ? { padding: "12px 16px 100px", position: "relative", zIndex: 2 } : undefined}
    >
      {asPage ? (
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22,
          margin: "4px 0 14px", color: "var(--ag-ink)", letterSpacing: "-0.01em",
        }}>Proveedores</h1>
      ) : (
        <div className="ag-page-over-head">
          <button type="button" className="ag-subpage-back" onClick={onBack} aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Atrás</span>
          </button>
          <h2 className="ag-page-over-title">Proveedores</h2>
        </div>
      )}

      <div className={asPage ? undefined : "ag-page-over-body"}>

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
            placeholder="Buscar proveedor..."
            style={{
              flex: 1, border: 0, outline: "none", background: "transparent",
              color: "var(--ag-ink)", fontFamily: "inherit", fontSize: 13,
            }}
          />
        </div>

        {/* CTA agregar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <button
            type="button"
            className="ag-cta"
            onClick={() => setEditing({ name: "", phone: "", email: "", category: "", notes: "", cuit: "", can_invoice: false, location: "" })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Nuevo proveedor</span>
          </button>
        </div>

        {/* Lista de cards */}
        {loading ? (
          <div className="ag-card" style={{ padding: 28, textAlign: "center", color: "var(--ag-ink-3)", fontSize: 13 }}>
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="ag-card" style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🚚</div>
            <div style={{ color: "var(--ag-ink-3)", fontSize: 13 }}>
              {search ? "Sin resultados" : "Sin proveedores. Creá el primero."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((s) => {
              const phoneDigits = (s.phone || "").replace(/\D/g, "");
              const paused = !s.is_active;
              return (
                <div
                  key={s.id}
                  className="ag-card"
                  style={{ padding: "13px 14px", opacity: paused ? 0.55 : 1, position: "relative" }}
                >
                  {/* Fila principal: avatar + nombre + pause/play */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0, border: 0, background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                    >
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: "var(--ag-c-prep-soft)", color: "var(--ag-c-prep)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 15, flexShrink: 0,
                      }}>
                        {(s.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ag-ink)" }}>{s.name}</span>
                          {paused && (
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "var(--ag-bg-soft)", color: "var(--ag-ink-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pausado</span>
                          )}
                          {s.can_invoice ? (
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "var(--ag-c-sales-soft)", color: "var(--ag-c-sales)" }}>FACTURA</span>
                          ) : (
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--ag-bg-soft)", color: "var(--ag-ink-3)" }}>sin factura</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginTop: 2 }}>
                          {s.category || "Sin categoría"}
                          {s.cuit ? ` · CUIT ${s.cuit}` : ""}
                        </div>
                        {s.location && (
                          <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            📍 {s.location}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Pause (activo) / Play (pausado) */}
                    <button
                      type="button"
                      onClick={() => togglePause(s)}
                      aria-label={paused ? `Activar ${s.name}` : `Pausar ${s.name}`}
                      title={paused ? "Activar proveedor" : "Pausar proveedor (no aparece al cargar gastos)"}
                      style={{
                        width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                        border: `1.5px solid ${paused ? "var(--ag-c-sales)" : "var(--ag-line)"}`,
                        background: paused ? "var(--ag-c-sales-soft)" : "var(--ag-bg-soft)",
                        color: paused ? "var(--ag-c-sales)" : "var(--ag-ink-2)",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {paused ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <polygon points="6 3 21 12 6 21" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <rect x="5" y="3" width="5" height="18" rx="1.5" />
                          <rect x="14" y="3" width="5" height="18" rx="1.5" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Burbujas de contacto directo */}
                  {(phoneDigits || s.email) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, paddingLeft: 54 }}>
                      {phoneDigits && (
                        <ContactBubble href={`tel:+${phoneDigits}`} label={`Llamar a ${s.name}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </ContactBubble>
                      )}
                      {phoneDigits && (
                        <ContactBubble href={`https://wa.me/${phoneDigits}`} label={`WhatsApp a ${s.name}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.064 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.57-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
                          </svg>
                        </ContactBubble>
                      )}
                      {s.email && (
                        <ContactBubble href={`mailto:${s.email}`} label={`Email a ${s.name}`}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                          </svg>
                        </ContactBubble>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <SupplierForm
          supplier={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const saved = await onSave(data);
            if (saved?.__error) { showToast?.("Error: " + (saved.message || saved.__error)); return; }
            showToast?.(data.id ? "Proveedor actualizado ✓" : "Proveedor creado ✓");
            setEditing(null);
            await load();
          }}
          onDelete={async () => {
            const ok = await confirmSlide({ title: `Eliminar a ${editing.name}`, body: "Se borra del catálogo. Sus gastos históricos conservan el nombre. Si solo querés que no aparezca, mejor pausalo.", label: "Deslizá para eliminar" });
            if (!ok) return;
            const r = await onDelete(editing.id);
            if (r?.__error) { showToast?.("Error: " + (r.message || r.__error)); return; }
            showToast?.("Proveedor eliminado");
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Formulario de proveedor (crear/editar). EXPORTADO: Finanzas lo reusa
 * para "➕ Nuevo proveedor" sin salir del formulario de gasto/compra.
 */
export function SupplierForm({ supplier, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...supplier });
  const isNew = !supplier.id;
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));
  const canSave = (f.name || "").trim().length >= 2;

  return (
    <div className="ag-page-over" style={{ zIndex: 960 }}>
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span>Cancelar</span>
        </button>
        <h2 className="ag-page-over-title">{isNew ? "Nuevo proveedor" : "Editar proveedor"}</h2>
      </div>

      <div className="ag-page-over-body">
        <label className="ag-field-lbl">Nombre *</label>
        <input
          className="ag-field-input"
          value={f.name || ""}
          onChange={e => s("name", e.target.value)}
          placeholder="Ej: Carnicería La Esquina"
          style={{ marginBottom: 12 }}
          autoFocus
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="ag-field-lbl">Categoría</label>
            <select
              className="ag-field-input"
              value={f.category || ""}
              onChange={e => s("category", e.target.value)}
            >
              <option value="">Sin categoría</option>
              {DEFAULT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="ag-field-lbl">CUIT</label>
            <input
              className="ag-field-input"
              value={f.cuit || ""}
              onChange={e => s("cuit", e.target.value.replace(/[^\d-]/g, "").slice(0, 13))}
              placeholder="30-12345678-9"
              inputMode="numeric"
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <ToggleSwitch
            checked={!!f.can_invoice}
            onChange={v => s("can_invoice", v)}
            label="Este proveedor factura"
            hint="Te entrega factura A/B/C por sus ventas. Importa para tu contabilidad e IVA."
          />
        </div>

        <label className="ag-field-lbl">Ubicación</label>
        <input
          className="ag-field-input"
          value={f.location || ""}
          onChange={e => s("location", e.target.value.slice(0, 120))}
          placeholder="Ej: Mercado Central, puesto 14 · o dirección"
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label className="ag-field-lbl">Teléfono / WhatsApp</label>
            <input
              className="ag-field-input"
              value={f.phone || ""}
              onChange={e => s("phone", e.target.value)}
              placeholder="549..."
              inputMode="tel"
            />
          </div>
          <div>
            <label className="ag-field-lbl">Email</label>
            <input
              className="ag-field-input"
              type="email"
              value={f.email || ""}
              onChange={e => s("email", e.target.value)}
              placeholder="proveedor@..."
            />
          </div>
        </div>

        <label className="ag-field-lbl">Notas</label>
        <textarea
          className="ag-field-input"
          value={f.notes || ""}
          onChange={e => s("notes", e.target.value)}
          placeholder="Días de entrega, mínimos de compra, condición de pago…"
          rows={3}
          style={{ resize: "vertical", minHeight: 70, fontFamily: "inherit" }}
        />

        <button
          type="button"
          className="ag-btn-primary"
          style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: canSave ? 1 : 0.5 }}
          disabled={!canSave}
          onClick={() => canSave && onSave(f)}
        >✓ {isNew ? "Crear proveedor" : "Guardar cambios"}</button>

        {!isNew && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              marginTop: 10, width: "100%", padding: "12px",
              background: "transparent",
              color: "var(--ag-c-orders)",
              border: "1px solid var(--ag-c-orders)",
              borderRadius: 999,
              fontFamily: "inherit", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}
          >🗑 Eliminar proveedor</button>
        )}
      </div>
    </div>
  );
}
