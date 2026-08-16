/**
 * PlatformAdmin — el panel de un tenant del EDIFICIO.
 *
 * Por que no es pages/Admin.jsx:
 * el panel legacy carga recipes, ingredients, recipe_ingredients, combo_items,
 * sales, expenses, waste_log y settings. De todo eso el edificio tiene CERO
 * tablas. Bifurcarlo con `business.platform` habria puesto un `if` en cada
 * hook y cada pantalla para que la mitad quedara apagada igual. Este panel
 * arranca por lo minimo que desbloquea a un tenant nuevo — cargar productos y
 * atender pedidos — y crece desde ahi. El legacy queda intacto.
 *
 * El chrome (topbar, nav, tokens) se reusa por CSS, no por componente:
 * AdminTopbar/AdminProfileMenu consultan `admin_users`, que en el edificio no
 * existe, y su menu apunta a pantallas legacy.
 */
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';

import usePlatformTenant from '../hooks/usePlatformTenant';
import LoginScreen from '../components/admin/LoginScreen';
import AdminBackdrop from '../components/admin/shared/AdminBackdrop';
import ConfirmSlideProvider from '../components/ConfirmSlideProvider';
import ProductsPanel from '../components/admin/platform/ProductsPanel';
import OrdersPanel from '../components/admin/platform/OrdersPanel';
import {
  fetchProducts, upsertProduct, setProductActive, deleteProduct,
  fetchOrders, setOrderStatus, OPEN_ORDER_STATUSES,
} from '../services/platformAdmin';
import { fetchSettings, saveSettings, fetchTenantBrand } from '../services/platformSettings';
import { getTenantSlugSync } from '../lib/activeTenant';
import {
  fetchIngredients, upsertIngredient as upsertIngrediente, archiveIngredient as archivarIngrediente,
} from '../services/platformInventory';
import {
  fetchProductIngredients, agruparPorProducto, saveProductIngredients,
} from '../services/platformRecipes';
import {
  fetchExpenses, createExpense, voidExpense as anularGasto, registerPurchase,
} from '../services/platformFinance';
import {
  fetchSuppliers, upsertSupplier, toggleSupplierActive, deleteSupplier,
} from '../services/platformSuppliers';
import {
  modulosDe, terminologia, tieneModulo, usaContabilidadUsar,
} from '../modules/registry';

// Settings es el componente del admin legacy, reusado tal cual: la unica
// diferencia es que se le inyecta con que guardar y que zonas apagar. Va lazy
// para que su peso (arrastra editores de QRs, paginas y pasarelas por imports
// estaticos) no entre en el chunk del panel, que se carga siempre.
const Settings = lazy(() => import('../components/admin/Settings'));
// Stock: mismo componente del admin legacy, con el saver inyectado.
const Stock = lazy(() => import('../components/admin/Stock'));
// Finanzas: contenedor de Gastos + Compra + Proveedores (Etapa 3). Lazy por
// lo mismo que Settings — arrastra Finance.jsx entero, que son 2000 lineas.
const FinanzasPanel = lazy(() => import('../components/admin/platform/FinanzasPanel'));

// Lo que el edificio todavia no tiene tabla para sostener. Cada false se
// convierte en true cuando llegue su etapa (platform/PLAN-ERP.md).
const CAPACIDADES_EDIFICIO = {
  qrs: false,        // tabla dynamic_qrs
  paginas: false,    // tabla info_pages
  pasarelas: false,  // tabla payment_integrations
  canales: false,    // tabla delivery_channels
  riesgo: false,     // el reset borra tablas del ERP viejo
};

import '../styles/admin-tokens.css';
import '../styles/admin-bg.css';
import '../styles/admin-topbar.css';
import '../styles/admin-bottomnav.css';
import '../styles/admin-cards.css';
import '../styles/admin-shared.css';

// El registry es data pura (sin JSX) para poder leerlo desde services y tests.
// Los iconos se mapean aca, por id de modulo.
const ICONOS = {
  products: BoxIcon,
  orders: BagIcon,
  stock: StockIcon,
  finanzas: MoneyIcon,
};

function Centered({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 24, textAlign: 'center', color: 'var(--ag-ink-3)',
    }}>
      <div style={{ maxWidth: 380 }}>{children}</div>
    </div>
  );
}

export default function PlatformAdmin() {
  const { session, tenant, role, status, doLogin, doLogout } = usePlatformTenant();

  const [tab, setTab] = useState('products');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ag-theme') || 'light'; } catch { return 'light'; }
  });

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sett, setSett] = useState(null);
  const [ings, setIngs] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [recetas, setRecetas] = useState(null); // Map product_id -> lineas
  const [ov, setOv] = useState(null); // overlays de Stock (editIng / waste)
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const msg = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 2400); }, []);

  // ── Titulo de la pestania ──
  // applyTenantHead solo se llama desde Catalog.jsx, asi que en /admin el
  // <title> quedaba con el del build: TODOS los tenants decian "Cochi — ¡Que
  // bien se cochina aqui!". Se resuelve antes del login a proposito (RPC
  // publico): la pestania tiene que decir de quien es desde el primer render,
  // sobre todo con varios negocios abiertos a la vez.
  useEffect(() => {
    let vivo = true;
    const previo = document.title;
    fetchTenantBrand(getTenantSlugSync()).then((brand) => {
      if (vivo && brand?.name) document.title = `${brand.name} · Panel`;
    });
    return () => { vivo = false; document.title = previo; };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('ag-theme', next); } catch { /* noop */ }
  };

  // ── Carga inicial (solo con el gate ya en verde) ──
  const ready = status === 'ok';

  // Las lecturas se acotan al tenant de ESTE host. No alcanza con RLS: un
  // dueno de varios negocios es miembro de todos, y sin el filtro el panel de
  // cada uno mostraba los productos de los otros.
  const tenantId = tenant?.id || null;

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoadingProducts(true);
    setProducts(await fetchProducts(tenantId));
    setLoadingProducts(false);
  }, [tenantId]);

  const loadOrders = useCallback(async () => {
    if (!tenantId) return;
    setLoadingOrders(true);
    setOrders(await fetchOrders(tenantId));
    setLoadingOrders(false);
  }, [tenantId]);

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    setSett(await fetchSettings(tenantId));
  }, [tenantId]);

  const loadIngs = useCallback(async () => {
    if (!tenantId) return;
    setIngs(await fetchIngredients(tenantId));
  }, [tenantId]);

  const loadGastos = useCallback(async () => {
    if (!tenantId) return;
    setGastos(await fetchExpenses(tenantId));
  }, [tenantId]);

  // Todas las lineas de receta de una: la lista muestra el margen de cada
  // producto, y pedirlas por producto seria una consulta por fila en pantalla.
  const loadRecetas = useCallback(async () => {
    if (!tenantId) return;
    setRecetas(agruparPorProducto(await fetchProductIngredients(tenantId)));
  }, [tenantId]);

  useEffect(() => {
    if (!ready || !tenantId) return;
    loadProducts();
    loadOrders();
    loadSettings();
    loadIngs();
    loadRecetas();
    loadGastos();
  }, [ready, tenantId, loadProducts, loadOrders, loadSettings, loadIngs, loadRecetas, loadGastos]);

  // Contrato que espera Stock.jsx: recibe el insumo entero, devuelve el
  // guardado o un {__error}.
  const guardarIngrediente = useCallback(
    (ing) => upsertIngrediente(tenantId, ing),
    [tenantId]
  );

  /* ── Etapa 3: gastos, compras y proveedores ──
     Los componentes de Finance.jsx y Suppliers.jsx esperan funciones sin
     tenant: se lo atamos aca. Van con useCallback porque ExpForm y Purchase
     los usan como dependencia de un useEffect — una funcion nueva en cada
     render dispararia la carga de proveedores en loop. */
  const crearGasto = useCallback((e) => createExpense(tenantId, e), [tenantId]);

  const registrarCompra = useCallback((payload) => registerPurchase(tenantId, payload), [tenantId]);

  const traerProveedores = useCallback((opts) => fetchSuppliers(tenantId, opts), [tenantId]);
  const guardarProveedor = useCallback((s) => upsertSupplier(tenantId, s), [tenantId]);

  // Lo que Purchase llama despues de registrar (su prop `loadAll`). Una compra
  // toca stock Y gastos: releer solo los gastos dejaria la pantalla de Stock
  // mostrando el stock de antes, y el margen de las recetas calculado con el
  // costo viejo del insumo.
  const recargarTrasCompra = useCallback(async () => {
    await Promise.all([loadIngs(), loadGastos()]);
  }, [loadIngs, loadGastos]);

  // El contrato que espera Settings: recibe el objeto entero y devuelve el
  // guardado, o null si fallo. saveSettings filtra por lista blanca, asi que
  // mandarle todo el objeto es inofensivo.
  const guardarSettings = useCallback(async (valores) => {
    const r = await saveSettings(tenantId, valores);
    if (r?.__error) { msg(r.message || 'No se pudo guardar'); return null; }
    return r;
  }, [tenantId, msg]);

  // ── Acciones de productos ──
  const handleSaveProduct = useCallback(async (form, lineas) => {
    const saved = await upsertProduct(tenant.id, form);
    if (saved?.__error) return saved;

    // La receta va DESPUES: un producto nuevo recien acá tiene id.
    if (lineas) {
      const r = await saveProductIngredients(tenant.id, saved.id, lineas);
      if (r?.__error) {
        // El producto SI se guardó. Decirlo, en vez de un "no se pudo
        // guardar" que haría pensar que se perdió todo.
        await loadProducts();
        return { __error: 'receta', message: `Se guardó el producto, pero la receta no: ${r.message}` };
      }
      await loadRecetas();
    }
    await loadProducts();
    return saved;
  }, [tenant, loadProducts, loadRecetas]);

  const handleToggleActive = useCallback(async (p) => {
    // Optimista: el toggle tiene que sentirse instantaneo. Si falla, se revierte.
    setProducts(list => list.map(x => (x.id === p.id ? { ...x, active: !p.active } : x)));
    const ok = await setProductActive(p.id, !p.active);
    if (!ok) {
      setProducts(list => list.map(x => (x.id === p.id ? { ...x, active: p.active } : x)));
      msg('No se pudo cambiar la visibilidad');
    }
  }, [msg]);

  const handleDeleteProduct = useCallback(async (id) => {
    const res = await deleteProduct(id);
    if (res === true) await loadProducts();
    return res;
  }, [loadProducts]);

  // ── Acciones de pedidos ──
  const handleSetOrderStatus = useCallback(async (id, next) => {
    const res = await setOrderStatus(id, next);
    if (res === true) setOrders(list => list.map(o => (o.id === id ? { ...o, status: next } : o)));
    return res;
  }, []);

  /* ── Gates ── */
  if (status === 'checking') return <Centered>Cargando...</Centered>;
  if (status === 'anon') return <LoginScreen onLogin={doLogin} />;

  if (status === 'no-tenant') {
    return (
      <Centered>
        <p style={{ color: 'var(--ag-ink)', marginBottom: 8 }}>Esta dirección no es de ningún negocio.</p>
        <p style={{ fontSize: 13 }}>
          Entrá al panel desde el dominio de tu negocio, por ejemplo <code>tunegocio.divianco.app/admin</code>.
        </p>
      </Centered>
    );
  }

  if (status === 'denied') {
    return (
      <Centered>
        <p style={{ color: 'var(--ag-ink)', marginBottom: 8 }}>Tu cuenta no tiene acceso a este negocio.</p>
        <p style={{ fontSize: 13, marginBottom: 18 }}>
          Entraste como <strong>{session?.user?.email}</strong>. Pedile al dueño que te agregue, o cerrá
          sesión y entrá con la cuenta correcta.
        </p>
        <button type="button" className="ag-btn-ghost" onClick={doLogout}>Cerrar sesión</button>
      </Centered>
    );
  }

  const openCount = orders.filter(o => OPEN_ORDER_STATUSES.includes(o.status)).length;
  const themeClass = theme === 'dark' ? 'ag-theme-dark' : 'ag-theme-light';

  // Que secciones ve este negocio segun su rubro. modulosDe() ya descarta las
  // que todavia no estan implementadas, asi que declarar "agenda" para
  // barberia no ensucia la nav hasta que exista.
  const tabs = modulosDe(tenant?.vertical)
    .filter(m => ICONOS[m.id])
    .map(m => ({
      id: m.id,
      // El modulo de catalogo se llama distinto en cada rubro.
      label: m.id === 'products' ? terminologia(tenant?.vertical).plural : m.label,
      Icon: ICONOS[m.id],
    }));

  return (
    <ConfirmSlideProvider>
      <div className={`ag-root ${themeClass}`} style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AdminBackdrop />

        {toast && <div className="toast" style={{ zIndex: 1000 }}>{toast}</div>}

        <header className="ag-topbar">
          <div className="ag-topbar-title" style={{ flex: 1, textAlign: 'left' }}>{tenant?.name}</div>
          <div className="ag-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="ag-theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              type="button"
              className="ag-theme-toggle"
              onClick={() => setTab(tab === 'config' ? 'products' : 'config')}
              aria-label="Configuración"
              title="Configuración del negocio"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              type="button"
              className="ag-btn-mini"
              onClick={doLogout}
              title={`${session?.user?.email || ''}${role ? ` · ${role === 'owner' ? 'Dueño' : 'Staff'}` : ''}`}
            >
              Salir
            </button>
          </div>
        </header>

        <main style={{
          position: 'relative', zIndex: 2, flex: 1,
          display: 'flex', flexDirection: 'column', minHeight: 0,
          paddingBottom: 'var(--ag-bottom-nav-h, 76px)',
        }}>
          {tab === 'products' && (
            <ProductsPanel
              products={products}
              vertical={tenant?.vertical}
              loading={loadingProducts}
              ingredientes={ings}
              recetas={recetas}
              settings={sett}
              onSave={handleSaveProduct}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteProduct}
              showToast={msg}
            />
          )}
          {tab === 'orders' && (
            <OrdersPanel
              orders={orders}
              loading={loadingOrders}
              onSetStatus={handleSetOrderStatus}
              showToast={msg}
            />
          )}
          {tab === 'stock' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <Stock
                ingredients={ings}
                setIngredients={setIngs}
                recipes={[]}
                overlay={ov}
                setOverlay={setOv}
                showToast={msg}
                settings={sett || {}}
                onUpsert={guardarIngrediente}
                onArchive={archivarIngrediente}
                permiteMerma={false}
              />
            </Suspense>
          )}
          {tab === 'finanzas' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <FinanzasPanel
                expenses={gastos}
                setExpenses={setGastos}
                ingredients={ings}
                setIngredients={setIngs}
                settings={sett}
                user={session?.user}
                showToast={msg}
                recargar={recargarTrasCompra}
                // Comprar insumos solo tiene sentido donde hay insumos que
                // stockear. Una barberia ve Gastos y Proveedores, no Compra.
                permiteCompras={tieneModulo(tenant?.vertical, 'stock')}
                permiteUsar={usaContabilidadUsar(tenant?.vertical)}
                onCrearGasto={crearGasto}
                onAnularGasto={anularGasto}
                onRegistrarCompra={registrarCompra}
                onCrearInsumo={guardarIngrediente}
                onFetchProveedores={traerProveedores}
                onSaveProveedor={guardarProveedor}
                onToggleProveedor={toggleSupplierActive}
                onDeleteProveedor={deleteSupplier}
              />
            </Suspense>
          )}
          {tab === 'config' && (
            sett
              ? (
                <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
                  <Settings
                    settings={sett}
                    setSettings={setSett}
                    showToast={msg}
                    onSave={guardarSettings}
                    capacidades={CAPACIDADES_EDIFICIO}
                    onBack={() => setTab('products')}
                  />
                </Suspense>
              )
              : <div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando configuración...</div>
          )}
        </main>

        <nav className="ag-bottom-nav" aria-label="Navegación principal">
          {tabs.map(({ id, label, Icon }) => {
            const isActive = tab === id;
            const badge = id === 'orders' ? openCount : 0;
            return (
              <button
                key={id}
                type="button"
                className={`ag-nav-item ${isActive ? 'active' : ''}`}
                data-section={id}
                onClick={() => setTab(id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${label}${badge ? ` (${badge} en curso)` : ''}`}
              >
                {badge > 0 && <span className="ag-nav-badge">{badge > 99 ? '99+' : badge}</span>}
                <Icon />
                <span className="ag-nav-label">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </ConfirmSlideProvider>
  );
}

/* ─── Iconos ─── */
function BoxIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function StockIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h18v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 7l2-4h14l2 4" />
      <path d="M9 11h6" />
    </svg>
  );
}
function MoneyIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h16" />
      <path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
