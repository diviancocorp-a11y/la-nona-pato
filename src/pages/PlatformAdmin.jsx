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
import { useState, useEffect, useCallback } from 'react';

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
import { modulosDe, terminologia } from '../modules/registry';

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
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const msg = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 2400); }, []);

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

  useEffect(() => {
    if (!ready || !tenantId) return;
    loadProducts();
    loadOrders();
  }, [ready, tenantId, loadProducts, loadOrders]);

  // ── Acciones de productos ──
  const handleSaveProduct = useCallback(async (form) => {
    const saved = await upsertProduct(tenant.id, form);
    if (!saved?.__error) await loadProducts();
    return saved;
  }, [tenant, loadProducts]);

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
function BagIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h16" />
      <path d="M5 10v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
