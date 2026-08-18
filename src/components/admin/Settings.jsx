/**
 * Settings — configuración del admin. Se renderiza como página por sección
 * (Operación · Finanzas · Zona de riesgo) desde el dropdown de perfil.
 *
 * Patrón estilo iOS Settings:
 *  · Página raíz con grupos
 *  · Items complejos abren sub-páginas con flecha atrás (no expand inline)
 *  · Autosave debounced (sin botón "Guardar")
 *
 * Props:
 *   settings, setSettings · estado en Admin.jsx (sincroniza con DB)
 *   showToast             · feedback
 *   section               · 'operacion' | 'finanzas' | 'riesgo' | null (todo)
 *                           (el toggle de modo oscuro vive ahora en el topbar)
 *
 * "Exportar datos" se eliminó (12/jun): el export mensual vive en
 * Resumen del mes → Exportar.
 */
import { useConfirm } from "../ConfirmSlideProvider";
import { useEffect, useRef, useState } from "react";
import { updateSettings, resetHistoricalData } from "../../lib/adminService";
import SettingsRow from "./shared/forms/SettingsRow";
import TimePicker from "./shared/forms/TimePicker";
import CatChipsEditor from "../ui/CatChipsEditor";
import DecimalInput from "../ui/DecimalInput";
import DynamicQrs from "./DynamicQrs";
import InfoPagesAdmin from "../../pages/admin/InfoPages";
import PaymentAccountsEditor from "../ui/PaymentAccountsEditor";
// Imports ESTATICOS (fix HERMES-GASTRO-G): antes eran dynamic imports y
// tras un deploy el chunk viejo resolvia un modulo roto → "e is not a
// function" y la subpagina quedaba en "Cargando..." eterno. Son modulos
// chicos: van al chunk de Admin y listo.
import { fetchActiveIntegration, connectMercadoPagoManual, disconnectIntegration } from "../../services/paymentIntegrations";
import { fetchDeliveryChannels, upsertDeliveryChannel } from "../../services/deliveryChannels";

function Icon({ d, viewBox = "0 0 24 24" }) {
  return (
    <svg width="16" height="16" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function BackChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// Titulos cuando Settings se renderiza como pagina de UNA seccion
// (abierta desde el dropdown de perfil del topbar)
const SECTION_TITLES = {
  operacion: "Operación",
  finanzas: "Finanzas",
  riesgo: "Zona de riesgo",
};

// Zonas que dependen de tablas que el edificio todavia no tiene. Por defecto
// TODAS prendidas: el admin legacy no cambia en nada. El panel de la
// plataforma pasa las que le faltan en false, y se van prendiendo a medida
// que cada tabla llega (ver platform/PLAN-ERP.md).
const CAPACIDADES_COMPLETAS = {
  qrs: true,        // tabla dynamic_qrs
  paginas: true,    // tabla info_pages
  pasarelas: true,  // tabla payment_integrations
  canales: true,    // tabla delivery_channels
  riesgo: true,     // reset del historico: borra tablas del ERP viejo
};

/**
 * @param onSave  (settings) => Promise<settingsGuardados|null>. Por defecto
 *                escribe en la tabla `settings` legacy (id=1). El panel del
 *                edificio inyecta la version por tenant. Es EL punto de
 *                acople: todo el resto de la pantalla es agnostico de a que
 *                base le esta hablando.
 */
function Settings({
  settings, setSettings, showToast, section = null, onBack,
  onSave = updateSettings,
  capacidades,
  // El edificio abre la gestion del equipo desde aca; el admin legacy la
  // tiene en su menu ☰, asi que por defecto esta fila NO se muestra.
  onAbrirUsuarios = null,
}) {
  const cap = { ...CAPACIDADES_COMPLETAS, ...(capacidades || {}) };
  const confirmSlide = useConfirm();
  const [s, setS] = useState({ ...settings });
  const [page, setPage] = useState('root'); // 'root' | 'hours' | 'expCats' | 'ingCats' | 'costs' | 'gateways' | 'channels' | 'usarTargets' | 'reset'
  const [qrsOpen, setQrsOpen] = useState(false); // overlay QRs dinamicos (vive en Operacion)
  const [pagesOpen, setPagesOpen] = useState(false); // overlay Paginas informativas (debajo de QRs)
  const [accountsOpen, setAccountsOpen] = useState(false); // overlay Cuentas de pago (atajo en Finanzas)
  const show = (g) => !section || section === g;

  // ─── Autosave debounced ───
  const skipFirst = useRef(true);
  const saveTimer = useRef(null);
  const saveSeq = useRef(0);

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const mySeq = ++saveSeq.current;
      const saved = await onSave(s);
      if (mySeq !== saveSeq.current) return;
      if (saved) setSettings(saved);
      else showToast("Error al guardar");
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const set = (k, v) => setS(p => ({ ...p, [k]: v }));

  const storeOpen = s.store_open !== false;

  const goTo = (p) => setPage(p);
  const goBack = () => setPage('root');

  return (
    <div className="ag-subpage-stack">

      {/* ── ROOT ── */}
      <div className={`ag-subpage is-root ${page !== 'root' ? 'has-child' : ''}`}>
        <div className="ag-subpage-body" style={{ paddingTop: 6 }}>
          <div style={{ padding: "0 4px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Volver"
                style={{
                  width: 34, height: 34, borderRadius: 10, border: "1px solid var(--ag-line)",
                  background: "var(--ag-bg-card)", color: "var(--ag-ink)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <BackChevron />
              </button>
            )}
            <div>
              <h2 style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 800,
                fontSize: 20,
                margin: 0,
                color: section === "riesgo" ? "var(--ag-c-orders)" : "var(--ag-ink)",
                letterSpacing: "-0.01em",
              }}>{SECTION_TITLES[section] || "Configuración"}</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ag-ink-3)" }}>Cambios se guardan automáticamente</p>
            </div>
          </div>

          {/* ─── OPERACIÓN ───
              El toggle de modo oscuro se mudo al topbar (sol/luna junto a
              la burbuja de perfil) — aca queda lo operativo. */}
          {show('operacion') && (
          <>
          {!section && <div className="ag-settings-group-title">Operación</div>}
          <div className="ag-settings-group">
            <SettingsRow
              state="stock"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>}
              label="Horarios del local"
              hint="Días y franjas de apertura"
              onClick={() => goTo('hours')}
            />
            {/* QRs dinamicos: mudado desde Personalizacion (12/jun) */}
            {cap.qrs && <SettingsRow
              state="crm"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3z M20 14h1 M14 20h1 M20 20h1"/></svg>}
              label="QRs dinámicos"
              hint="QRs impresos que cambian de destino sin reimprimir"
              onClick={() => setQrsOpen(true)}
            />}
            {/* Paginas informativas: contenido al que apuntan los QRs */}
            {cap.paginas && <SettingsRow
              state="recipes"
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}
              label="Páginas informativas"
              hint="Contenido para tus QRs y links · /info/..."
              onClick={() => setPagesOpen(true)}
            />}
          </div>
          </>
          )}

          {/* ─── FINANZAS ─── */}
          {show('finanzas') && (
          <>
          {!section && <div className="ag-settings-group-title">Finanzas</div>}
          <div className="ag-settings-group">
            {/* Cuentas de pago: atajo a la unica verdad (vive en Gastos).
                Pedido 12/jun: "no veo los medios de pago" — estaba escondido. */}
            <SettingsRow
              state="sales"
              icon={<Icon d="M3 21h18 M5 21V7l7-4 7 4v14 M9 9h1 M9 13h1 M14 9h1 M14 13h1" />}
              label="Cuentas y medios de pago"
              hint="Efectivo, transferencias, billeteras — checkout y proveedores"
              onClick={() => setAccountsOpen(true)}
            />
            {cap.pasarelas && <SettingsRow
              state="sales"
              icon={<Icon d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M1 10h22" />}
              label="Pasarelas de pago"
              hint="Conectar MercadoPago para cobrar online"
              onClick={() => goTo('gateways')}
            />}
            {cap.canales && <SettingsRow
              state="prep"
              icon={<Icon d="M3 6h18 M3 12h18 M3 18h18" />}
              label="Canales de venta"
              hint="Por dónde entran los pedidos y qué comisión te cobra cada uno"
              onClick={() => goTo('channels')}
            />}
            <SettingsRow
              state="sales"
              icon={<Icon d="M3 3v18h18 M7 14l4-4 4 4 5-5" />}
              label="Objetivos del negocio"
              hint="Límites de gasto y piso de ganancia (semáforos del P&L)"
              onClick={() => goTo('usarTargets')}
            />
            {/* "Medios de pago" se mudo a Finanzas → Gastos → 🏦 Cuentas
                (unica verdad de cuentas para checkout y proveedores) */}
            <SettingsRow
              state="orders"
              icon={<Icon d="M3 3v18h18 M7 14l4-4 4 4 5-5" />}
              label="Costos proyectados"
              hint="Colchón de merma y gastos que se suma al costo de cada receta"
              onClick={() => goTo('costs')}
            />
          </div>
          </>
          )}

          {/* ─── ZONA DE RIESGO ─── */}
          {show('riesgo') && (
          <>
          {!section && <div className="ag-settings-group-title" style={{ color: "var(--ag-c-orders)" }}>Zona de riesgo</div>}
          <div className="ag-settings-group">
            {/* Cierre de emergencia: bloquea los pedidos del catálogo */}
            <SettingsRow
              state={storeOpen ? "sales" : "orders"}
              icon={<Icon d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" />}
              label={storeOpen ? "Cierre de emergencia" : "Tienda cerrada"}
              hint={storeOpen ? "Tocá para bloquear pedidos" : "Tocá para reabrir pedidos"}
              onClick={async () => {
                const willClose = storeOpen; // si está abierta, vamos a cerrar
                const ok = await confirmSlide(willClose ? {
                  title: "Cerrar tienda de emergencia",
                  body: "Los clientes verán el catálogo pero NO podrán hacer pedidos hasta que reabras.",
                  label: "Deslizá para bloquear",
                  loadingLabel: "Bloqueando…",
                  successLabel: "Tienda cerrada ✓",
                } : {
                  title: "Reabrir tienda",
                  body: "Los clientes podrán volver a hacer pedidos desde el catálogo.",
                  label: "Deslizá para desbloquear",
                  loadingLabel: "Reabriendo…",
                  successLabel: "Tienda abierta ✓",
                });
                if (!ok) return;
                set("store_open", !willClose);
              }}
              right={
                // Indicador visual de estado (no clickeable)
                <div aria-hidden="true" style={{
                  width: 10, height: 10, borderRadius: 999,
                  background: storeOpen ? "var(--ag-c-sales)" : "var(--ag-c-orders)",
                  boxShadow: `0 0 8px ${storeOpen ? "var(--ag-c-sales)" : "var(--ag-c-orders)"}88`,
                }} />
              }
            />
            {onAbrirUsuarios && <SettingsRow
              state="crm"
              icon={<Icon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" />}
              label="Equipo"
              hint="Quién más puede entrar al panel y con qué permisos"
              onClick={onAbrirUsuarios}
            />}
            {cap.riesgo && <SettingsRow
              danger
              icon={<Icon d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01" />}
              label="Reinicio administrativo"
              hint="Borra pedidos, ventas, gastos, mermas"
              onClick={() => goTo('reset')}
            />}
          </div>
          </>
          )}

          <p style={{ textAlign: "center", color: "var(--ag-ink-3)", fontSize: 11, margin: "18px 0 0" }}>
            Dico
          </p>
        </div>
      </div>

      {/* ── SUB-PÁGINAS ── */}
      <HoursPage
        open={page === 'hours'}
        hours={s.store_hours || {}}
        onChange={v => set("store_hours", v)}
        onBack={goBack}
      />
      <CatsSubPage
        open={page === 'expCats'}
        title="Categorías de gastos"
        intro="Estas categorías se usan al registrar gastos. Cambios afectan al selector en todos los módulos."
        field="exp_cats"
        label="Categorías de gastos"
        icon="💰"
        settings={settings}
        setSettings={setSettings}
        showToast={showToast}
        onBack={goBack}
        onSave={onSave}
      />
      <CatsSubPage
        open={page === 'ingCats'}
        title="Categorías de stock"
        intro="Se usan para agrupar ingredientes en el módulo Stock."
        field="ing_cats"
        label="Categorías de stock"
        icon="📦"
        settings={settings}
        setSettings={setSettings}
        showToast={showToast}
        onBack={goBack}
        onSave={onSave}
      />
      <CostsSubPage
        open={page === 'costs'}
        settings={s}
        setS={setS}
        onBack={goBack}
      />
      {/* Estas dos consultan sus tablas en el mount, no al abrirse: en este
          patron las sub-paginas quedan montadas con open=false. Si el
          edificio no tiene la tabla, dejarlas en el arbol seria una consulta
          fallida en cada carga del panel. */}
      {cap.pasarelas && <GatewaysSubPage
        open={page === 'gateways'}
        showToast={showToast}
        onBack={goBack}
      />}
      {cap.canales && <ChannelsSubPage
        open={page === 'channels'}
        showToast={showToast}
        onBack={goBack}
      />}
      <UsarTargetsSubPage
        open={page === 'usarTargets'}
        settings={s}
        setS={setS}
        showToast={showToast}
        onBack={goBack}
      />
      {cap.riesgo && <ResetPage
        open={page === 'reset'}
        showToast={showToast}
        onBack={goBack}
      />}

      {/* Overlay de QRs dinamicos (componente autonomo a pantalla completa) */}
      {qrsOpen && <DynamicQrs onClose={() => setQrsOpen(false)} showToast={showToast} />}

      {/* Overlay de Paginas informativas (gestion completa con editor de bloques) */}
      {pagesOpen && (
        <div className="ag-page-over" style={{ overflowY: "auto" }}>
          <InfoPagesAdmin embedded onBack={() => setPagesOpen(false)} />
        </div>
      )}

      {/* Overlay de Cuentas de pago: misma unica verdad que Finanzas → Gastos
          → 🏦 Cuentas, accesible tambien desde la pagina de configuracion */}
      {accountsOpen && (
        <div className="ag-page-over">
          <div className="ag-page-over-head">
            <button type="button" className="ag-subpage-back" onClick={() => setAccountsOpen(false)} aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Atrás</span>
            </button>
            <h2 className="ag-page-over-title">Cuentas de pago</h2>
          </div>
          <div className="ag-page-over-body">
            <PaymentAccountsEditor settings={settings} setSettings={setSettings} showToast={showToast} onSave={onSave} />
          </div>
        </div>
      )}
    </div>
  );
}

function CatsSubPage({ open, title, intro, field, label, icon, settings, setSettings, showToast, onBack, onSave }) {
  return (
    <SubPage open={open} title={title} onBack={onBack}>
      <p className="ag-subpage-intro">{intro}</p>
      <CatChipsEditor
        settings={settings}
        setSettings={setSettings}
        field={field}
        label={label}
        icon={icon}
        showToast={showToast}
        onSave={onSave}
      />
    </SubPage>
  );
}

// PaymentsSubPage ELIMINADA: el editor de cuentas vive en Finanzas → Gastos
// → 🏦 Cuentas (unica verdad para checkout y pago a proveedores).

/* ─── CostsSubPage: % merma + % gastos proyectados ─────────
 * Ambos se SUMAN al costo del producto al calcular rentabilidad.
 * Ej: costo base $100 + merma 5% + gastos 12% → costo real $117.
 * Esto hace que el margen mostrado sea más realista.
 *
 * Usa autosave debounced del padre — solo escribimos en `s` y el
 * Settings principal persiste a los 600ms. */
function CostsSubPage({ open, settings, setS, onBack }) {
  const wastePct = settings?.waste_pct ?? 5;
  const expensePct = settings?.expense_pct ?? 0;
  const totalPct = Number(wastePct) + Number(expensePct);
  const exampleBase = 1000;
  const exampleReal = Math.round(exampleBase * (1 + totalPct / 100));

  return (
    <SubPage open={open} title="Costos proyectados" onBack={onBack}>
      <p className="ag-subpage-intro">
        Estos porcentajes se <strong>suman al costo base</strong> de cada producto para que la rentabilidad mostrada sea más exacta y refleje los costos reales del negocio.
      </p>

      {/* % MERMA */}
      <div className="ag-card" style={{ padding: "14px 16px", marginBottom: 12, borderTop: "3px solid var(--ag-c-stock)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ag-ink)", marginBottom: 2 }}>⚠ % Merma proyectada</div>
            <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", lineHeight: 1.45 }}>
              Pérdida normal por vencimientos, roturas y mal manejo. Sugerido: 3-8%.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <DecimalInput
              min={0} max={100} step="0.5"
              value={wastePct}
              onChange={(n) => setS(p => ({ ...p, waste_pct: n }))}
              style={{
                width: 80, padding: "8px 10px", textAlign: "center",
                fontSize: 16, fontWeight: 700,
                border: "1px solid var(--ag-line)", borderRadius: 10,
                background: "var(--ag-bg)", color: "var(--ag-ink)",
                outline: "none", fontFamily: "inherit",
              }}
            />
            <span style={{ fontSize: 14, color: "var(--ag-c-stock)", fontWeight: 700 }}>%</span>
          </div>
        </div>
      </div>

      {/* % GASTOS */}
      <div className="ag-card" style={{ padding: "14px 16px", marginBottom: 14, borderTop: "3px solid var(--ag-c-orders)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ag-ink)", marginBottom: 2 }}>💸 % Gastos operativos</div>
            <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", lineHeight: 1.45 }}>
              Costos indirectos prorrateados: alquiler, servicios, sueldos, packaging. Sugerido: 10-20%.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <DecimalInput
              min={0} max={100} step="0.5"
              value={expensePct}
              onChange={(n) => setS(p => ({ ...p, expense_pct: n }))}
              style={{
                width: 80, padding: "8px 10px", textAlign: "center",
                fontSize: 16, fontWeight: 700,
                border: "1px solid var(--ag-line)", borderRadius: 10,
                background: "var(--ag-bg)", color: "var(--ag-ink)",
                outline: "none", fontFamily: "inherit",
              }}
            />
            <span style={{ fontSize: 14, color: "var(--ag-c-orders)", fontWeight: 700 }}>%</span>
          </div>
        </div>
      </div>

      {/* Preview del impacto */}
      <div className="ag-card" style={{
        padding: "14px 16px", background: "var(--ag-bg-card)",
        borderTop: "3px solid var(--ag-c-terra)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ag-c-terra)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Cómo se aplica
        </div>
        <div style={{ fontSize: 13, color: "var(--ag-ink-2)", lineHeight: 1.5 }}>
          Si un producto tiene costo base <strong>$1.000</strong>,<br />
          con <strong>{wastePct}% + {expensePct}% = {totalPct}%</strong> ajuste,<br />
          el costo real proyectado es <strong style={{ color: "var(--ag-c-terra)", fontSize: 15 }}>${exampleReal}</strong>.
        </div>
        <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 8, lineHeight: 1.5 }}>
          La rentabilidad mostrada en Recetas se calcula con este costo ajustado.
        </div>
      </div>
    </SubPage>
  );
}

/* ───────────────────────────────────────────────────── */
/*                  SUB-PÁGINAS                          */
/* ───────────────────────────────────────────────────── */

function SubPage({ open, title, onBack, children }) {
  return (
    <div className={`ag-subpage is-child ${open ? 'is-open' : ''}`}>
      <div className="ag-subpage-head">
        <button type="button" className="ag-subpage-back" onClick={onBack} aria-label="Atrás">
          <BackChevron /> <span>Atrás</span>
        </button>
        <h2 className="ag-subpage-title">{title}</h2>
      </div>
      <div className="ag-subpage-body">{children}</div>
    </div>
  );
}

function HoursPage({ open, hours, onChange, onBack }) {
  const set = (i, k, v) => { const nh = { ...hours }; nh[i] = { ...(hours[i] || {}), [k]: v }; onChange(nh); };
  const set24h = (i, checked) => {
    const nh = { ...hours };
    nh[i] = { ...(hours[i] || {}), h24: checked, open: checked ? "00:00" : "", close: checked ? "23:59" : "", closed: false };
    onChange(nh);
  };
  return (
    <SubPage open={open} title="Horarios" onBack={onBack}>
      <p className="ag-subpage-intro">Definí los días y franjas en que el local acepta pedidos.</p>
      {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map((day, i) => {
        const d = hours[i] || { open: "", close: "", closed: false, h24: false };
        return (
          <div key={day} style={{ padding: "10px 0", borderBottom: i < 6 ? "1px solid var(--ag-line)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 84, fontSize: 13, fontWeight: 600, color: d.closed ? "var(--ag-ink-3)" : "var(--ag-ink)" }}>{day}</div>
              {d.closed
                ? <div style={{ flex: 1, fontSize: 12, color: "var(--ag-ink-3)", fontStyle: "italic" }}>Cerrado</div>
                : d.h24
                  ? <div style={{ flex: 1, fontSize: 12, color: "var(--ag-c-sales)", fontWeight: 600 }}>● 24 horas</div>
                  : <>
                      {/* Desplegable de hora/minuto (12/jun) — antes input type=time
                          que en desktop selecciona el texto para escribir */}
                      <TimePicker value={d.open || ""} onChange={v => set(i, "open", v)} ariaLabel={`Apertura del ${day}`} />
                      <span style={{ fontSize: 11, color: "var(--ag-ink-3)" }}>a</span>
                      <TimePicker value={d.close || ""} onChange={v => set(i, "close", v)} ariaLabel={`Cierre del ${day}`} />
                    </>
              }
              <button type="button" onClick={() => set(i, "closed", !d.closed)}
                style={{ background: "none", border: 0, fontSize: 11.5, color: d.closed ? "var(--ag-c-sales)" : "var(--ag-c-orders)", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", fontFamily: "inherit" }}>
                {d.closed ? "Abrir" : "Cerrar"}
              </button>
            </div>
            {!d.closed && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginLeft: 92, fontSize: 11, color: "var(--ag-ink-3)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!d.h24} onChange={e => set24h(i, e.target.checked)} style={{ margin: 0, cursor: "pointer" }} />
                Abierto 24 horas
              </label>
            )}
          </div>
        );
      })}
    </SubPage>
  );
}

function ResetPage({ open, showToast, onBack }) {
  const confirmSlide = useConfirm();
  const [resetPin, setResetPin] = useState("");
  const [resetting, setResetting] = useState(false);

  return (
    <SubPage open={open} title="Reinicio administrativo" onBack={onBack}>
      <p className="ag-subpage-intro">
        Elimina <strong>pedidos, ventas, gastos, compras, mermas, cupones y datos CRM</strong>. <strong>No</strong> afecta recetas, ingredientes ni configuración. Antes de borrar, se descarga un respaldo CSV de clientes.
      </p>
      <label className="ag-field-lbl">PIN de seguridad</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password" inputMode="numeric" maxLength={4}
          value={resetPin}
          onChange={e => setResetPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="****"
          style={{
            flex: 1, padding: "12px 14px",
            border: "1.5px solid var(--ag-c-orders)", borderRadius: 10,
            fontSize: 18, textAlign: "center", letterSpacing: 8, fontWeight: 700,
            background: "var(--ag-bg)", color: "var(--ag-ink)", outline: "none",
            fontFamily: "inherit",
          }}
          autoFocus={open}
        />
        <button
          type="button"
          disabled={resetPin !== "4477" || resetting}
          onClick={async () => {
            const ok = await confirmSlide({
              title: "⚠ Reinicio administrativo",
              body: "Se descargará un respaldo CSV de clientes y se borrarán pedidos, ventas, gastos, compras, mermas, cupones y datos CRM. Acción irreversible.",
              label: "Deslizá para borrar todo",
              loadingLabel: "Borrando…",
              successLabel: "Datos eliminados ✓",
            });
            if (!ok) return;
            setResetting(true);
            const result = await resetHistoricalData();
            setResetting(false);
            if (result.ok) {
              const bk = result.backup;
              showToast(bk?.count ? `✓ Respaldo de ${bk.count} clientes. Datos eliminados.` : "Datos eliminados ✓");
              setResetPin("");
              onBack();
            } else {
              const bk = result.backup;
              showToast((bk?.count ? `Respaldo OK (${bk.count}). ` : "") + "Errores: " + result.errors.join(", "));
            }
          }}
          style={{
            padding: "0 18px",
            background: resetPin === "4477" ? "var(--ag-c-orders)" : "var(--ag-bg-soft)",
            color: resetPin === "4477" ? "#fff" : "var(--ag-ink-3)",
            border: 0, borderRadius: 10,
            fontSize: 13, fontWeight: 700,
            cursor: resetPin === "4477" ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >{resetting ? "..." : "Continuar"}</button>
      </div>
      {resetPin.length === 4 && resetPin !== "4477" && (
        <div style={{ fontSize: 11.5, color: "var(--ag-c-orders)", marginTop: 6 }}>Clave incorrecta</div>
      )}

    </SubPage>
  );
}

/* ─── GatewaysSubPage: integraciones OAuth con pasarelas ───
 * Por ahora solo MercadoPago. Flow:
 *   1. Click "Conectar" → redirect a auth.mercadopago.com.ar
 *   2. Cliente autoriza → MP redirige a /mp-callback?code=XXX
 *   3. Componente MpCallback llama a la edge function mp-oauth-callback
 *   4. Token persistido en payment_integrations → vuelta a Settings con badge ✓
 *
 * En el futuro se agregan: Modo, Stripe Connect, etc.
 */
function GatewaysSubPage({ open, showToast, onBack }) {
  const confirmSlide = useConfirm();
  const [mpIntegration, setMpIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  // Formulario de conexión manual
  const [showForm, setShowForm] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  // try/catch (12/jun): si el import dinamico falla (chunk viejo tras un
  // deploy) la promesa rechazaba y "Cargando…" quedaba eterno. Ahora cae
  // a estado desconectado con aviso, y un refresh lo cura.
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const it = await fetchActiveIntegration("mercadopago");
        if (mounted) setMpIntegration(it);
      } catch (e) {
        console.error("GatewaysSubPage load:", e);
        if (mounted) showToast?.("No se pudo cargar el estado de MercadoPago — recargá la página");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  const handleConnectManual = async () => {
    if (!accessToken.trim()) {
      setConnectError("Pegá tu Access Token de MercadoPago");
      return;
    }
    setConnecting(true);
    setConnectError("");
    const res = await connectMercadoPagoManual({ accessToken, publicKey });
    setConnecting(false);
    if (res?.ok) {
      // Recargar la integración (que ahora trae el nuevo registro)
      const updated = await fetchActiveIntegration("mercadopago");
      setMpIntegration(updated);
      setShowForm(false);
      setAccessToken("");
      setPublicKey("");
      showToast?.(`✓ MercadoPago conectado (${res.mp_account?.nickname || res.mp_account?.email || "OK"})`);
    } else {
      setConnectError(res?.error || "Error desconocido");
    }
  };

  const handleDisconnectMp = async () => {
    const okConfirm = await confirmSlide({ title: "Desconectar MercadoPago", body: "Los pedidos pagados anteriormente se conservan. Los nuevos no podrán cobrarse por MP hasta reconectar.", label: "Deslizá para desconectar" });
    if (!okConfirm) return;
    setDisconnecting(true);
    const ok = await disconnectIntegration("mercadopago");
    setDisconnecting(false);
    if (ok) {
      setMpIntegration(null);
      showToast?.("MercadoPago desconectado");
    } else {
      showToast?.("Error al desconectar");
    }
  };

  return (
    <SubPage open={open} title="Pasarelas de pago" onBack={onBack}>
      <p className="ag-subpage-intro">
        Conectá una pasarela para que tus clientes paguen online directo desde el catálogo. El dinero entra a <strong>tu cuenta</strong>, no a la nuestra.
      </p>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ag-ink-3)", fontSize: 12 }}>Cargando…</div>
      ) : (
        <>
          {/* MercadoPago card */}
          <div className="ag-card" style={{ padding: "16px 18px", marginBottom: 14, borderTop: `3px solid ${mpIntegration ? "var(--ag-c-sales)" : "var(--ag-line)"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#009EE3", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                💳
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ag-ink)" }}>MercadoPago</div>
                <div style={{ fontSize: 11, color: "var(--ag-ink-3)" }}>Tarjeta, MP wallet, QR, efectivo en Rapipago</div>
              </div>
              {mpIntegration && (
                <span style={{ padding: "3px 10px", borderRadius: 999, background: "var(--ag-c-sales-soft)", color: "var(--ag-c-sales)", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", flexShrink: 0 }}>
                  ✓ CONECTADA
                </span>
              )}
            </div>

            {mpIntegration ? (
              <>
                <div style={{ fontSize: 11.5, color: "var(--ag-ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
                  Cuenta MP: <strong style={{ color: "var(--ag-ink-2)" }}>
                    {mpIntegration.metadata?.mp_nickname || `#${mpIntegration.external_user_id || "?"}`}
                  </strong>
                  {mpIntegration.metadata?.live_mode === false && (
                    <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "var(--ag-c-stock-soft)", color: "var(--ag-c-stock)", fontSize: 9.5, fontWeight: 800 }}>SANDBOX</span>
                  )}
                  <br />
                  Conectada el {new Date(mpIntegration.connected_at).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
                <button
                  type="button"
                  onClick={handleDisconnectMp}
                  disabled={disconnecting}
                  style={{ width: "100%", padding: "10px", background: "transparent", border: "1px solid var(--ag-c-orders)", color: "var(--ag-c-orders)", borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: disconnecting ? "wait" : "pointer", opacity: disconnecting ? 0.5 : 1 }}
                >
                  {disconnecting ? "Desconectando…" : "Desconectar"}
                </button>
              </>
            ) : showForm ? (
              <>
                <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginBottom: 10, lineHeight: 1.5 }}>
                  Pegá el <strong>Access Token productivo</strong> de tu cuenta MercadoPago.
                  <br />
                  Lo encontrás en <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" style={{ color: "#009EE3", fontWeight: 700 }}>panel MP → tu app → Credenciales productivas</a>.
                </div>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => { setAccessToken(e.target.value); setConnectError(""); }}
                  placeholder="APP_USR-..."
                  autoComplete="off"
                  spellCheck={false}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--ag-line)", background: "var(--ag-bg-soft)", color: "var(--ag-ink)", fontSize: 12, fontFamily: "monospace", marginBottom: 8 }}
                />
                <input
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="Public Key (opcional, APP_USR-... pública)"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--ag-line)", background: "var(--ag-bg-soft)", color: "var(--ag-ink)", fontSize: 12, fontFamily: "monospace", marginBottom: 10 }}
                />
                {connectError && (
                  <div style={{ padding: "8px 10px", marginBottom: 10, background: "var(--ag-c-orders-soft)", color: "var(--ag-c-orders)", borderRadius: 8, fontSize: 11, lineHeight: 1.4 }}>
                    {connectError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setAccessToken(""); setPublicKey(""); setConnectError(""); }}
                    style={{ flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--ag-line)", color: "var(--ag-ink-2)", borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectManual}
                    disabled={connecting || !accessToken.trim()}
                    style={{ flex: 2, padding: "10px", background: "#009EE3", color: "#fff", border: 0, borderRadius: 10, fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: connecting ? "wait" : "pointer", opacity: (connecting || !accessToken.trim()) ? 0.6 : 1 }}
                  >
                    {connecting ? "Validando…" : "Conectar"}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                style={{ width: "100%", padding: "12px", background: "#009EE3", color: "#fff", border: 0, borderRadius: 10, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                🔗 Conectar MercadoPago
              </button>
            )}
          </div>

          <div style={{ fontSize: 11, color: "var(--ag-ink-3)", lineHeight: 1.6, padding: "0 4px" }}>
            <strong>¿Cómo conseguir tu Access Token?</strong>
            <br />
            1. Entrá a <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer" style={{ color: "#009EE3" }}>Mercado Pago Developers</a> con tu cuenta del negocio.
            <br />
            2. Creá una aplicación (si no tenés) — tipo Checkout Pro.
            <br />
            3. Andá a "Credenciales productivas" en el menú lateral.
            <br />
            4. Copiá el Access Token (empieza con <code>APP_USR-</code>).
            <br />
            5. Pegalo arriba y clickeá Conectar.
          </div>

          <div style={{ marginTop: 16, padding: "10px 12px", background: "var(--ag-bg-soft)", borderRadius: 10, fontSize: 11, color: "var(--ag-ink-3)", lineHeight: 1.5 }}>
            <strong>Próximamente:</strong> Modo, Stripe (tarjetas internacionales).
          </div>
        </>
      )}
    </SubPage>
  );
}


/* ─── ChannelsSubPage: CRUD de canales de venta ─────────
   Lista los canales (Rappi/PYa/UberEats/WA/Mostrador/Web propia)
   y permite editar el % de comisión y activar/desactivar.       ── */
function ChannelsSubPage({ open, showToast, onBack }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id, slug, label, commission_pct, is_active}
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const list = await fetchDeliveryChannels({ activeOnly: false });
        if (mounted) setChannels(list);
      } catch (e) {
        console.error("ChannelsSubPage load:", e);
        if (mounted) showToast?.("No se pudieron cargar los canales — recargá la página");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const ok = await upsertDeliveryChannel({
      id: editing.id,
      slug: editing.slug,
      label: editing.label,
      commission_pct: Number(editing.commission_pct) || 0,
      is_active: editing.is_active,
    });
    if (ok) {
      const list = await fetchDeliveryChannels({ activeOnly: false });
      setChannels(list);
      setEditing(null);
      showToast?.("Canal actualizado");
    } else {
      showToast?.("Error al guardar");
    }
    setSaving(false);
  };

  return (
    <SubPage open={open} title="Canales de venta" onBack={onBack}>
      <p className="ag-subpage-intro">
        Por dónde te entran los pedidos. <strong>¿Dónde se ve?</strong> Los pedidos del catálogo
        se marcan solos como "Web propia"; al cargar un pedido manual (Pedidos → +) elegís el canal.
        Con eso, el Resumen del mes desglosa tus ingresos por canal y descuenta la comisión
        de cada plataforma para mostrarte el ingreso real.
      </p>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--ag-ink-3)", fontSize: 12 }}>Cargando…</div>
      ) : channels.length === 0 ? (
        <div style={{ padding: 16, color: "var(--ag-ink-3)", fontSize: 13 }}>No hay canales configurados.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {channels.map(c => (
            <div key={c.id} className="ag-card" style={{ padding: "12px 14px", opacity: c.is_active ? 1 : 0.55 }}>
              {editing?.id === c.id ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label className="ag-field-lbl">Nombre</label>
                      <input
                        className="ag-field-input"
                        value={editing.label}
                        onChange={e => setEditing(p => ({ ...p, label: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="ag-field-lbl">Comisión %</label>
                      <input
                        className="ag-field-input"
                        type="number" min="0" max="100" step="0.5"
                        value={editing.commission_pct}
                        onChange={e => setEditing(p => ({ ...p, commission_pct: e.target.value }))}
                      />
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: "var(--ag-ink-2)" }}>
                    <input
                      type="checkbox"
                      checked={editing.is_active}
                      onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                    />
                    Activo (visible al crear pedidos)
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      disabled={saving}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--ag-line)", background: "transparent", color: "var(--ag-ink-2)", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
                    >Cancelar</button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      style={{ flex: 2, padding: "10px", borderRadius: 10, border: 0, background: "var(--ag-c-sales)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}
                    >{saving ? "Guardando…" : "Guardar"}</button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ag-ink)" }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: "var(--ag-ink-3)", marginTop: 2 }}>
                      {c.commission_pct > 0 ? `Comisión ${c.commission_pct}%` : "Sin comisión"} · {c.is_active ? "Activo" : "Inactivo"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...c })}
                    style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--ag-line)", background: "transparent", color: "var(--ag-ink-2)", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
                  >Editar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SubPage>
  );
}

/* ─── UsarTargetsSubPage: editar % objetivo USAR ───────
 * En español + guia (12/jun): cada % es un TECHO (o piso, EBITDA)
 * independiente sobre el ingreso del mes — NO tienen que sumar 100. */
function UsarTargetsSubPage({ open, settings, setS, showToast, onBack }) {
  const t = settings?.usar_targets || {};
  const set = (k, v) => setS({ ...settings, usar_targets: { ...t, [k]: Math.max(0, Math.min(100, Number(v) || 0)) } });
  const rows = [
    {
      key: "food_cost_pct", label: "Costo de comida (máx.)",
      hint: "De cada $100 que vendés, cuánto puede irse en ingredientes. Lo normal en una dark kitchen: 30%.",
    },
    {
      key: "packaging_pct", label: "Packaging (máx.)",
      hint: "Cajas, bolsas, stickers, cubiertos. Lo normal: 5%.",
    },
    {
      key: "labor_pct", label: "Mano de obra de cocina (máx.)",
      hint: "Sueldos del equipo que cocina y arma pedidos. Lo normal: 20%.",
    },
    {
      key: "marketing_pct", label: "Publicidad (máx.)",
      hint: "Pauta en redes, promos, influencers. Lo normal: 3 a 7%.",
    },
    {
      key: "target_ebitda_pct", label: "Ganancia operativa (mín.)",
      hint: "Lo que tiene que quedarte ANTES de impuestos. Un negocio sano deja 10 a 20%. Este es el único que es un piso: más es mejor.",
    },
  ];

  return (
    <SubPage open={open} title="Objetivos del negocio" onBack={onBack}>
      <p className="ag-subpage-intro">
        Cada porcentaje es un <strong>límite que te ponés a vos mismo</strong> sobre lo que facturás en el mes.
        En el Resumen del mes, cada métrica se pinta <span style={{ color: "var(--ag-c-sales)", fontWeight: 700 }}>verde</span> si
        la cumpliste o <span style={{ color: "var(--ag-c-orders)", fontWeight: 700 }}>roja</span> si te pasaste.
      </p>
      <div style={{
        padding: "10px 12px", borderRadius: 10, marginBottom: 16,
        background: "rgba(245, 158, 11, 0.10)", border: "1px solid rgba(245, 158, 11, 0.25)",
        fontSize: 11.5, lineHeight: 1.55, color: "var(--ag-ink-2)",
      }}>
        💡 <strong>No tienen que sumar 100%</strong> — son límites independientes, no un reparto de la torta.
        Ejemplo: si vendés $1.000.000 y el objetivo de comida es 30%, gastar más de $300.000 en ingredientes pinta esa línea en rojo.
      </div>

      {rows.map(r => (
        <div key={r.key} style={{ marginBottom: 14 }}>
          <label className="ag-field-lbl">{r.label}</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              className="ag-field-input"
              type="number" min="0" max="100" step="0.5"
              value={t[r.key] ?? ""}
              onChange={e => set(r.key, e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ag-ink-2)" }}>%</span>
          </div>
          <p style={{ fontSize: 11, color: "var(--ag-ink-3)", margin: "4px 0 0 2px", lineHeight: 1.5 }}>{r.hint}</p>
        </div>
      ))}
    </SubPage>
  );
}

export default Settings;
