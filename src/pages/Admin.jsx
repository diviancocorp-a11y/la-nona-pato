import { useState, useCallback, useEffect } from "react";
import { OrderStatus } from "../lib/utils";
import useFeature from "../hooks/useFeature";

// Hooks
import useAdminData from "../hooks/useAdminData";
import useOrderWorkflow from "../hooks/useOrderWorkflow";
import useFinancials from "../hooks/useFinancials";
import useAdminGate from "../hooks/useAdminGate";
import AccessDenied from "../components/admin/AccessDenied";

// Componentes nuevos · chrome del Admin (sistema visual v2)
import AdminBackdrop from "../components/admin/shared/AdminBackdrop";
import AdminTopbar from "../components/admin/shared/AdminTopbar";
import BottomNav from "../components/admin/shared/BottomNav";
import AdminDrawer from "../components/admin/shared/AdminDrawer";
import ConfirmSlideProvider from "../components/ConfirmSlideProvider";

// Pantallas (todavía visuales viejos — se adaptan en próximos pasos)
import LoginScreen from "../components/admin/LoginScreen";
import Home from "../components/admin/Home";
import Stock from "../components/admin/Stock";
import Recipes from "../components/admin/Recipes";
import Orders from "../components/admin/Orders";
import { Expenses, Purchase, SalesView } from "../components/admin/Finance";
import CRM from "../components/admin/CRM";
import Waste from "../components/admin/Waste";
import Settings from "../components/admin/Settings";
import Invoicing from "../components/admin/Invoicing";
import PushNotifications from "../components/admin/PushNotifications";
import MonthSummary from "../components/admin/MonthSummary";
import Suppliers from "../components/admin/Suppliers";
import Users from "../components/admin/Users";
import BrandModal from "../components/admin/shared/BrandModal";
import { CancelDlg, StockWarningDlg, NewOrderOverlay } from "../components/admin/Dialogs";

// Estilos del sistema visual v2
import "../styles/admin-tokens.css";
import "../styles/admin-bg.css";
import "../styles/admin-topbar.css";
import "../styles/admin-bottomnav.css";
import "../styles/admin-cards.css";
import "../styles/admin-orders.css";
import "../styles/admin-shared.css";

export default function Admin() {
  // Tab inicial desde query param (?tab=orders): lo usa el push de "pedido
  // nuevo" para aterrizar directo en Pedidos (fix 12/jun — antes el push
  // apuntaba a /admin/orders, ruta inexistente, y terminaba en el catalogo)
  const [tab, setTab] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      return ["orders", "recipes", "stock", "sales"].includes(t) ? t : "home";
    } catch { return "home"; }
  });
  const [ov, setOv] = useState(null);
  const [toast, setToast] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ag-theme') || 'light' } catch { return 'light' }
  });

  // ── PWA: ícono de Dico cuando estás en /admin (manifest + apple-touch + theme-color) ──
  useEffect(() => {
    const q = (sel) => document.querySelector(sel);
    const manifestEl = q('link[rel="manifest"]');
    const appleEl = q('link[rel="apple-touch-icon"]');
    const themeLightEl = q('meta[name="theme-color"][media*="light"]');
    const themeDarkEl = q('meta[name="theme-color"][media*="dark"]');

    const prev = {
      manifest: manifestEl?.href,
      apple: appleEl?.href,
      themeLight: themeLightEl?.content,
      themeDark: themeDarkEl?.content,
    };
    if (manifestEl) manifestEl.href = "/admin-manifest.json";
    if (appleEl) appleEl.href = "/brand/hermes-apple-touch.png";
    if (themeLightEl) themeLightEl.content = "#F59E0B";
    if (themeDarkEl) themeDarkEl.content = "#0a0a0a";

    return () => {
      if (manifestEl && prev.manifest) manifestEl.href = prev.manifest;
      if (appleEl && prev.apple) appleEl.href = prev.apple;
      if (themeLightEl && prev.themeLight) themeLightEl.content = prev.themeLight;
      if (themeDarkEl && prev.themeDark) themeDarkEl.content = prev.themeDark;
    };
  }, []);

  // Feature flags
  const ffInvoice = useFeature('E_INVOICE');

  const msg = useCallback(m => { setToast(m); setTimeout(() => setToast(""), 2200); }, []);

  const handleThemeChange = useCallback((next) => {
    setTheme(next);
    try { localStorage.setItem('ag-theme', next) } catch { /* noop */ }
  }, []);

  // Data layer
  const {
    session, checking, doLogin, doLogout,
    ings, setIngs, recs, setRecs, sales, setSales,
    exps, setExps, orders, setOrders, sett, setSett,
    waste, loaded, loadAll, newAlertCount, ackOrders,
    DEFAULT_SETTINGS,
  } = useAdminData();

  // Financial computations
  const {
    calculateRecipeCost: rc, lowStockIngredients: low, activeOrders: actOrd,
    monthSales: tS, monthExpenses: tE, monthProductionCost: tCR,
    monthWasteCost: tW, monthProfit: prof, profitMargin: mar,
    wastePct, monthFixedExpenses, monthVariableExpenses,
    monthGrossMargin, grossMarginPct,
    prevMonthSales, prevMonthExpenses, prevMonthProfit, prevMonthOrdersCount,
  } = useFinancials({ ings, recs, sales, exps, orders, waste, settings: sett });

  // Order workflow
  const { moveOrder: moveOrd, confirmCancel, addOrder: addOrd } = useOrderWorkflow({
    orders, setOrders, recs, ings, setIngs, sett, loaded, setSales, setOv, msg,
  });

  // Gate de rol: solo usuarios en admin_users entran al panel. Un cliente
  // del catalogo tiene sesion pero NO fila en admin_users -> AccessDenied.
  const gate = useAdminGate(session?.user?.id || null);

  // Loading / Login gates
  if (checking) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--ag-ink-3)" }}>Cargando...</div>;
  if (!session) return <LoginScreen onLogin={doLogin} />;
  if (gate.status === "checking") return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--ag-ink-3)" }}>Cargando...</div>;
  if (gate.status === "denied") return <AccessDenied email={session?.user?.email || ""} />;

  const DEF = DEFAULT_SETTINGS;
  const themeClass = theme === 'dark' ? 'ag-theme-dark' : 'ag-theme-light';
  const newOrdersCount = orders.filter(o => o.status === OrderStatus.NEW).length;

  /* ─── Bottom nav: 5 secciones (Inicio · Pedidos · Recetas · Stock · Ventas).
     Compras/Gastos/Más se mudaron al menú hamburguesa (jun 2026). ─── */
  const handleNavChange = (nextTab) => {
    setTab(nextTab);
  };

  /* Tab activo → item resaltado. Las pantallas que viven en el menú
     hamburguesa o en el dropdown de perfil no resaltan ningún item. */
  const NAV_TABS = ['home', 'orders', 'recipes', 'stock', 'sales'];
  const activeNav = NAV_TABS.includes(tab) ? tab : null;

  /* ─── Menú hamburguesa: todo lo que salió del bottom nav ─── */
  const drawerItems = [
    {
      key: 'purchase', state: 'prep', label: 'Compras', hint: 'Ingreso de mercadería',
      onClick: () => setTab('purchase'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    },
    {
      key: 'expenses', state: 'orders', label: 'Gastos', hint: 'Registro y categorías',
      onClick: () => setTab('expenses'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10 M15 9.5c0-1.1-1.34-2-3-2s-3 .9-3 2 1.34 2 3 2 3 .9 3 2-1.34 2-3 2-3-.9-3-2"/></svg>,
    },
    {
      key: 'crm', state: 'crm', label: 'CRM', hint: 'Clientes y fidelización',
      onClick: () => setTab('crm'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
      key: 'waste', state: 'orders', label: 'Merma', hint: 'Pérdidas y ajustes',
      onClick: () => setTab('waste'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>,
    },
    {
      key: 'suppliers', state: 'prep', label: 'Proveedores', hint: 'Carniceros, verdulería, etc.',
      onClick: () => setTab('suppliers'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
    {
      key: 'push', state: 'crm', label: 'Notificaciones push', hint: 'Avisos al celular de tus clientes',
      onClick: () => setOv({ type: 'push' }),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    },
    {
      key: 'users', state: 'crm', label: 'Usuarios', hint: 'Acceso y roles del equipo',
      onClick: () => setTab('users'),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>,
    },
    ...(ffInvoice ? [{
      key: 'invoicing', state: 'prep', label: 'Facturación', hint: 'AFIP · electrónica',
      onClick: () => setOv({ type: 'invoicing' }),
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>,
    }] : []),
  ];

  const businessName = sett.biz_name || DEF.biz_name;

  return (
    <ConfirmSlideProvider>
    <div className={`ag-root ${themeClass}`} style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AdminBackdrop />

      {toast && <div className="toast" style={{ zIndex: 1000 }}>{toast}</div>}

      <AdminTopbar
        title={businessName}
        menuOpen={drawerOpen}
        onMenu={() => setDrawerOpen(o => !o)}
        theme={theme}
        onToggleTheme={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
        email={session?.user?.email || ''}
        name={session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || ''}
        userId={session?.user?.id || null}
        onPersonalizacion={() => setTab("personalizacion")}
        onOpenSection={(key) => setTab(key)}
        onLogout={doLogout}
      />

      <main style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: 'var(--ag-bottom-nav-h, 76px)' }}>
        {tab === "home"     && <Home user={session?.user} lowStockIngredients={low} monthSales={tS} monthExpenses={tE} monthProfit={prof} profitMargin={mar} prevMonthSales={prevMonthSales} prevMonthExpenses={prevMonthExpenses} prevMonthProfit={prevMonthProfit} prevMonthOrdersCount={prevMonthOrdersCount} sales={sales} orders={orders} recipes={recs} ingredients={ings} calculateRecipeCost={rc} activeOrders={actOrd} settings={sett} waste={waste} onStock={() => setTab("stock")} onOrders={() => setTab("orders")} onShowToast={msg} onMonthSummary={() => setTab("summary")} />}
        {tab === "summary"  && <MonthSummary sales={sales} expenses={exps} orders={orders} recipes={recs} ingredients={ings} waste={waste} settings={sett} calculateRecipeCost={rc} onBack={() => setTab("home")} />}
        {tab === "orders"   && <Orders orders={orders} recipes={recs} moveOrderStatus={moveOrd} addOrder={addOrd} overlay={ov} setOverlay={setOv} showToast={msg} settings={sett} onUpdateOrder={(id, changes) => setOrders(p => p.map(o => o.id === id ? { ...o, ...changes } : o))} />}
        {tab === "stock"    && <Stock ingredients={ings} setIngredients={setIngs} recipes={recs} overlay={ov} setOverlay={setOv} showToast={msg} settings={sett} setSettings={setSett} loadAll={loadAll} />}
        {tab === "recipes"  && <Recipes recipes={recs} setRecipes={setRecs} ingredients={ings} calculateRecipeCost={rc} overlay={ov} setOverlay={setOv} showToast={msg} loadAll={loadAll} settings={sett} />}
        {tab === "sales"    && <SalesView sales={sales} setSales={setSales} orders={orders} recipes={recs} calculateRecipeCost={rc} overlay={ov} setOverlay={setOv} showToast={msg} />}
        {tab === "crm"      && <CRM orders={orders} recipes={recs} ingredients={ings} showToast={msg} />}
        {tab === "waste"    && <Waste waste={waste} orders={orders} recipes={recs} ingredients={ings} setIngredients={setIngs} showToast={msg} loadAll={loadAll} />}
        {tab === "suppliers" && <Suppliers onBack={() => setTab("home")} showToast={msg} />}
        {tab === "users"    && <Users showToast={msg} onBack={() => setTab("home")} currentUserId={session?.user?.id} />}
        {tab === "purchase"  && <Purchase ingredients={ings} setIngredients={setIngs} expenses={exps} setExpenses={setExps} settings={sett} onClose={() => setTab("home")} showToast={msg} loadAll={loadAll} user={session?.user} />}
        {tab === "expenses"  && <Expenses expenses={exps} setExpenses={setExps} settings={sett} setSettings={setSett} showToast={msg} onClose={() => setTab("home")} user={session?.user} />}
        {/* Páginas de configuración (desde el dropdown de perfil del topbar) */}
        {(tab === "cfg-operacion" || tab === "cfg-finanzas" || tab === "cfg-riesgo") && (
          <Settings
            settings={sett}
            setSettings={setSett}
            showToast={msg}
            section={tab.replace("cfg-", "")}
            onBack={() => setTab("home")}
          />
        )}
        {/* Personalización como página (antes modal/ruta aparte) */}
        {tab === "personalizacion" && (
          <BrandModal
            asPage
            open={true}
            settings={sett}
            setSettings={setSett}
            onClose={() => setTab("home")}
            showToast={msg}
          />
        )}
      </main>

      {/* Overlays (sin cambios) */}
      {ov?.type === "cancel"       && <CancelDlg order={ov.order} recs={recs} ings={ings} onClose={() => setOv(null)} onConfirm={ret => confirmCancel(ov.orderId, ret)} />}
      {ov?.type === "stockWarning" && <StockWarningDlg deficits={ov.deficits} onClose={() => setOv(null)} onForce={async () => { setOv(null); await moveOrd(ov.orderId, OrderStatus.PREPARING, true); }} />}
      {/* Limpieza 12/jun: overlays "exports" y "categories" eliminados —
          el export vive en Resumen del mes y el editor de categorias en
          Recetas (boton 🏷️). Push recupero entrada en el menu hamburguesa. */}
      {ov?.type === "invoicing"    && <Invoicing orders={orders} recipes={recs} sett={sett} msg={msg} onClose={() => setOv(null)} />}
      {ov?.type === "push"         && <PushNotifications msg={msg} onClose={() => setOv(null)} />}

      {/* New order alert overlay */}
      {newAlertCount > 0 && <NewOrderOverlay count={newAlertCount} onAck={() => { ackOrders(); setTab('orders'); }} />}

      <BottomNav
        active={activeNav}
        onChange={handleNavChange}
        badges={{ orders: newOrdersCount }}
      />

      {/* Menú hamburguesa: desplegable que nace del botón morph del topbar.
          Logout y correo viven en la burbuja de perfil. */}
      <AdminDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        businessName={businessName}
        items={drawerItems}
      />

      {/* Personalizacion migrada a /admin/personalizacion (#95).
          BrandModal sigue siendo el componente reusado por esa ruta.
          Esta ruta queda como fallback por compat (avatar -> navigate). */}
    </div>
    </ConfirmSlideProvider>
  );
}
