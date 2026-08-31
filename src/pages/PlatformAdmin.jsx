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
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';

import usePlatformTenant from '../hooks/usePlatformTenant';
import LoginScreen from '../components/admin/LoginScreen';
import AdminBackdrop from '../components/admin/shared/AdminBackdrop';
import ConfirmSlideProvider from '../components/ConfirmSlideProvider';
import ProductsPanel from '../components/admin/platform/ProductsPanel';
import OrdersPanel from '../components/admin/platform/OrdersPanel';
import DicoAvisos from '../components/admin/platform/DicoAvisos';
import DicoSlot from '../components/dico/DicoSlot';
import DicoOportunidades from '../components/admin/platform/DicoOportunidades';
import AdminPushBanner from '../components/admin/shared/AdminPushBanner';
import NavInferior from '../components/admin/platform/NavInferior';
import {
  fetchProducts, upsertProduct, setProductActive, deleteProduct,
  fetchOrders, setOrderStatus, OPEN_ORDER_STATUSES, PlatformOrderStatus,
  fetchOrderItemsByOrder,
} from '../services/platformAdmin';
import { fetchSales, createSale, completeOrder } from '../services/platformSales';
import { fetchCustomerStats } from '../services/platformCrm';
import { fetchWaste, registerWaste } from '../services/platformWaste';
import { uploadTenantImage } from '../services/platformStorage';
import {
  fetchResources, moveResource, saveResource, archiveResource, siguienteNombre,
  fetchAppointments, fetchUtilization, fetchWaitlist,
} from '../services/platformScheduling';
import { fetchDefaultBranch } from '../services/platformInventoryLedger';
import {
  fetchTurnoAbierto, fetchTurnos, abrirTurno, cerrarTurno, esperadoEnCaja,
} from '../services/platformCaja';
import {
  fetchPersonal, fetchFichajesAbiertos, ficharEntrada, ficharSalida,
  fetchCostoLaboral,
} from '../services/platformPersonal';
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
import { puedeVer, pantallaInicial } from '../modules/roles';

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
// Ventas: SalesView + MonthSummary del legacy (Etapa 4). Lazy: MonthSummary
// arrastra los analisis USAR y el exportador de informes.
const VentasPanel = lazy(() => import('../components/admin/platform/VentasPanel'));
// Equipo: pantalla del legacy tal cual. El service bifurca a tenant-users,
// que scopea todo al negocio de este host.
// Equipo: pantalla propia del edificio (6f). El `Users` legacy maneja un rol
// unico y global; aca una persona tiene varios roles y puede estar acotada a
// una sucursal.
const Users = lazy(() => import('../components/admin/platform/EquipoDelNegocio'));
// Salon: el plano del local (Etapa 6c). Lazy porque solo lo ve un negocio
// fisico y arrastra su propio editor de arrastre.
const MapaDeMesas = lazy(() => import('../components/admin/platform/MapaDeMesas'));
// El alta de mesas viaja con el salon: quien no tiene local no lo baja nunca.
const EditorDeMesa = lazy(() => import('../components/admin/platform/EditorDeMesa'));
// Cobros online: se abre una vez en la vida del negocio, asi que no tiene por
// que estar en el chunk que se carga siempre.
const CobrosOnline = lazy(() => import('../components/admin/platform/CobrosOnline'));
// Caja: el turno con su arqueo. Lazy por lo mismo que el salon.
const CajaPanel = lazy(() => import('../components/admin/platform/CajaPanel'));
// Equipo: quien esta trabajando y cuanto cuesta el turno (6e).
const PersonalPanel = lazy(() => import('../components/admin/platform/PersonalPanel'));

// Lo que el edificio todavia no tiene tabla para sostener. Cada false se
// convierte en true cuando llegue su etapa (platform/PLAN-ERP.md).
const CAPACIDADES_EDIFICIO = {
  qrs: true,         // tabla dynamic_qrs (migracion 0037)
  paginas: true,     // tabla info_pages (migracion 0037)
  pasarelas: true,   // tabla payment_integrations (migracion 0051)
  canales: false,    // tabla delivery_channels
  riesgo: false,     // el reset borra tablas del ERP viejo
};

import '../styles/admin-tokens.css';
import '../styles/admin-bg.css';
import '../styles/admin-topbar.css';
import '../styles/admin-bottomnav.css';
import '../styles/admin-cards.css';
import '../styles/admin-shared.css';
// Machine Soul (Phase 3B): reemplaza la capa visual del shell. Va ultimo
// a proposito, para pisar la de admin-topbar/bottomnav sin tocar su markup.
import '../styles/admin-shell.css';

// El registry es data pura (sin JSX) para poder leerlo desde services y tests.
// Los iconos se mapean aca, por id de modulo.
const ICONOS = {
  products: BoxIcon,
  orders: BagIcon,
  stock: StockIcon,
  finanzas: MoneyIcon,
  ventas: ChartIcon,
  mesas: MesasIcon,
  caja: CajaIcon,
  personal: PersonalIcon,
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
  const { session, tenant, role, roles, status, doLogin, doLogout } = usePlatformTenant();

  const [tab, setTab] = useState('products');
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('ag-theme') || 'light'; } catch { return 'light'; }
  });

  // Salon (6c). `branch` es la sucursal por defecto: mientras el negocio tenga
  // una sola, nunca se muestra selector — ver platform/PLAN-LOCAL-Y-ROLES.md.
  const [branch, setBranch] = useState(null);
  const [recursos, setRecursos] = useState([]);
  const [turno, setTurno] = useState(null);
  const [turnosPrevios, setTurnosPrevios] = useState([]);
  const [esperado, setEsperado] = useState(0);
  const [equipo, setEquipo] = useState([]);
  const [fichajes, setFichajes] = useState([]);
  const [costoLaboral, setCostoLaboral] = useState(null);
  const [reservasHoy, setReservasHoy] = useState([]);
  const [utilizacion, setUtilizacion] = useState(null);
  // La mesa que se esta creando o editando. Null = el editor esta cerrado.
  const [mesaEnEdicion, setMesaEnEdicion] = useState(null);
  // Lo que Dico necesita para las oportunidades (6g) y no usa ninguna otra
  // pantalla del panel.
  const [clientes, setClientes] = useState([]);
  const [esperaPerdida, setEsperaPerdida] = useState([]);

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [sett, setSett] = useState(null);
  const [ings, setIngs] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [merma, setMerma] = useState([]);
  const [itemsPorPedido, setItemsPorPedido] = useState(null); // Map order_id -> items
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

  const loadVentas = useCallback(async () => {
    if (!tenantId) return;
    setVentas(await fetchSales(tenantId));
  }, [tenantId]);

  const loadMerma = useCallback(async () => {
    if (!tenantId) return;
    setMerma(await fetchWaste(tenantId));
  }, [tenantId]);

  // El detalle de todos los pedidos, de una: la pestaña Ventas muestra los
  // items de cada pedido completado y pedirlos de a uno seria una consulta
  // por fila en pantalla.
  const loadItemsPedidos = useCallback(async () => {
    if (!tenantId) return;
    setItemsPorPedido(await fetchOrderItemsByOrder(tenantId));
  }, [tenantId]);

  // Todas las lineas de receta de una: la lista muestra el margen de cada
  // producto, y pedirlas por producto seria una consulta por fila en pantalla.
  const loadRecetas = useCallback(async () => {
    if (!tenantId) return;
    setRecetas(agruparPorProducto(await fetchProductIngredients(tenantId)));
  }, [tenantId]);

  /* ── Salon (6c) ──
     Se carga junto: sin la sucursal no hay a que pedirle recursos, y sin la
     fecha operativa de esa sucursal la utilizacion del dia daria mal (el dia
     no es el dia UTC — ver migracion 0041). */
  const loadSalon = useCallback(async () => {
    if (!tenantId) return;
    const b = await fetchDefaultBranch(tenantId);
    setBranch(b);
    if (!b) return;
    const hoy = new Date();
    const desde = new Date(hoy); desde.setHours(0, 0, 0, 0);
    const hasta = new Date(hoy); hasta.setHours(23, 59, 59, 999);
    const [rs, aps, ut] = await Promise.all([
      fetchResources(tenantId, b.id),
      fetchAppointments(tenantId, {
        branchId: b.id, desde: desde.toISOString(), hasta: hasta.toISOString(),
      }),
      fetchUtilization(b.id, hoy.toISOString().slice(0, 10)),
    ]);
    setRecursos(rs);
    setReservasHoy(aps);
    setUtilizacion(ut);
  }, [tenantId]);

  /* ── Caja (6d) ──
     El esperado se recalcula al abrir la pantalla y a pedido: es lo que el
     cajero compara contra la plata que tiene en la mano. */
  const loadCaja = useCallback(async () => {
    if (!tenantId) return;
    const b = await fetchDefaultBranch(tenantId);
    const [abierto, previos] = await Promise.all([
      fetchTurnoAbierto(tenantId, b?.id),
      fetchTurnos(tenantId, b?.id, { limit: 10 }),
    ]);
    setTurno(abierto);
    setTurnosPrevios((previos || []).filter(t => t.status === 'closed'));
    setEsperado(abierto ? await esperadoEnCaja(abierto.id) : 0);
  }, [tenantId]);

  /* ── Lo que mira Dico para las oportunidades (6g) ──
     Va aparte y despues del resto: son datos que NINGUNA pantalla necesita
     para operar, asi que no pueden demorar la carga del panel. Si fallan, el
     negocio sigue funcionando sin un par de avisos. */
  const loadOportunidades = useCallback(async () => {
    if (!tenantId) return;
    const b = await fetchDefaultBranch(tenantId);
    const [cs, ws] = await Promise.all([
      fetchCustomerStats(tenantId),
      b ? fetchWaitlist(tenantId, b.id, { estados: ['left'] }) : Promise.resolve([]),
    ]);
    setClientes(cs || []);
    setEsperaPerdida(ws || []);
  }, [tenantId]);

  /* ── Equipo (6e) ── */
  const loadEquipo = useCallback(async () => {
    if (!tenantId) return;
    const b = await fetchDefaultBranch(tenantId);
    const [gente, abiertos] = await Promise.all([
      fetchPersonal(tenantId, b?.id),
      fetchFichajesAbiertos(tenantId, b?.id),
    ]);
    setEquipo(gente);
    setFichajes(abiertos);
    // El dia operativo sale de la sucursal, no de la fecha del navegador: un
    // turno que cruza medianoche pertenece a la jornada anterior (0041).
    setCostoLaboral(b ? await fetchCostoLaboral(b.id, new Date().toISOString().slice(0, 10)) : null);
  }, [tenantId]);

  const onFichar = useCallback(async (staffId, estaAdentro) => {
    const b = await fetchDefaultBranch(tenantId);
    const r = estaAdentro
      ? await ficharSalida(tenantId, staffId)
      : await ficharEntrada(tenantId, staffId, { branchId: b?.id });
    if (r.__error) { msg(r.message); return; }
    msg(estaAdentro ? 'Salida registrada' : 'Entrada registrada');
    loadEquipo();
  }, [tenantId, loadEquipo]);

  const onAbrirCaja = useCallback(async (monto, notas) => {
    const b = await fetchDefaultBranch(tenantId);
    const r = await abrirTurno(tenantId, b?.id, monto, notas);
    if (r.__error) { msg(r.message); return; }
    msg('Caja abierta');
    loadCaja();
  }, [tenantId, loadCaja]);

  const onCerrarCaja = useCallback(async (contado, notas) => {
    if (!turno) return;
    const r = await cerrarTurno(turno.id, contado, notas);
    if (r.__error) { msg(r.message); return; }
    const d = Number(r.turno?.difference) || 0;
    // El resultado del arqueo se dice, no se esconde detras de un "listo".
    msg(d === 0 ? 'Caja cerrada, cerró justo'
      : `Caja cerrada · ${d < 0 ? 'faltan' : 'sobran'} ${Math.abs(d)}`);
    loadCaja();
  }, [turno, loadCaja]);

  /* ── Alta y edicion de mesas (6c) ──
     El borrador hereda forma y capacidad de la ultima cargada y propone el
     nombre siguiente. Cargar un salon son veinte mesas casi iguales: sin esto
     son veinte formularios completos. */
  const nuevaMesa = useCallback((semilla = {}) => {
    const ultima = recursos[recursos.length - 1];
    setMesaEnEdicion({
      kind: 'table',
      name: siguienteNombre(recursos),
      capacity: ultima?.capacity || 4,
      shape: ultima?.shape || 'round',
      ...semilla,
    });
  }, [recursos]);

  const guardarMesa = useCallback(async (datos) => {
    const b = branch || await fetchDefaultBranch(tenantId);
    const r = await saveResource(tenantId, b?.id, datos);
    if (r.__error) return r;
    msg(datos.id ? 'Mesa guardada' : `${datos.name} agregada`);
    loadSalon();
    return r;
  }, [tenantId, branch, loadSalon]);

  const archivarMesa = useCallback(async (id) => {
    const ok = await archiveResource(tenantId, id);
    msg(ok ? 'Mesa dada de baja' : 'No se pudo dar de baja');
    if (ok) loadSalon();
    return ok;
  }, [tenantId, loadSalon]);

  const moverRecurso = useCallback(async (id, pos) => {
    const ok = await moveResource(tenantId, id, pos);
    // Optimista: el arrastre ya movio el elemento en pantalla. Si el guardado
    // falla se recarga, que es lo unico honesto — dejarlo donde el dedo lo
    // solto mostraria un salon que no existe en la base.
    if (!ok) { msg('No se pudo guardar la posición'); loadSalon(); }
    return ok;
  }, [tenantId, loadSalon]);

  useEffect(() => {
    if (!ready || !tenantId) return;
    loadProducts();
    loadOrders();
    loadSettings();
    loadIngs();
    loadRecetas();
    loadGastos();
    loadVentas();
    loadItemsPedidos();
    loadMerma();
    loadSalon();
    loadCaja();
    loadEquipo();
    loadOportunidades();
  }, [ready, tenantId, loadProducts, loadOrders, loadSettings, loadIngs, loadRecetas, loadGastos, loadVentas, loadItemsPedidos, loadMerma, loadSalon, loadCaja, loadEquipo, loadOportunidades]);

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
  // Completar NO es un cambio de estado mas: asienta las ventas del pedido, y
  // eso va junto con el estado en una transaccion (RPC complete_order). Los
  // demas estados siguen siendo un update pelado.
  const handleSetOrderStatus = useCallback(async (id, next) => {
    if (next === PlatformOrderStatus.COMPLETED) {
      const res = await completeOrder(id);
      if (res?.__error) return res;
      setOrders(list => list.map(o => (o.id === id ? { ...o, status: next } : o)));
      if (res.sales?.length) setVentas(prev => [...res.sales, ...prev]);
      return true;
    }
    const res = await setOrderStatus(id, next);
    if (res === true) setOrders(list => list.map(o => (o.id === id ? { ...o, status: next } : o)));
    return res;
  }, []);

  // ── Etapa 4: venta manual ──
  const crearVenta = useCallback((s) => createSale(tenantId, s), [tenantId]);

  // ── Etapa 6: imagenes propias ──
  // El path lo arma el service con el tenant: la pantalla solo pasa el
  // archivo y para que es. Sin esto habia que pegar una URL a mano.
  const subirImagenProducto = useCallback(
    (file) => uploadTenantImage(tenantId, file, { prefix: 'producto' }),
    [tenantId]
  );
  const subirComprobante = useCallback(
    (file) => uploadTenantImage(tenantId, file, { prefix: 'ticket' }),
    [tenantId]
  );

  // ── Etapa 6: merma ──
  // La RPC descuenta el stock del lado de la base; despues se relee para que
  // la pantalla no quede mostrando el stock de antes (mismo criterio que
  // recargarTrasCompra).
  const registrarMerma = useCallback(async (ingredientId, qty, reason, note) => {
    const ok = await registerWaste(tenantId, ingredientId, qty, reason, note);
    if (ok) await Promise.all([loadIngs(), loadMerma()]);
    return ok;
  }, [tenantId, loadIngs, loadMerma]);

  // ── Etapa 5a: clientes ──
  // useCallback obligatorio: CRM lo tiene como dependencia de un useEffect y
  // una funcion nueva por render dispararia la carga en loop (mismo caso que
  // los fetchers de proveedores en la Etapa 3).
  const traerClientes = useCallback(() => fetchCustomerStats(tenantId), [tenantId]);

  /* ── Gates ── */
  // Memo y no un calculo suelto: el efecto de abajo depende de esta lista, y
  // un array nuevo en cada render lo haria correr para siempre.
  const tabs = useMemo(() => modulosDe(tenant?.vertical)
    .filter(m => ICONOS[m.id])
    // 6f: y de esas, las que este rol puede ver. Un mozo no navega al P&L.
    // Esto es NAVEGACION, no seguridad: lo que de verdad protege los datos son
    // las policies de 0050. Si las dos se contradicen, manda la policy.
    .filter(m => puedeVer(roles, m.id))
    .map(m => ({
      id: m.id,
      // El modulo de catalogo se llama distinto en cada rubro.
      label: m.id === 'products' ? terminologia(tenant?.vertical).plural : m.label,
      Icon: ICONOS[m.id],
    })), [tenant?.vertical, roles]);

  // Donde cae cada uno al entrar (6f). El duenio abre en su negocio, el cajero
  // en su caja, el mozo en sus mesas. Y si el tab en el que esta deja de estar
  // disponible —cambio de rol, negocio sin esa pantalla— se corrige solo en
  // vez de dejar el panel en blanco.
  useEffect(() => {
    if (!tabs.length || tabs.some(t => t.id === tab)) return;
    setTab(pantallaInicial(roles, tabs) || tabs[0].id);
  }, [tabs, tab, roles]);

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

  return (
    <ConfirmSlideProvider>
      <div className={`ag-root ${themeClass}`} style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AdminBackdrop />

        {toast && <div className="toast" style={{ zIndex: 1000 }}>{toast}</div>}

        <header className="ag-topbar ms-trace">
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
          {/* Encabezado de seccion (Phase 3B). Unico lugar del shell donde
              habla Butler, y con escala contenida: una pantalla de trabajo no
              es una landing. El nombre sale de `tabs`, la misma fuente que la
              navegacion — no hay una segunda lista de rotulos. */}
          <div className="ag-section-head">
            <h1 className="ag-section-title">
              {(tabs.find(t => t.id === tab) || {}).label || tenant?.name || 'Panel'}
            </h1>
            {openCount > 0 && tab !== 'orders' && (
              <span className="ag-section-meta">{openCount} en curso</span>
            )}
          </div>
          {/* Dico vive en la pestania de entrada, que es donde cae el que
              abre el panel. `listo` evita el peor error posible: decirle
              "todavia no cargaste ningun producto" a alguien que tiene
              cuarenta, porque la consulta no volvio. */}
          {/* Avisos de pedido nuevo. Va en la pestania de entrada por lo
              mismo que en el legacy: el boton escondido en un apartado no lo
              tocaba nadie y los 3 tenants tenian CERO suscripciones admin.
              Se suscribe ESTE dispositivo (la tablet del local). */}
          {tab === 'products' && <AdminPushBanner onShowToast={msg} />}
          {/* The Slot — `advisor.top`: debajo del encabezado y arriba del
              contenido. El contrato de layout vive en `.ag-slot`
              (admin-shell.css): capa de contenido, nunca sobre la navegacion
              ni sobre controles persistentes, y un dialogo abierto lo cubre.
              Hoy lo ocupa el asesor de avisos; mañana puede alojar Dico
              Native 2D o Physical 3D sin mover el shell. */}
          <div className="ag-slot">
          <div className="ag-dico-stack">
            <DicoSlot />
            <DicoAvisos
              listo={!loadingProducts && recetas !== null}
              vertical={tenant?.vertical}
              productos={products}
              insumos={ings}
              recetas={recetas}
              gastos={gastos}
              settings={sett}
              omitir={products.length === 0 ? ['catalogo-vacio'] : []}
              onIr={setTab}
            />
          </div>
          {/* 6g. Va DESPUES de los avisos: primero lo roto, despues lo que se
              puede mejorar. Y solo para quien puede mirar los numeros del
              negocio — a un mozo no le sirve saber que hay stock parado. */}
          {tab === 'products' && puedeVer(roles, 'ventas') && (
            <DicoOportunidades
              listo={!loadingProducts && recetas !== null}
              vertical={tenant?.vertical}
              productos={products}
              insumos={ings}
              ventas={ventas}
              clientes={clientes}
              utilizacion={utilizacion}
              esperaPerdida={esperaPerdida}
              onIr={setTab}
            />
          )}
          </div>
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
              onSubirImagen={subirImagenProducto}
              showToast={msg}
            />
          )}
          {tab === 'orders' && (
            <OrdersPanel
              orders={orders}
              loading={loadingOrders}
              onSetStatus={handleSetOrderStatus}
              showToast={msg}
              tenantId={tenantId}
              roles={roles}
              hayTurnoAbierto={!!turno}
              // Cada cobro mueve el esperado del cajon: si la caja no se
              // refresca, el cajero arquea contra un numero viejo.
              onCobrado={loadCaja}
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
                permiteMerma
                onRegistrarMerma={registrarMerma}
              />
            </Suspense>
          )}
          {tab === 'mesas' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <MapaDeMesas
                recursos={recursos}
                reservas={reservasHoy}
                utilizacion={utilizacion}
                onMover={moverRecurso}
                terminologia={{ plural: 'Mesas', singular: 'mesa' }}
                onSeleccionar={setMesaEnEdicion}
                onNuevo={nuevaMesa}
              />
              {mesaEnEdicion && (
                <EditorDeMesa
                  recurso={mesaEnEdicion}
                  zonas={[...new Set(recursos.map(r => r.zone).filter(Boolean))]}
                  terminologia={{ plural: 'Mesas', singular: 'mesa' }}
                  onGuardar={guardarMesa}
                  onArchivar={archivarMesa}
                  onCerrar={() => setMesaEnEdicion(null)}
                />
              )}
            </Suspense>
          )}
          {tab === 'personal' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <PersonalPanel
                personal={equipo}
                fichajesAbiertos={fichajes}
                costoLaboral={costoLaboral}
                onFichar={onFichar}
              />
            </Suspense>
          )}
          {tab === 'caja' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <CajaPanel
                turno={turno}
                esperado={esperado}
                turnosPrevios={turnosPrevios}
                onAbrir={onAbrirCaja}
                onCerrar={onCerrarCaja}
                onRefrescarEsperado={loadCaja}
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
                onSubirComprobante={subirComprobante}
              />
            </Suspense>
          )}
          {tab === 'ventas' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <VentasPanel
                sales={ventas}
                setSales={setVentas}
                orders={orders}
                itemsPorPedido={itemsPorPedido}
                products={products}
                recetas={recetas}
                ingredients={ings}
                expenses={gastos}
                waste={merma}
                settings={sett}
                showToast={msg}
                // Los analisis USAR del resumen (P&L de restaurante, matriz de
                // menu, food cost) son gastronomicos, como en FinanzasPanel.
                permiteUsar={usaContabilidadUsar(tenant?.vertical)}
                onCrearVenta={crearVenta}
                onFetchClientes={traerClientes}
              />
            </Suspense>
          )}
          {tab === 'cobros' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <CobrosOnline showToast={msg} onBack={() => setTab('config')} />
            </Suspense>
          )}
          {tab === 'usuarios' && (
            <Suspense fallback={<div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando...</div>}>
              <Users
                vertical={tenant?.vertical}
                modo={tenant?.operation_mode}
                terminos={terminologia(tenant?.vertical)}
                sucursales={branch ? [branch] : []}
                showToast={msg}
                onBack={() => setTab('config')}
                currentUserId={session?.user?.id}
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
                    onAbrirUsuarios={() => setTab('usuarios')}
                    onAbrirPasarelas={() => setTab('cobros')}
                    onBack={() => setTab('products')}
                  />
                </Suspense>
              )
              : <div style={{ padding: 24, color: 'var(--ag-ink-3)' }}>Cargando configuración...</div>
          )}
        </main>

        {/* La nav sale a su propio modulo porque ahora tiene estado (el
            desborde) y un contrato de accesibilidad propio. La lista de
            secciones sigue siendo `tabs`: una sola fuente. */}
        <NavInferior tabs={tabs} tab={tab} onTab={setTab} openCount={openCount} />
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
function PersonalIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}
function CajaIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      <line x1="7" y1="13" x2="17" y2="13" />
    </svg>
  );
}
function MesasIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <rect x="4" y="14" width="16" height="6" rx="1.5" />
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
function ChartIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
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
