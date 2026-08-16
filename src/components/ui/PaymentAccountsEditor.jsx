// src/components/ui/PaymentAccountsEditor.jsx
// CRUD de CUENTAS de pago (settings.payment_accounts) = UNICA fuente de verdad.
// Son las cuentas donde el cliente paga (checkout) y de donde sale el dinero.
//
// Sin "tipos": el banco/billetera ya dice que es. Campos:
//   - banco  = nombre VISIBLE (lo ve el cliente). Requerido.
//   - label  = nombre INTERNO, para diferenciar varias cuentas del mismo banco.
//   - titular, alias, cbu (CBU o CVU), active.
//
// Efectivo es IMPLICITO (siempre disponible, no se carga). El cliente siempre
// manda comprobante para confirmar, asi que no hay campo de instrucciones.
import { useConfirm } from "../ConfirmSlideProvider";
import { useState } from "react";
import { updateSettings } from "../../services/settings";

function emptyAccount() {
  return { id: "", label: "", banco: "", titular: "", alias: "", cbu: "", active: true, sort: 0, scope: "ambos" };
}

// Donde se usa cada cuenta. Sin scope (cuentas viejas) = "ambos" (compat).
const SCOPES = [
  { id: "checkout",    label: "Checkout",    hint: "La ven los clientes al pagar" },
  { id: "proveedores", label: "Proveedores", hint: "Solo para registrar gastos y compras" },
  { id: "ambos",       label: "Ambos",       hint: "Checkout y gastos/compras" },
];
const scopeLabel = (s) => SCOPES.find(x => x.id === (s || "ambos"))?.label || "Ambos";

// onSave: (settings) => Promise<guardado|null>. Por defecto escribe en la
// tabla settings legacy; el panel del edificio inyecta la version por tenant.
// Es el editor mas sensible de todos: estas cuentas son las que el cliente ve
// al pagar. Si guardaba por su cuenta contra la base equivocada, el dueno
// cargaba su CBU, veia el toast de exito y el checkout seguia sin cuentas.
export default function PaymentAccountsEditor({ settings, setSettings, showToast, onSave = updateSettings }) {
  const confirmSlide = useConfirm();
  const accounts = Array.isArray(settings?.payment_accounts) ? settings.payment_accounts : [];
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const persist = async (next) => {
    setSaving(true);
    const saved = await onSave({ ...settings, payment_accounts: next });
    setSaving(false);
    if (saved) {
      setSettings(saved);
      showToast?.("Cuentas de pago actualizadas ✓");
      return true;
    }
    showToast?.("Error al guardar");
    return false;
  };

  const setField = (k, v) => setEditing(p => ({ ...p, [k]: v }));

  const save = async () => {
    const e = editing;
    if (!e.banco.trim()) { showToast?.("Poné el nombre visible (banco o billetera)"); return; }
    if (!e.alias.trim() && !e.cbu.trim()) { showToast?.("Cargá alias o CBU/CVU"); return; }
    const acc = {
      ...e,
      label: e.label.trim(),
      banco: e.banco.trim(),
      titular: e.titular.trim(),
      alias: e.alias.trim(),
      cbu: e.cbu.trim(),
    };
    let next;
    if (e.id) {
      next = accounts.map(a => (a.id === e.id ? acc : a));
    } else {
      acc.id = "acc_" + Date.now().toString(36);
      acc.sort = accounts.length;
      next = [...accounts, acc];
    }
    if (await persist(next)) setEditing(null);
  };

  const remove = async (acc) => {
    const ok = await confirmSlide({
      title: `Eliminar "${acc.banco || acc.label}"`,
      body: "Deja de aparecer en el checkout. Los pedidos viejos conservan la copia de la cuenta.",
      label: "Deslizá para eliminar",
    });
    if (!ok) return;
    persist(accounts.filter(a => a.id !== acc.id));
  };

  const toggleActive = (acc) =>
    persist(accounts.map(a => (a.id === acc.id ? { ...a, active: !a.active } : a)));

  // ─── Form alta/edicion ───
  if (editing) {
    const e = editing;
    return (
      <div>
        <label className="ag-field-lbl">Banco o billetera (nombre visible) *</label>
        <input className="ag-field-input" value={e.banco}
          onChange={ev => setField("banco", ev.target.value.slice(0, 80))}
          placeholder="Ej: Galicia, Mercado Pago, Ualá"
          disabled={saving} style={{ marginBottom: 12, width: "100%" }} />

        <label className="ag-field-lbl">Nombre interno (opcional)</label>
        <input className="ag-field-input" value={e.label}
          onChange={ev => setField("label", ev.target.value.slice(0, 60))}
          placeholder="Para diferenciar varias cuentas del mismo banco. Ej: Galicia Juan"
          disabled={saving} style={{ marginBottom: 12, width: "100%" }} />

        <label className="ag-field-lbl">Titular</label>
        <input className="ag-field-input" value={e.titular}
          onChange={ev => setField("titular", ev.target.value.slice(0, 120))}
          placeholder="Nombre del titular de la cuenta"
          disabled={saving} style={{ marginBottom: 12, width: "100%" }} />

        <label className="ag-field-lbl">Alias</label>
        <input className="ag-field-input" value={e.alias}
          onChange={ev => setField("alias", ev.target.value.slice(0, 120))}
          placeholder="Ej: mi.alias.mp"
          disabled={saving} style={{ marginBottom: 12, width: "100%" }} />

        <label className="ag-field-lbl">CBU / CVU</label>
        <input className="ag-field-input" value={e.cbu} inputMode="numeric"
          onChange={ev => setField("cbu", ev.target.value.replace(/\D/g, "").slice(0, 22))}
          placeholder="22 dígitos"
          disabled={saving} style={{ marginBottom: 16, width: "100%" }} />

        {/* Scope: donde se usa la cuenta (checkout / proveedores / ambos) */}
        <label className="ag-field-lbl">¿Para qué se usa?</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {SCOPES.map(sc => {
            const on = (e.scope || "ambos") === sc.id;
            return (
              <button key={sc.id} type="button" onClick={() => setField("scope", sc.id)} disabled={saving}
                style={{
                  flex: 1, padding: "9px 4px", borderRadius: 10,
                  border: on ? "2px solid var(--ag-c-terra)" : "1px solid var(--ag-line)",
                  background: on ? "rgba(245,158,11,0.08)" : "var(--ag-bg)",
                  color: on ? "var(--ag-c-terra)" : "var(--ag-ink-2)",
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}>
                {sc.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginBottom: 14 }}>
          {SCOPES.find(x => x.id === (e.scope || "ambos"))?.hint}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={e.active}
            onChange={ev => setField("active", ev.target.checked)} disabled={saving} />
          <span style={{ fontSize: 13, color: "var(--ag-ink-2)" }}>Activa</span>
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ag-btn-primary" onClick={save} disabled={saving} style={{ flex: 1 }}>
            {saving ? "Guardando..." : (e.id ? "Guardar cambios" : "Crear cuenta")}
          </button>
          <button type="button" onClick={() => setEditing(null)} disabled={saving}
            style={{ padding: "0 16px", borderRadius: 10, border: "1px solid var(--ag-line)", background: "var(--ag-bg)", color: "var(--ag-ink-2)", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ─── Lista ───
  return (
    <div>
      <div className="ag-card" style={{ padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, background: "var(--ag-bg-soft)" }}>
        <span style={{ fontSize: 18 }}>💵</span>
        <div style={{ fontSize: 12.5, color: "var(--ag-ink-2)", lineHeight: 1.45 }}>
          <strong>Efectivo</strong> siempre está disponible, no hace falta cargarlo. Cargá acá las cuentas (banco o billetera) donde te pagan.
        </div>
      </div>

      {accounts.length > 0 ? (
        <div className="ag-card" style={{ padding: 4, marginBottom: 14 }}>
          {accounts.map((acc, i) => {
            const detail = acc.alias || (acc.cbu ? `CBU ···${acc.cbu.slice(-4)}` : "");
            return (
              <div key={acc.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderTop: i === 0 ? "none" : "1px solid var(--ag-line)",
                opacity: acc.active ? 1 : 0.5,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--ag-bg-soft)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏦</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ag-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {acc.banco || "(sin nombre)"}{acc.label ? <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ag-ink-3)" }}> · {acc.label}</span> : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {detail}{detail ? " · " : ""}<span style={{ fontWeight: 700 }}>{scopeLabel(acc.scope)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => toggleActive(acc)} disabled={saving}
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--ag-line)", background: acc.active ? "rgba(42,157,110,0.12)" : "var(--ag-bg)", color: acc.active ? "var(--ag-c-ok, #2A9D6E)" : "var(--ag-ink-3)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {acc.active ? "Activa" : "Off"}
                </button>
                <button type="button" onClick={() => setEditing({ ...emptyAccount(), ...acc })} disabled={saving}
                  aria-label="Editar" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: 0, borderRadius: 8, background: "var(--ag-bg-soft)", color: "var(--ag-ink-2)", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <button type="button" onClick={() => remove(acc)} disabled={saving}
                  aria-label="Eliminar" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: 0, borderRadius: 8, background: "rgba(232,90,74,0.10)", color: "var(--ag-c-orders)", cursor: "pointer", flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ag-card" style={{ padding: 18, textAlign: "center", color: "var(--ag-ink-3)", fontSize: 12, marginBottom: 14 }}>
          Sin cuentas cargadas. Solo se ofrece efectivo. Agregá una abajo.
        </div>
      )}

      <button type="button" className="ag-btn-primary" onClick={() => setEditing(emptyAccount())} disabled={saving} style={{ width: "100%" }}>
        + Agregar cuenta de pago
      </button>
    </div>
  );
}
