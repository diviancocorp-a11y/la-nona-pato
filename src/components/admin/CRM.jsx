/**
 * CRM.jsx — Clientes con stats, breakdown, ranking + trend, multi-select y promos.
 *
 * Modales:
 *   - CRMExportModal: filtros (consumo / ubicación / actividad / edad) + formato
 *   - PromoFidelidadModal: solo CUPÓN (% / 2x1 / otro) + medio + envío vía bot
 */
import { useState, useEffect, useMemo } from "react";
import { formatInt, todayISO, waLink } from "../../lib/utils";
import { fetchCustomerStats } from "../../lib/adminService";
import { paymentLabel, paymentIcon } from "../../lib/payments";
import { fetchCoupons, createCustomerCoupon, describeCoupon } from "../../services/coupons";
import { fetchSettings, updateSettings } from "../../services/settings";
import DecimalInput from "../ui/DecimalInput";

const CRM_PER_PAGE = 30;
const DANGEROUS_PCT = 50;
const ADMIN_PIN = "4477";

const customerKey = (c) => `${c.email || ""}|${c.phone || ""}|${c.name || ""}`;

function computeTrend(custKey, ordersByCustomer) {
  const list = ordersByCustomer[custKey] || [];
  if (list.length < 2) return "flat";
  const now = Date.now();
  const D30 = 30 * 24 * 60 * 60 * 1000;
  const D60 = 60 * 24 * 60 * 60 * 1000;
  let count30 = 0, count60to30 = 0, amount30 = 0, amount60to30 = 0;
  const intervals = [];
  const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i];
    const ts = new Date(o.created_at).getTime();
    const ageMs = now - ts;
    if (ageMs <= D30) { count30++; amount30 += o.total || 0; }
    else if (ageMs <= D60) { count60to30++; amount60to30 += o.total || 0; }
    if (i > 0) {
      const prevTs = new Date(sorted[i - 1].created_at).getTime();
      intervals.push((ts - prevTs) / (24 * 60 * 60 * 1000));
    }
  }
  let score = 0;
  if (count30 > count60to30) score++;
  else if (count30 < count60to30) score--;
  if (amount30 > amount60to30 * 1.1) score++;
  else if (amount30 < amount60to30 * 0.9) score--;
  if (intervals.length > 0) {
    const lastTs = new Date(sorted[sorted.length - 1].created_at).getTime();
    const daysSinceLast = (now - lastTs) / (24 * 60 * 60 * 1000);
    const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    if (daysSinceLast < avgInterval * 0.7) score++;
    else if (daysSinceLast > avgInterval * 1.5) score--;
  }
  if (score >= 1) return "up";
  if (score <= -1) return "down";
  return "flat";
}

function parseLocation(address) {
  if (!address) return { ciudad: null, zona: null };
  const segments = address.split(",").map(s => s.trim()).filter(Boolean);
  if (segments.length < 2) return { ciudad: null, zona: null };
  const ciudad = segments[segments.length - 1];
  const zona = segments.length >= 3 ? segments[segments.length - 2] : null;
  return { ciudad, zona };
}

// `onFetchStats` inyectable con default legacy (este componente cargaba
// solo). `permiteCumple` y `permitePromos` apagan lo que depende de piezas
// que el edificio no tiene: el cumple usa customers.birth_date + la edge
// function birthday-gift, y las promos crean cupones con el shape legacy
// (kind/label). Defaults en true: el admin viejo no cambia en nada.
function CRM({ orders, showToast, onFetchStats = fetchCustomerStats, permiteCumple = true, permitePromos = true }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showExport, setShowExport] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showPromo, setShowPromo] = useState(false);

  useEffect(() => {
    onFetchStats().then(c => { setCustomers(c); setLoading(false); });
  }, [onFetchStats]);

  const ordersByCustomer = useMemo(() => {
    const map = {};
    (orders || []).filter(o => o.status !== "cancelled").forEach(o => {
      const k = `${o.email || ""}|${o.phone || ""}|${o.customer || ""}`;
      if (!map[k]) map[k] = [];
      map[k].push(o);
    });
    return map;
  }, [orders]);

  const customersRanked = useMemo(() => {
    const sorted = [...customers].sort((a, b) => (b.total || 0) - (a.total || 0));
    return sorted.map((c, i) => ({
      ...c,
      _key: customerKey(c),
      _rank: i + 1,
      _trend: computeTrend(customerKey(c), ordersByCustomer),
    }));
  }, [customers, ordersByCustomer]);

  const toggleSelect = (key) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectedCustomers = useMemo(
    () => customersRanked.filter(c => selectedIds.has(c._key)),
    [customersRanked, selectedIds]
  );

  const payMethods = useMemo(() => {
    const m = {};
    (orders || []).filter(o => o.status !== "cancelled").forEach(o => {
      const p = o.payment || o.payment_method || "otro";
      m[p] = (m[p] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [orders]);
  const totalPayCount = payMethods.reduce((a, x) => a + x[1], 0);

  const totalFacturado = useMemo(
    () => customers.reduce((a, c) => a + (c.total || 0), 0),
    [customers]
  );

  const filt = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customersRanked;
    return customersRanked.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  }, [customersRanked, search]);
  const filtPaged = useMemo(() => filt.slice(0, page * CRM_PER_PAGE), [filt, page]);

  if (loading) {
    return (
      <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ag-ink-3)", fontSize: 13 }}>
        Cargando clientes…
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px 6px", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, color: "var(--ag-ink)", letterSpacing: "-0.01em", lineHeight: 1.1 }}>CRM · Clientes</h1>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ag-ink-3)" }}>Registro automático de cada pedido</p>
        </div>
        {customers.length > 0 && (
          <button type="button" onClick={() => setShowExport(true)} aria-label="Exportar clientes" title="Exportar clientes"
            style={{ width: 36, height: 36, borderRadius: 999, background: "var(--ag-bg-card)", border: "1.5px solid var(--ag-c-prep)", color: "var(--ag-c-prep)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "var(--ag-sh-sm)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div className="ag-card" style={{ padding: "12px 14px", borderTop: "3px solid var(--ag-c-crm)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Clientes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ag-c-crm)", lineHeight: 1.1 }}>{customers.length}</div>
        </div>
        <div className="ag-card" style={{ padding: "12px 14px", borderTop: "3px solid var(--ag-c-sales)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Facturado</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ag-c-sales)", lineHeight: 1.1 }}>${formatInt(totalFacturado)}</div>
        </div>
      </div>

      {payMethods.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ag-ink-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Métodos de pago</div>
          <div className="ag-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            {payMethods.map(([method, count], i) => {
              const pct = totalPayCount > 0 ? (count / totalPayCount * 100) : 0;
              return (
                <div key={method} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i === 0 ? "none" : "1px solid var(--ag-line)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--ag-bg-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{paymentIcon(method)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ag-ink)" }}>{paymentLabel(method)}</div>
                    <div style={{ height: 4, background: "var(--ag-bg-soft)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: "var(--ag-c-crm)", borderRadius: 999 }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ag-ink)" }}>{count}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)" }}>{pct.toFixed(0)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {permiteCumple && <BirthdayGiftConfig showToast={showToast} />}

      <div style={{ position: "relative", marginBottom: 10 }}>
        <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ag-ink-3)", pointerEvents: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input className="ag-field-input" placeholder="Buscar cliente..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginBottom: 8, fontWeight: 600 }}>
        {filt.length} cliente{filt.length !== 1 ? "s" : ""}{search && " · filtrado"}
      </div>

      {filt.length === 0 ? (
        <div className="ag-card" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
          <div style={{ color: "var(--ag-ink-3)", fontSize: 13 }}>
            {search ? `Sin resultados para "${search}"` : "Sin clientes registrados"}
          </div>
        </div>
      ) : (
        <>
          <div className="ag-card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
            {filtPaged.map((c, i) => {
              const isSelected = selectedIds.has(c._key);
              const trendMeta = c._trend === "up"
                ? { color: "var(--ag-c-sales)", bg: "var(--ag-c-sales-soft)", icon: "▲" }
                : c._trend === "down"
                ? { color: "var(--ag-c-orders)", bg: "var(--ag-c-orders-soft)", icon: "▼" }
                : { color: "var(--ag-ink-3)", bg: "var(--ag-bg-soft)", icon: "▬" };
              const waHref = waLink(c.phone);
              return (
                <div key={c._key + "-" + i} onClick={() => permitePromos && toggleSelect(c._key)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 14px",
                    borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
                    borderLeft: isSelected ? "3px solid var(--ag-c-prep)" : "3px solid transparent",
                    background: isSelected ? "rgba(58,139,159,0.06)" : "transparent",
                    cursor: "pointer", transition: "background 0.15s",
                  }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 999,
                      background: isSelected ? "var(--ag-c-prep)" : "var(--ag-c-crm-soft)",
                      color: isSelected ? "#fff" : "var(--ag-c-crm)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, transition: "all 0.15s",
                    }}>
                      {isSelected ? "✓" : "#" + c._rank}
                    </div>
                    {!isSelected && (
                      <div style={{
                        position: "absolute", bottom: -2, right: -2,
                        width: 16, height: 16, borderRadius: 999,
                        background: trendMeta.bg, color: trendMeta.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 900, lineHeight: 1,
                        border: "1.5px solid var(--ag-bg-card)",
                      }} title={"Tendencia: " + (c._trend === "up" ? "Subiendo" : c._trend === "down" ? "Bajando" : "Estable")}>
                        {trendMeta.icon}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ag-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name || "Sin nombre"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {c.phone && (
                        <>
                          <a href={"tel:" + c.phone} onClick={e => e.stopPropagation()} title="Llamar"
                            style={{ color: "var(--ag-c-prep)", textDecoration: "none", fontWeight: 600 }}>
                            📱 {c.phone}
                          </a>
                          {waHref && <a href={waHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="WhatsApp"
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 999, background: "var(--ag-c-sales)", color: "#fff", textDecoration: "none", flexShrink: 0 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.88 11.89L4 20l4.22-1.11a7.93 7.93 0 0 0 3.83.98h.01a7.94 7.94 0 0 0 7.94-7.94 7.9 7.9 0 0 0-2.4-5.6zm-5.56 12.2a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.25-3.51 6.6 6.6 0 0 1-6.66 6.6zm3.62-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.45.1-.13.2-.51.64-.62.77-.12.13-.23.15-.43.05-.2-.1-.84-.31-1.6-.99-.59-.53-.99-1.18-1.1-1.38-.12-.2-.01-.31.09-.41.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.39-.33-.34-.45-.34l-.39-.01c-.13 0-.35.05-.53.25-.18.2-.7.69-.7 1.67 0 .99.72 1.94.82 2.07.1.13 1.42 2.17 3.44 3.04.48.21.86.33 1.15.42.48.15.92.13 1.27.08.39-.06 1.17-.48 1.34-.94.17-.46.17-.86.12-.94-.05-.08-.18-.13-.38-.23z"/></svg>
                          </a>}
                        </>
                      )}
                      {c.email && (
                        <a href={"mailto:" + c.email} onClick={e => e.stopPropagation()} title="Enviar email"
                          style={{ color: "var(--ag-c-prep)", textDecoration: "none", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
                          ✉ {c.email}
                        </a>
                      )}
                    </div>
                    {c.last_order && (
                      <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 3 }}>
                        Último: {new Date(c.last_order).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ag-c-sales)" }}>${formatInt(c.total)}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)" }}>{c.orders} ped.</div>
                  </div>
                </div>
              );
            })}
          </div>

          {filtPaged.length < filt.length && (
            <button type="button" onClick={() => setPage(p => p + 1)} className="ag-btn-ghost"
              style={{ width: "100%", padding: "12px", fontSize: 13 }}>
              Cargar más ({filt.length - filtPaged.length} restantes)
            </button>
          )}
        </>
      )}

      {showExport && (
        <CRMExportModal customers={customersRanked} onClose={() => setShowExport(false)} showToast={showToast} />
      )}

      {permitePromos && selectedIds.size > 0 && !showPromo && (
        <div style={{
          position: "fixed", bottom: "calc(var(--ag-bottom-nav-h, 76px) + 12px)",
          left: 12, right: 12, maxWidth: 580, marginLeft: "auto", marginRight: "auto",
          background: "var(--ag-c-terra)", color: "#fff", borderRadius: 16,
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
          boxShadow: "var(--ag-sh-lg)", zIndex: 12,
          animation: "ag-page-over-in 220ms var(--ag-ease)",
        }}>
          <button type="button" onClick={clearSelection} aria-label="Limpiar selección"
            style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(255,255,255,0.18)", color: "#fff", border: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>SELECCIONADOS</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{selectedIds.size} cliente{selectedIds.size !== 1 ? "s" : ""}</div>
          </div>
          <button type="button" onClick={() => setShowPromo(true)}
            style={{ padding: "10px 14px", background: "#fff", color: "var(--ag-c-terra)", border: 0, borderRadius: 12, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            🎁 Promo Fidelidad
          </button>
        </div>
      )}

      {permitePromos && showPromo && (
        <PromoFidelidadModal selected={selectedCustomers} onClose={() => setShowPromo(false)} showToast={showToast} onSent={() => { setShowPromo(false); clearSelection(); }} />
      )}
    </div>
  );
}

/**
 * BirthdayGiftConfig — gestiona el premio de cumpleanos desde el CRM.
 * Guarda settings.birthday_coupon_pct (0 = apagado). El catalogo le muestra
 * al cliente una tarjeta-regalo el dia de su cumple (customers.birth_date,
 * validado server-side por la edge function birthday-gift) con un cupon
 * unico por anio que vence ese mismo dia.
 */
function BirthdayGiftConfig({ showToast }) {
  const [pct, setPct] = useState(null);   // null = cargando
  const [draft, setDraft] = useState("");
  const [sett, setSett] = useState(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchSettings().then(s => {
      setSett(s);
      const v = Number(s?.birthday_coupon_pct ?? 0);
      setPct(v);
      setDraft(String(v));
    });
  }, []);

  const save = async () => {
    const v = Math.max(0, Math.min(100, Math.round(Number(draft) || 0)));
    setSaving(true);
    const updated = await updateSettings({ ...sett, birthday_coupon_pct: v });
    setSaving(false);
    if (updated) {
      setSett(updated);
      setPct(v);
      setDraft(String(v));
      showToast?.(v > 0 ? `Regalo de cumpleaños: ${v}% activo 🎂` : "Regalo de cumpleaños desactivado");
    } else {
      showToast?.("No se pudo guardar. Probá de nuevo.");
    }
  };

  const active = pct !== null && pct > 0;

  return (
    <div className="ag-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16, borderTop: "3px solid var(--ag-c-terra)" }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--ag-bg-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🎂</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ag-ink)" }}>Regalo de cumpleaños</div>
          <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 1 }}>
            {pct === null ? "Cargando…" : active ? `Cupón del ${pct}% el día del cumple del cliente` : "Desactivado"}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999, flexShrink: 0,
          background: active ? "rgba(94,160,94,0.14)" : "var(--ag-bg-soft)",
          color: active ? "var(--ag-c-sales)" : "var(--ag-ink-3)" }}>
          {pct === null ? "…" : active ? "ACTIVO" : "OFF"}
        </div>
        <span style={{ color: "var(--ag-ink-3)", fontSize: 11, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--ag-line)" }}>
          <p style={{ fontSize: 11.5, color: "var(--ag-ink-3)", lineHeight: 1.5, margin: "10px 0 12px" }}>
            Los clientes que cargaron su fecha de cumpleaños ven una tarjeta-regalo al entrar al catálogo
            ese día: deslizan para abrirla y reciben un cupón de descuento único que vence esa misma noche.
            Poné 0 para desactivar el regalo.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", width: 110 }}>
              <DecimalInput className="ag-field-input" value={draft} onChange={setDraft} placeholder="10" />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--ag-ink-3)", fontWeight: 700, pointerEvents: "none" }}>%</span>
            </div>
            <button type="button" onClick={save} disabled={saving || pct === null}
              style={{ padding: "10px 18px", borderRadius: 12, border: 0, background: "var(--ag-c-terra)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CRMExportModal({ customers, onClose, showToast }) {
  const [consumoMode, setConsumoMode] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [zona, setZona] = useState("");
  const [actMode, setActMode] = useState("all");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [onlyWithAge, setOnlyWithAge] = useState(false);
  const [format, setFormat] = useState("xlsx");

  const { ciudades, zonasByCiudad } = useMemo(() => {
    const map = {};
    customers.forEach(c => {
      const { ciudad: ci, zona: zo } = parseLocation(c.address);
      if (!ci) return;
      if (!map[ci]) map[ci] = new Set();
      if (zo) map[ci].add(zo);
    });
    return {
      ciudades: Object.keys(map).sort((a, b) => a.localeCompare(b, "es")),
      zonasByCiudad: map,
    };
  }, [customers]);

  const zonasDisponibles = useMemo(() => {
    if (!ciudad) {
      const all = new Set();
      Object.values(zonasByCiudad).forEach(set => set.forEach(z => all.add(z)));
      return Array.from(all).sort((a, b) => a.localeCompare(b, "es"));
    }
    return Array.from(zonasByCiudad[ciudad] || []).sort((a, b) => a.localeCompare(b, "es"));
  }, [ciudad, zonasByCiudad]);

  useEffect(() => {
    if (zona && ciudad && !(zonasByCiudad[ciudad]?.has(zona))) setZona("");
  }, [ciudad, zona, zonasByCiudad]);

  const filtered = useMemo(() => {
    let list = [...customers];
    if (consumoMode === "min") {
      const min = Number(minAmount) || 0;
      if (min > 0) list = list.filter(c => (c.total || 0) >= min);
    } else if (consumoMode !== "all") {
      const sorted = [...list].sort((a, b) => b.total - a.total);
      const pct = consumoMode === "top10" ? 0.10 : consumoMode === "top25" ? 0.25 : 0.50;
      const cutoff = Math.max(1, Math.ceil(sorted.length * pct));
      const topSet = new Set(sorted.slice(0, cutoff).map(c => c.email + "|" + c.phone));
      list = list.filter(c => topSet.has(c.email + "|" + c.phone));
    }
    if (ciudad || zona) {
      list = list.filter(c => {
        const { ciudad: ci, zona: zo } = parseLocation(c.address);
        if (ciudad && ci !== ciudad) return false;
        if (zona && zo !== zona) return false;
        return true;
      });
    }
    if (actMode === "active3") {
      list = list.filter(c => c.days_since_last_order !== null && c.days_since_last_order <= 90);
    } else if (actMode === "between36") {
      list = list.filter(c => c.days_since_last_order !== null && c.days_since_last_order > 90 && c.days_since_last_order <= 180);
    } else if (actMode === "inactive6") {
      list = list.filter(c => c.days_since_last_order !== null && c.days_since_last_order > 180);
    }
    if (onlyWithAge) list = list.filter(c => c.age !== null);
    const minA = Number(ageMin);
    const maxA = Number(ageMax);
    if (minA > 0) list = list.filter(c => c.age !== null && c.age >= minA);
    if (maxA > 0) list = list.filter(c => c.age !== null && c.age <= maxA);
    return list;
  }, [customers, consumoMode, minAmount, ciudad, zona, actMode, ageMin, ageMax, onlyWithAge]);

  const withAgeCount = customers.filter(c => c.age !== null).length;

  const doExport = async () => {
    if (filtered.length === 0) return;
    const { downloadCSV, downloadXLSX, printAsPDF } = await import("../../lib/exports");
    const headers = ["Nombre", "Teléfono", "Email", "Edad", "Dirección", "Pedidos", "Total Gastado", "Última compra", "Días sin pedir"];
    const rows = filtered.map(c => [
      c.name || "", c.phone || "", c.email || "",
      c.age !== null ? c.age : "",
      c.address || "", c.orders, c.total,
      c.last_order ? new Date(c.last_order).toLocaleDateString("es-AR") : "",
      c.days_since_last_order !== null ? c.days_since_last_order : "",
    ]);
    const baseName = "clientes_" + todayISO();
    try {
      if (format === "csv")  downloadCSV(baseName + ".csv", headers, rows);
      if (format === "xlsx") downloadXLSX(baseName + ".xlsx", headers, rows, "Clientes");
      if (format === "pdf")  printAsPDF("Listado de clientes", headers, rows, { subtitle: filtered.length + " clientes · " + todayISO() });
      showToast?.(filtered.length + " clientes exportados ✓");
      onClose();
    } catch (err) {
      showToast?.("Error al exportar: " + err.message);
    }
  };

  return (
    <div className="ag-page-over" style={{ zIndex: 910 }}>
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          <span>Cancelar</span>
        </button>
        <h2 className="ag-page-over-title">Exportar clientes</h2>
      </div>
      <div className="ag-page-over-body">
        <label className="ag-field-lbl">💰 Consumo</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          {[{key:"all",label:"Todos"},{key:"top10",label:"Top 10%"},{key:"top25",label:"Top 25%"},{key:"top50",label:"Top 50%"},{key:"min",label:"Mínimo $..."}].map(m => {
            const on = consumoMode === m.key;
            return (
              <button key={m.key} type="button" onClick={() => setConsumoMode(m.key)}
                style={{ padding: "8px 6px", borderRadius: 10, border: on ? "2px solid var(--ag-c-sales)" : "1px solid var(--ag-line)", background: on ? "var(--ag-c-sales-soft)" : "var(--ag-bg)", color: on ? "var(--ag-c-sales)" : "var(--ag-ink-2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {m.label}
              </button>
            );
          })}
        </div>
        {consumoMode === "min" && (
          <input className="ag-field-input" type="number" min="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Ej: 50000" style={{ marginBottom: 16 }} />
        )}
        {consumoMode !== "min" && <div style={{ marginBottom: 16 }} />}

        <label className="ag-field-lbl">📍 Ubicación</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <select className="ag-field-input" value={ciudad} onChange={e => setCiudad(e.target.value)}>
            <option value="">Todas las ciudades</option>
            {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="ag-field-input" value={zona} onChange={e => setZona(e.target.value)} disabled={zonasDisponibles.length === 0}>
            <option value="">Todas las zonas</option>
            {zonasDisponibles.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
          {ciudades.length === 0 ? "⚠ Ninguna dirección con formato 'Calle, Zona, Ciudad' detectada." : ciudades.length + " ciudad" + (ciudades.length !== 1 ? "es" : "") + " detectada" + (ciudades.length !== 1 ? "s" : "") + "."}
        </div>

        <label className="ag-field-lbl">🕐 Actividad</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
          {[{key:"all",label:"Todos"},{key:"active3",label:"Últimos 3 meses"},{key:"between36",label:"Más de 3 meses"},{key:"inactive6",label:"Inactivos (+6 meses)"}].map(m => {
            const on = actMode === m.key;
            return (
              <button key={m.key} type="button" onClick={() => setActMode(m.key)}
                style={{ padding: "9px 8px", borderRadius: 10, border: on ? "2px solid var(--ag-c-crm)" : "1px solid var(--ag-line)", background: on ? "var(--ag-c-crm-soft)" : "var(--ag-bg)", color: on ? "var(--ag-c-crm)" : "var(--ag-ink-2)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {m.label}
              </button>
            );
          })}
        </div>

        <label className="ag-field-lbl">🎂 Rango de edad</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input className="ag-field-input" type="number" min="0" max="120" value={ageMin} onChange={e => setAgeMin(e.target.value)} placeholder="Min" style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: "var(--ag-ink-3)" }}>a</span>
          <input className="ag-field-input" type="number" min="0" max="120" value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="Max" style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: "var(--ag-ink-3)" }}>años</span>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ag-ink-2)", cursor: "pointer", marginBottom: 6 }}>
          <input type="checkbox" checked={onlyWithAge} onChange={e => setOnlyWithAge(e.target.checked)} style={{ margin: 0 }} />
          Solo clientes con fecha de nacimiento cargada
        </label>
        <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
          {withAgeCount === 0 ? "⚠ Ningún cliente tiene fecha de nacimiento cargada." : withAgeCount + " de " + customers.length + " clientes tienen fecha cargada."}
        </div>

        <label className="ag-field-lbl">📄 Formato</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
          {[{key:"xlsx",label:"Excel",icon:"📊"},{key:"csv",label:"CSV",icon:"📄"},{key:"pdf",label:"PDF",icon:"🖨"}].map(f => {
            const on = format === f.key;
            return (
              <button key={f.key} type="button" onClick={() => setFormat(f.key)}
                style={{ padding: "10px 6px", borderRadius: 10, border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)", background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)", color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 16 }}>{f.icon}</span>{f.label}
              </button>
            );
          })}
        </div>

        <div className="ag-card" style={{ padding: "12px 14px", background: "var(--ag-bg-card)" }}>
          <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginBottom: 2 }}>Se van a exportar</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ag-ink)" }}>
            {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
          </div>
          {filtered.length > 0 && (
            <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginTop: 2 }}>
              Total facturado: ${formatInt(filtered.reduce((s, c) => s + (c.total || 0), 0))}
            </div>
          )}
        </div>

        <button type="button" className="ag-btn-primary" disabled={filtered.length === 0} onClick={doExport}
          style={{ marginTop: 18, width: "100%", padding: "14px", fontSize: 15, opacity: filtered.length > 0 ? 1 : 0.5 }}>
          ⬇ Exportar {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function PromoFidelidadModal({ selected, onClose, showToast, onSent }) {
  const [coupons, setCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [selCouponId, setSelCouponId] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newKind, setNewKind] = useState("percent");
  const [newPct, setNewPct] = useState(15);
  const [newLabel, setNewLabel] = useState("");
  const [newDays, setNewDays] = useState(30);
  const [medios, setMedios] = useState(new Set(["whatsapp"]));
  const [needsPin, setNeedsPin] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCoupons().then(list => {
      const now = Date.now();
      const active = (list || []).filter(c => !c.used && (!c.expires_at || new Date(c.expires_at).getTime() > now));
      setCoupons(active);
      setLoadingCoupons(false);
    });
  }, []);

  const toggleMedio = (m) => setMedios(prev => {
    const next = new Set(prev);
    if (next.has(m)) next.delete(m); else next.add(m);
    return next;
  });

  const selectedCoupon = coupons.find(c => c.id === selCouponId);
  const currentPct = creatingNew
    ? (newKind === "percent" ? Number(newPct) : 0)
    : (selectedCoupon?.kind === "percent" || !selectedCoupon?.kind)
      ? (selectedCoupon?.discount_pct || 0)
      : 0;
  const isDangerous = currentPct >= DANGEROUS_PCT;

  const canSend = (() => {
    if (medios.size === 0) return false;
    if (creatingNew) {
      if (newKind === "percent" && (!newPct || newPct < 1)) return false;
      if ((newKind === "twoxone" || newKind === "other") && !newLabel.trim()) return false;
      return true;
    }
    return !!selCouponId;
  })();

  const send = async () => {
    if (!canSend) return;
    if (isDangerous && !needsPin) { setNeedsPin(true); return; }
    if (isDangerous && pinValue !== ADMIN_PIN) { showToast?.("PIN incorrecto"); return; }

    setBusy(true);
    let okCount = 0, skipCount = 0;
    for (const customer of selected) {
      if (creatingNew) {
        if (!customer.email) { skipCount++; continue; }
        const saved = await createCustomerCoupon({
          email: customer.email,
          kind: newKind,
          discountPct: newKind === "percent" ? Number(newPct) : 0,
          label: newKind !== "percent" ? newLabel : null,
          expiresDays: Number(newDays),
        });
        if (saved) okCount++; else skipCount++;
      } else {
        const hasContact = (medios.has("whatsapp") && customer.phone) || (medios.has("email") && customer.email);
        if (hasContact) okCount++; else skipCount++;
      }
    }
    setBusy(false);
    const mediosLabel = Array.from(medios).map(m => m === "whatsapp" ? "WhatsApp" : "Email").join(" + ");
    showToast?.(
      okCount + " promo" + (okCount !== 1 ? "s" : "") + " encolada" + (okCount !== 1 ? "s" : "") + " vía " + mediosLabel +
      (skipCount > 0 ? " · " + skipCount + " sin contacto" : "") +
      " · el bot los envía"
    );
    onSent?.();
  };

  if (needsPin) {
    return (
      <div className="ag-page-over" style={{ zIndex: 911 }}>
        <div className="ag-page-over-head">
          <button type="button" className="ag-subpage-back" onClick={() => { setNeedsPin(false); setPinValue(""); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
            <span>Cancelar</span>
          </button>
          <h2 className="ag-page-over-title">⚠ Confirmación requerida</h2>
        </div>
        <div className="ag-page-over-body">
          <div style={{ padding: "14px 16px", marginBottom: 16, background: "var(--ag-c-orders-soft)", border: "1px solid var(--ag-c-orders)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ag-c-orders)", marginBottom: 6 }}>⚠ Descuento alto: {currentPct}%</div>
            <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)", lineHeight: 1.5 }}>
              Estás por enviar una promo de <strong>{currentPct}% OFF</strong> a <strong>{selected.length} cliente{selected.length !== 1 ? "s" : ""}</strong>. Puede afectar tu margen. Ingresá el PIN administrativo para continuar.
            </div>
          </div>
          <label className="ag-field-lbl">PIN de seguridad</label>
          <input className="ag-field-input" type="password" inputMode="numeric" maxLength={4} value={pinValue} onChange={e => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="****" autoFocus
            style={{ marginBottom: 14, textAlign: "center", letterSpacing: 8, fontSize: 18, fontWeight: 700 }} />
          <button type="button" onClick={send} disabled={pinValue.length !== 4 || busy}
            style={{ width: "100%", padding: "14px", background: "var(--ag-c-orders)", color: "#fff", border: 0, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: pinValue.length === 4 ? "pointer" : "not-allowed", opacity: pinValue.length === 4 ? 1 : 0.5 }}>
            {busy ? "Procesando…" : "Confirmar y enviar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-page-over" style={{ zIndex: 911 }}>
      <div className="ag-page-over-head">
        <button type="button" className="ag-subpage-back" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          <span>Cancelar</span>
        </button>
        <h2 className="ag-page-over-title">🎁 Promo Fidelidad</h2>
      </div>
      <div className="ag-page-over-body">
        <div className="ag-card" style={{ padding: "10px 12px", marginBottom: 14, background: "var(--ag-bg-card)" }}>
          <div style={{ fontSize: 11, color: "var(--ag-ink-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>DESTINATARIOS</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ag-ink)", marginTop: 2 }}>
            {selected.length} cliente{selected.length !== 1 ? "s" : ""}
          </div>
          <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 4 }}>
            {selected.filter(c => c.email).length} con email · {selected.filter(c => c.phone).length} con WhatsApp
          </div>
        </div>

        <label className="ag-field-lbl">🎟 Cupón a enviar</label>
        {loadingCoupons ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--ag-ink-3)", fontSize: 12 }}>Cargando cupones…</div>
        ) : !creatingNew ? (
          <>
            {coupons.length > 0 ? (
              <select className="ag-field-input" value={selCouponId} onChange={e => setSelCouponId(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="">— Elegí un cupón —</option>
                {coupons.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {describeCoupon(c)}{c.email ? " (personal)" : " (general)"}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ padding: "10px 12px", marginBottom: 8, background: "var(--ag-bg-card)", border: "1px dashed var(--ag-line)", borderRadius: 10, fontSize: 12, color: "var(--ag-ink-3)", textAlign: "center" }}>
                No hay cupones cargados. Creá el primero abajo ↓
              </div>
            )}
            <button type="button" onClick={() => setCreatingNew(true)} className="ag-btn-ghost"
              style={{ width: "100%", padding: "10px", fontSize: 12, marginBottom: 16 }}>
              + Crear cupón nuevo
            </button>
          </>
        ) : (
          <div className="ag-card" style={{ padding: 12, marginBottom: 16, background: "var(--ag-bg-card)", border: "1.5px solid var(--ag-c-prep)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ag-c-prep)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nuevo cupón</div>

            <label className="ag-field-lbl">Tipo</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[{key:"percent",label:"%"},{key:"twoxone",label:"2x1"},{key:"other",label:"Otro"}].map(k => {
                const on = newKind === k.key;
                return (
                  <button key={k.key} type="button" onClick={() => setNewKind(k.key)}
                    style={{ padding: "8px 6px", borderRadius: 10, border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)", background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)", color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {k.label}
                  </button>
                );
              })}
            </div>

            {newKind === "percent" && (
              <>
                <label className="ag-field-lbl">Descuento %</label>
                <DecimalInput className="ag-field-input" min={1} max={100} step="1" value={newPct} onChange={(n) => setNewPct(n || 1)} style={{ marginBottom: 10 }} />
              </>
            )}
            {(newKind === "twoxone" || newKind === "other") && (
              <>
                <label className="ag-field-lbl">{newKind === "twoxone" ? "Detalle del 2x1" : "Detalle de la promo"}</label>
                <input className="ag-field-input" value={newLabel} onChange={e => setNewLabel(e.target.value.slice(0, 60))}
                  placeholder={newKind === "twoxone" ? "Ej: 2x1 en hamburguesas" : "Ej: Bebida gratis con tu pedido"}
                  style={{ marginBottom: 10 }} />
              </>
            )}

            <label className="ag-field-lbl">Días de validez</label>
            <DecimalInput className="ag-field-input" min={1} max={365} step="1" value={newDays} onChange={(n) => setNewDays(n || 30)} style={{ marginBottom: 10 }} />

            {newKind === "percent" && Number(newPct) >= DANGEROUS_PCT && (
              <div style={{ padding: "8px 10px", marginBottom: 10, background: "var(--ag-c-orders-soft)", color: "var(--ag-c-orders)", border: "1px solid var(--ag-c-orders)", borderRadius: 8, fontSize: 11.5, fontWeight: 600 }}>
                ⚠ Descuento alto ({newPct}%). Se va a pedir PIN al enviar.
              </div>
            )}

            <button type="button" onClick={() => setCreatingNew(false)} className="ag-btn-ghost" style={{ width: "100%", padding: "8px", fontSize: 12 }}>
              Volver a cupones existentes
            </button>
            <div style={{ fontSize: 10.5, color: "var(--ag-ink-3)", marginTop: 8, lineHeight: 1.5 }}>
              Se genera un código único por cliente (requiere email).
            </div>
          </div>
        )}

        <label className="ag-field-lbl">Medio de envío</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[{key:"whatsapp",label:"WhatsApp",icon:"📱",color:"#2A9D6E"},{key:"email",label:"Email",icon:"✉️",color:"#3A8B9F"}].map(m => {
            const on = medios.has(m.key);
            return (
              <button key={m.key} type="button" onClick={() => toggleMedio(m.key)}
                style={{
                  padding: "16px 10px", borderRadius: 12,
                  border: "2px solid " + (on ? m.color : "var(--ag-line)"),
                  background: on ? m.color : "var(--ag-bg)",
                  color: on ? "#fff" : "var(--ag-ink-2)",
                  fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  transition: "all 0.15s",
                  boxShadow: on ? "var(--ag-sh-sm)" : "none",
                }}>
                <span style={{ fontSize: 22 }}>{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: "10px 12px", marginBottom: 14, background: "var(--ag-bg-soft)", borderRadius: 10, fontSize: 11.5, color: "var(--ag-ink-3)", lineHeight: 1.5 }}>
          💡 El bot toma los cupones generados y los envía automáticamente vía el/los medios elegidos.
        </div>

        <button type="button" onClick={send} disabled={!canSend || busy || selected.length === 0}
          style={{
            width: "100%", padding: "14px",
            background: "var(--ag-c-terra)", color: "#fff",
            border: 0, borderRadius: 12,
            fontSize: 15, fontWeight: 800, fontFamily: "inherit",
            cursor: (!canSend || busy || selected.length === 0) ? "not-allowed" : "pointer",
            opacity: (!canSend || busy || selected.length === 0) ? 0.5 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
          {busy ? "Procesando…" : "🤖 Enviar a " + selected.length + " cliente" + (selected.length !== 1 ? "s" : "") + " vía bot"}
        </button>
      </div>
    </div>
  );
}

export default CRM;
