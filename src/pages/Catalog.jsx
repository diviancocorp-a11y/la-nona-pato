import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, formatInt, optimizeImage, originalImageUrl, disableImageTransforms, probeImageTransforms, waPhoneAr } from "../lib/utils";
import { preloadImages } from "../lib/preloadImages";
import { fetchCatalog, submitOrder, validateCouponPublic } from "../lib/catalogService";
import { fetchMpStatusPublic, createMpPreference } from "../services/paymentIntegrations";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { getGuestUser } from "../lib/guestUser.js";
import business, { waLink } from "@business";
import { paymentLabel, paymentIcon } from "../lib/payments";

// ── Extracted components ──
import WelcomeSplash from "../catalog-pro/WelcomeSplash";
import BirthdayGift from "../catalog-pro/BirthdayGift";
import { addActiveOrder } from "../lib/activeOrders";
import "../catalog-pro/tokens.css";
import HomeScreenPro from "../catalog-pro/HomeScreen";
import AgeGate from "../catalog-pro/AgeGate";
import WhatsAppFloat from "../catalog-pro/WhatsAppFloat";
import { ensureMusic, stopMusic } from "../catalog-pro/catalogMusic";
import ProductDetailScreenPro from "../catalog-pro/ProductDetailScreen";
import SearchScreenPro from "../catalog-pro/SearchScreen";
import CategoryScreenPro from "../catalog-pro/CategoryScreen";
import CartScreenPro from "../catalog-pro/CartScreen";
import CheckoutScreenPro from "../catalog-pro/CheckoutScreen";
import OrdersScreenPro from "../catalog-pro/OrdersScreen";
import { useToast } from "../hooks/useToast";
import useAndroidBack from "../hooks/useAndroidBack";
import ConfirmationAnimation from "../components/catalog/ConfirmationAnimation";
import OrderSentView from "../components/catalog/OrderSentView";

// ── Shared constants ──
import {
  avatarColors, CAT_GROUPS as FALLBACK_CAT_GROUPS, SUB_TO_PARENT as FALLBACK_SUB_TO_PARENT,
  DAILY_DEALS, DEAL_PCT,
  fallbackSettings, fallbackProducts, STORE_LAT, STORE_LNG,
  haversine, calcDeliveryCost, CHECKOUT_STEPS, DEFAULT_FORM
} from "../constants/catalogConstants";
import { fetchCategoryGroups, toClientFormat, buildSubToParent } from "../services/categories";
import { computeAvailability } from "../lib/stockAvailability";
import { applyTenantHead } from "../lib/tenantHead";
import { resolveTenantSlug } from "../lib/activeTenant";
import useFeature from "../hooks/useFeature";

export default function Catalog() {
  const navigate = useNavigate();
  const { user, profile, addresses, isFavorite, toggleFavorite, getOrderHistory, phoneSession, session, sessionLogout } = useAuth();

  // --- Feature flags ---
  const ffGift = useFeature('GIFT_MODE');
  const ffPush = useFeature('PUSH_NOTIFICATIONS');
  const ffDeals = useFeature('DAILY_DEALS');
  const ffWhatsapp = useFeature('WHATSAPP');

  // --- Estado de datos ---
  // Hidratacion inicial desde cache local (fix jun 2026): sin esto, el primer
  // render usa fallbackSettings → se ve la letra "M" hasta que llega el logo
  // real de la DB. Con cache, desde la 2da visita la identidad pinta al instante.
  const [sett, setSett] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('cp_sett_cache') || 'null');
      return cached ? { ...fallbackSettings, ...cached } : fallbackSettings;
    } catch { return fallbackSettings; }
  });
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast, ToastContainer } = useToast();
  const [error, setError] = useState(null);
  const [serverNow, setServerNow] = useState(null); // hora del servidor para validar horarios
  const [catGroups, setCatGroups] = useState(FALLBACK_CAT_GROUPS);
  const [subToParent, setSubToParent] = useState(FALLBACK_SUB_TO_PARENT);
  // Data de stock para marcar "Agotado" (recipe_ingredients + ingredients + combo_items).
  // Si el fetch falla queda vacio → nada se marca agotado (fail-open a proposito).
  const [stockData, setStockData] = useState({ recipeIngredients: [], ingredients: [], comboItems: [] });

  // --- Estado de UI ---
  const [selCat, setSelCat] = useState("Todos");
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [cpDetail, setCpDetail] = useState(null); // producto en pantalla Detalle (catalog-pro)
  const [cpScreen, setCpScreen] = useState(null); // null | "search" | { type:"category", name, displayName }
  const [cpTip, setCpTip] = useState(0); // % propina elegido (presets). Ignorado si cpTipCustom != null
  const [cpTipCustom, setCpTipCustom] = useState(null); // monto fijo de propina en $ (null = usa %)
  const [showCk, setShowCk] = useState(false);
  const [sent, setSent] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [sending, setSending] = useState(false);
  // MP Checkout Pro: si hay integración activa, redirigimos al init_point.
  // Si no, fallback al flujo manual (alias + comprobante).
  const [mpConnected, setMpConnected] = useState(false);
  // Orden ya creada esperando pago MP: si la preference fallo, reintentamos
  // con el mismo orderId para no duplicar pedidos.
  const [mpPendingOrderId, setMpPendingOrderId] = useState(null);
  // Si el carrito cambia, la orden pendiente queda obsoleta (totales distintos)
  useEffect(() => { setMpPendingOrderId(null); }, [cart]);
  const [orderErr, setOrderErr] = useState("");
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [sentForm, setSentForm] = useState(null); // snapshot del form al confirmar (el form vivo se resetea)
  const [scheduleMode, setScheduleMode] = useState("now"); // "now" | "later"
  const [ckStep, setCkStep] = useState(0); // 0=Datos, 1=Entrega, 2=Pago, 3=Resumen
  const [faqOpen, setFaqOpen] = useState(null); // índice de FAQ abierta
  const [receiptFile, setReceiptFile] = useState(null); // comprobante subido
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [receiptStatus, setReceiptStatus] = useState(""); // "" | "ok" | "error"
  // waitingReceipt / waitTimer removed in FASE 3 cleanup. The 60s verification
  // window was replaced by direct "Pedido enviado" — Mercado Pago will
  // eventually handle payment validation via pasarela instead of this poll.
  const [geoLoading, setGeoLoading] = useState(false);
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [deliveryKm, setDeliveryKm] = useState(null);
  const [calcingDelivery, setCalcingDelivery] = useState(false);
  const [confirmAnim, setConfirmAnim] = useState(false); // animación de confirmación

  // STORE_LAT, STORE_LNG, haversine, calcDeliveryCost importados de constants

  // Calcular envío cuando cambia la dirección
  const estimateDelivery = useCallback(async (address) => {
    if (!address || address.length < 5) { setDeliveryCost(0); setDeliveryKm(null); return; }
    setCalcingDelivery(true);
    try {
      const q = encodeURIComponent(address + ", Buenos Aires, Argentina");
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
      const data = await r.json();
      if (data?.[0]) {
        const km = haversine(STORE_LAT, STORE_LNG, parseFloat(data[0].lat), parseFloat(data[0].lon));
        // Escalones configurables por tenant (settings.delivery_pricing, Sprint 2)
        const cost = calcDeliveryCost(km, sett?.delivery_pricing);
        setDeliveryKm(Math.round(km * 10) / 10);
        setDeliveryCost(cost);
      } else {
        setDeliveryCost(0); setDeliveryKm(null);
      }
    } catch { setDeliveryCost(0); setDeliveryKm(null); }
    setCalcingDelivery(false);
  }, [sett?.delivery_pricing]);

  // Fecha mínima para agendamiento: hoy (siempre permite programar para hoy y mañana)
  const minDate = useMemo(() => {
    const now = serverNow || new Date();
    return now.toISOString().split("T")[0];
  }, [serverNow]);

  // --- Per-client catalog theming ---
  const catalogTheme = useMemo(() => {
    const b = business.branding || {};
    const style = {};
    if (b.catalogBg) style['--catalog-bg'] = b.catalogBg;
    if (b.catalogCardBg) style['--catalog-card-bg'] = b.catalogCardBg;
    if (b.catalogHeaderBg) style['--catalog-header-bg'] = b.catalogHeaderBg;
    if (b.catalogTextOnBg) style['--catalog-text-on-bg'] = b.catalogTextOnBg;
    if (b.catalogStickyBg) style['--catalog-sticky-bg'] = b.catalogStickyBg;
    if (b.catalogStickyText) style['--catalog-sticky-text'] = b.catalogStickyText;
    return style;
  }, []);

  const [upsell, setUpsell] = useState(null); // {product, suggestions[]}
  const [ageGatePending, setAgeGatePending] = useState(null); // {product, size} - add diferido por +18
  // Quick reorder: ultimo pedido del user (max 4 items, solo si esta logueado)
  const [lastOrderItems, setLastOrderItems] = useState([]);
  useEffect(() => {
    if (!user) { setLastOrderItems([]); return; }
    getOrderHistory().then(orders => {
      const last = orders?.[0];
      if (!last) return;
      // Parse items: orders.customer guarda JSON con items o usar order_items table
      try {
        const raw = typeof last.customer === "string" ? JSON.parse(last.customer) : last.customer;
        const items = (raw?.items || []).slice(0, 4).map(it => ({ id: it.id, name: it.name, qty: it.qty || 1 }));
        setLastOrderItems(items);
      } catch { setLastOrderItems([]); }
    }).catch(() => setLastOrderItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null); // {id, discount_pct}
  const [couponErr, setCouponErr] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [showTrackerInput, setShowTrackerInput] = useState(false);
  const [trackerCode, setTrackerCode] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  // scheduleTimeErr eliminado — ahora usamos dropdown con horas válidas

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-fill checkout form from profile or guest identity when opening checkout
  useEffect(() => {
    if (!showCk) return;
    if (user && profile) {
      // Logueado: prefill desde profile (datos más confiables)
      setForm(p => ({
        ...p,
        name: p.name || profile.name || "",
        phone: p.phone || profile.phone || "",
        email: p.email || user.email || "",
      }));
    } else {
      // Guest: prefill desde localStorage (último pedido)
      const g = getGuestUser();
      if (g) {
        setForm(p => ({
          ...p,
          name: p.name || g.name || "",
          phone: p.phone || g.phone || "",
          email: p.email || g.email || "",
        }));
      }
    }
  }, [showCk, user, profile]);

  // --- Verificar si el local está abierto ahora según store_hours ---
  // Usa hora del servidor (serverNow) para evitar que el cliente manipule su reloj
  const storeStatus = useMemo(() => {
    const hrs = sett?.store_hours;
    if (!hrs) return { open: true, msg: "" }; // sin horarios configurados = siempre abierto
    const now = serverNow || new Date();
    const dayIdx = (now.getDay() + 6) % 7; // JS: 0=Dom → nuestro: 0=Lun
    const today = hrs[dayIdx];
    if (!today || today.closed) return { open: false, msg: "Hoy no abrimos" };
    if (!today.open || !today.close) return { open: true, msg: "" };
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = today.open.split(":").map(Number);
    const [ch, cm] = today.close.split(":").map(Number);
    const openMins = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    if (nowMins < openMins) return { open: false, msg: `Abrimos a las ${today.open}` };
    if (nowMins >= closeMins) return { open: false, msg: `Cerramos a las ${today.close}. Podés programar tu pedido.` };
    return { open: true, msg: `Abierto hasta las ${today.close}` };
  }, [sett, serverNow]);

  // Generar horas disponibles para una fecha según horario del local
  const getAvailableHours = useCallback((dateStr) => {
    if (!dateStr || !sett?.store_hours) return [];
    // Calcular día de semana de la fecha seleccionada
    const [y, m, d] = dateStr.split("-").map(Number);
    const selectedDate = new Date(y, m - 1, d);
    const jsDow = selectedDate.getDay(); // 0=Dom
    const dayIdx = (jsDow + 6) % 7; // → 0=Lun
    const dayHrs = sett.store_hours[dayIdx];
    if (!dayHrs || dayHrs.closed || !dayHrs.open || !dayHrs.close) return [];

    const [oh] = dayHrs.open.split(":").map(Number);
    const [ch] = dayHrs.close.split(":").map(Number);
    const firstHour = oh + 1; // +1h después de abrir (preparación)
    const lastHour = ch - 1;  // -1h antes de cerrar
    if (firstHour > lastHour) return [];

    const now = serverNow || new Date();
    const isToday = dateStr === now.toISOString().split("T")[0];
    const currentHour = now.getHours();

    const hours = [];
    for (let h = firstHour; h <= lastHour; h++) {
      // Si es hoy, solo mostrar horas futuras (+1h de margen)
      if (isToday && h <= currentHour + 1) continue;
      hours.push(h);
    }
    return hours;
  }, [sett, serverNow]);

  // Horas disponibles para la fecha seleccionada (reactivo)
  const availableHours = useMemo(() => getAvailableHours(form.delivery_date), [form.delivery_date, getAvailableHours]);

  // Info del día seleccionado
  const selectedDayInfo = useMemo(() => {
    if (!form.delivery_date || !sett?.store_hours) return null;
    const [y, m, d] = form.delivery_date.split("-").map(Number);
    const selectedDate = new Date(y, m - 1, d);
    const jsDow = selectedDate.getDay();
    const dayIdx = (jsDow + 6) % 7;
    const dayHrs = sett.store_hours[dayIdx];
    const dayNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    if (!dayHrs || dayHrs.closed) return { closed: true, dayName: dayNames[dayIdx] };
    return { closed: false, dayName: dayNames[dayIdx], open: dayHrs.open, close: dayHrs.close };
  }, [form.delivery_date, sett]);

  // Si el local está cerrado, forzar modo "Programar" (también al abrir checkout)
  useEffect(() => {
    if (!storeStatus.open && scheduleMode === "now") setScheduleMode("later");
  }, [storeStatus.open, showCk]);

  // FASE 3: the 60s countdown + receipt-verification poll were removed.
  // Mercado Pago pasarela will replace this flow.

  // Detectar si hay integración MP activa → redirigir al Checkout Pro en vez de
  // pedir comprobante manual. Si falla, mantenemos flujo manual.
  useEffect(() => {
    let cancelled = false;
    fetchMpStatusPublic()
      .then((status) => { if (!cancelled) setMpConnected(!!status?.active); })
      .catch(() => { if (!cancelled) setMpConnected(false); });
    return () => { cancelled = true; };
  }, []);

  // --- Cargar datos de Supabase al montar ---
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      // Fetch catalog data and categories in parallel
      const [data, dbCategories] = await Promise.all([
        fetchCatalog(),
        fetchCategoryGroups(),
      ]);
      // Apply dynamic categories
      const clientCats = toClientFormat(dbCategories);
      setCatGroups(clientCats);
      setSubToParent(buildSubToParent(clientCats));

      if (data) {
        setSett(data.settings);
        // Identidad en el <head>: index.html se arma en build time, asi que
        // sin esto TODOS los tenants muestran el titulo, el theme-color y el
        // favicon del client con el que se compilo.
        applyTenantHead({ ...data.settings, __slug: await resolveTenantSlug() });
        // Cache de identidad para la proxima carga (anti-flash de logo/tema)
        try {
          const s = data.settings || {};
          localStorage.setItem('cp_sett_cache', JSON.stringify({
            biz_name: s.biz_name, slogan: s.slogan, logo_url: s.logo_url,
            logo_color: s.logo_color, logo_letter: s.logo_letter,
            catalog_theme: s.catalog_theme,
          }));
        } catch { /* empty */ }
        setProducts(data.products);
        if (data.serverNow) setServerNow(new Date(data.serverNow));
        // Probe if Supabase image transforms are available (Pro plan feature)
        probeImageTransforms(data.settings?.cover_url);
        // Preload hero + first 4 product images for fast LCP
        const criticalUrls = [
          data.settings?.cover_url,
          ...data.products.slice(0, 4).map(p => p.image_url),
        ];
        preloadImages(criticalUrls);
      } else {
        // Si Supabase falla, usamos datos de respaldo
        console.warn("No se pudo conectar a Supabase. Usando datos de respaldo.");
        setProducts(fallbackProducts);
        setError("offline");
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // Cargar data de stock en paralelo al catalogo (lectura publica RLS).
  // No bloquea el render: hasta que llega, ningun producto se marca agotado.
  useEffect(() => {
    let cancelled = false;
    async function loadStock() {
      try {
        const [ri, ing, ci] = await Promise.all([
          supabase.from("recipe_ingredients").select("recipe_id, ingredient_id, qty"),
          supabase.from("ingredients").select("id, stock"),
          supabase.from("combo_items").select("recipe_id, sub_recipe_id, qty"),
        ]);
        if (cancelled) return;
        setStockData({
          recipeIngredients: ri.data || [],
          ingredients: ing.data || [],
          comboItems: ci.data || [],
        });
      } catch (e) {
        // Sin data de stock no marcamos nada como agotado
        console.warn("No se pudo cargar data de stock (no bloquea):", e?.message);
      }
    }
    loadStock();
    return () => { cancelled = true; };
  }, []);

  // Recipe ids agotados segun stock de ingredientes (helper puro, ver stockAvailability.js)
  const soldOutIds = useMemo(() => computeAvailability({
    recipes: products,
    recipeIngredients: stockData.recipeIngredients,
    ingredients: stockData.ingredients,
    comboItems: stockData.comboItems,
  }), [products, stockData]);

  // Restaurar carrito si vuelve del registro
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("hg_cart");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCart(parsed);
          setShowCk(true); // reabrir checkout
        }
        sessionStorage.removeItem("hg_cart");
      }
    } catch {}
  }, []);

  // Categorías madre con descuento del día (usa hora del servidor)
  const dealCats = useMemo(() => {
    if (!ffDeals) return new Set();
    const now = serverNow || new Date();
    const dow = now.getDay(); // 0=Dom, 1=Lun ... 4=Jue
    return new Set(DAILY_DEALS[dow] || []);
  }, [serverNow, ffDeals]);

  // Categorías madre con imagen: prioridad settings > primer producto con foto.
  // Mostramos todas las categorias visibles del backend (no filtramos por
  // matching de subcategorias). Si el admin la creo, aparece. Productos
  // pueden matchear con el nombre madre directamente o con una subcategoria.
  const categories = useMemo(() => {
    const catImgs = sett.cat_images || {};
    const hiddenCats = new Set(sett.hidden_cats || []);
    const catNames = sett.cat_names || {};
    const catData = catGroups
      .filter(g => !hiddenCats.has(g.name))
      .map(g => {
        const customImg = catImgs[g.name];
        const rep = !customImg ? products.find(p => (p.category === g.name || g.subs.includes(p.category)) && p.image_url) : null;
        const displayName = catNames[g.name] || g.name;
        return { name: g.name, displayName, icon: g.icon, subs: g.subs, img: customImg || rep?.image_url || null, deal: dealCats.has(g.name) };
      });
    return [{ name: "Todos", icon: "🏠", subs: [], img: catImgs["Todos"] || null, deal: false, displayName: "Todos" }, ...catData];
  }, [products, dealCats, sett, catGroups]);

  // Helper: ¿el producto esta en oferta? Descuento propio (recipes.discount_pct,
  // switch "Tiene descuento" del editor) O deal del dia por categoria madre.
  const hasDeal = useCallback((p) => {
    if (Number(p?.discount_pct) > 0) return true;
    const parent = subToParent[p.category];
    return parent ? dealCats.has(parent) : false;
  }, [dealCats]);

  // Precio con descuento. El descuento propio PISA al deal del dia (no se
  // acumulan). Mismo Math.round que submit-order valida server-side.
  const getPrice = useCallback((p) => {
    const own = Number(p?.discount_pct) || 0;
    if (own > 0) return Math.round(p.sale_price * (1 - own / 100));
    const parent = subToParent[p.category];
    if (parent && dealCats.has(parent)) return Math.round(p.sale_price * (1 - DEAL_PCT / 100));
    return p.sale_price;
  }, [dealCats]);

  // Filtrar productos por categoria madre seleccionada.
  // Trim para tolerar trailing spaces en recipe.category (data legacy).
  const filteredProds = useMemo(() => {
    let list = products;
    if (selCat !== "Todos") {
      const group = catGroups.find(g => g.name === selCat);
      if (group) {
        const gName = (group.name || "").trim();
        const gSubs = (group.subs || []).map(s => (s || "").trim());
        list = list.filter(r => {
          const rc = (r.category || "").trim();
          return rc === gName || gSubs.includes(rc);
        });
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r =>
        r.name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selCat, products, searchQuery, catGroups]);

  // avatarColors: definido fuera del componente como constante estática

  // Mapa rápido de cantidades en carrito: O(1) lookup en vez de O(n) find
  const cartQtyMap = useMemo(() => {
    const m = {};
    cart.forEach(i => { m[i.id] = i.qty; });
    return m;
  }, [cart]);

  // Totales del carrito (memoizado). Propina se decide en step 3 (Pago),
  // se calcula sobre subtotal sin descuentos.
  const { cc, discount, ct, tipAmount, ctWithDelivery } = useMemo(() => {
    const cc = cart.reduce((s, i) => s + i.qty, 0);
    const ctBase = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const discount = coupon ? Math.round(ctBase * coupon.discount_pct / 100) : 0;
    const ct = ctBase - discount;
    const baseTotal = ct + (form.delivery === "envio" ? deliveryCost : 0);
    // Propina: monto fijo (cpTipCustom) tiene prioridad sobre el % (cpTip).
    const tipRaw = cpTipCustom != null
      ? cpTipCustom
      : Math.round(ctBase * (cpTip || 0) / 100);
    // Tope de seguridad: la propina no puede superar el total del pedido.
    const tipAmount = Math.max(0, Math.min(tipRaw, baseTotal));
    const ctWithDelivery = baseTotal + tipAmount;
    return { cc, discount, ct, tipAmount, ctWithDelivery };
  }, [cart, coupon, deliveryCost, form.delivery, cpTip, cpTipCustom]);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true); setCouponErr("");
    const result = await validateCouponPublic(couponCode, form.email);
    setValidatingCoupon(false);
    if (result) { setCoupon(result); setCouponErr(""); }
    else setCouponErr("Cupón inválido, vencido o no corresponde a tu email.");
  };

  // Obtener cantidad de un producto específico en el carrito (O(1) con mapa)
  const getQty = useCallback((id) => {
    return cartQtyMap[id] || 0;
  }, [cartQtyMap]);

  // Agregar al carrito (memoizado) — usa precio con descuento del día.
  // `e` es opcional: el viewer catalog-pro NO pasa el event al callback.
  // `size` (opcional): { size_label, size_qty, size_price } — viene del
  // ProductDetailScreen cuando la receta tiene presentaciones.
  const addC = useCallback((p, e, size = null) => {
    // Permitir signatura (p, size) — si e es un objeto sin stopPropagation, lo tratamos como size.
    if (e && typeof e === "object" && !("stopPropagation" in e) && !size) {
      size = e; e = null;
    }
    e?.stopPropagation?.();
    // Bloqueo por stock: si la receta esta agotada no entra al carrito.
    // Unico punto de entrada al cart → cubre todas las pantallas.
    if (p?.id && soldOutIds.has(p.id)) {
      toast("Producto agotado");
      return;
    }
    // +18 gate: una sola vez por sesion del browser. Si ya confirmo en esta
    // sesion (sessionStorage), no preguntamos mas. Persiste mientras la tab
    // este abierta; si cierra y reabre, vuelve a preguntar.
    if (p?.requires_age_gate) {
      let alreadyConfirmed = false;
      try { alreadyConfirmed = !!sessionStorage.getItem("hg_age_18_cart"); } catch { /* empty */ }
      if (!alreadyConfirmed) {
        setAgeGatePending({ product: p, size });
        return;
      }
    }
    const finalPrice = size ? size.size_price : getPrice(p);
    // Cart key: items con tamaños distintos son entradas distintas.
    const itemKey = size ? `${p.id}__${size.size_label}` : p.id;
    const displayName = size ? `${p.name} · ${size.size_label}` : p.name;
    toast(`✓ ${displayName} agregado`);
    setCart(prev => {
      const isNewProduct = !prev.find(i => i.id === itemKey);
      const newCart = isNewProduct
        ? [...prev, {
            id: itemKey, name: displayName, price: finalPrice, qty: 1, img: p.image_url,
            // metadata para el resumen de pedido y el stock
            product_id: p.id,
            size_label: size?.size_label || null,
            size_qty:   size?.size_qty || 1,
          }]
        : prev.map(i => i.id === itemKey ? { ...i, qty: i.qty + 1 } : i);
      if (isNewProduct && p.related_ids && p.related_ids.length > 0) {
        const suggestions = products.filter(x => p.related_ids.includes(x.id));
        if (suggestions.length > 0) setUpsell({ product: p, suggestions: suggestions.slice(0, 3) });
      }
      return newCart;
    });
  }, [products, getPrice, toast, soldOutIds]);

  // Agregar desde upsell y cerrar popup (memoizado)
  const addFromUpsell = useCallback((p) => {
    const finalPrice = getPrice(p);
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, price: finalPrice, qty: 1, img: p.image_url }];
    });
    setUpsell(null);
  }, [getPrice]);

  // Actualizar cantidad en el carrito
  const updQ = (id, nq) => {
    if (nq <= 0) setCart(p => p.filter(i => i.id !== id));
    else setCart(p => p.map(i => i.id === id ? { ...i, qty: nq } : i));
  };

  // Enviar pedido a Supabase
  const send = async () => {
    setSending(true); setOrderErr("");

    // Reintento MP: la orden ya existe de un intento anterior que no llego a
    // redirigir. Reusamos el orderId en vez de crear un pedido duplicado.
    if (mpPendingOrderId && form.payment === "mercadopago" && mpConnected) {
      try {
        const pref = await createMpPreference(mpPendingOrderId);
        const target = pref?.init_point || pref?.sandbox_init_point;
        if (target) { window.location.href = target; return; }
      } catch (e) {
        console.warn("Reintento MP fallo:", e);
      }
      setSending(false);
      setOrderErr("No pudimos iniciar el pago en MercadoPago. Probá de nuevo o elegí otro medio de pago.");
      return;
    }
    // Construir dirección completa con piso y notas de referencia
    let fullAddress = form.address || "";
    if (form.delivery === "envio") {
      if (form.address_piso) fullAddress += ` - Piso/Depto: ${form.address_piso}`;
      if (form.address_notas) fullAddress += ` - ${form.address_notas}`;
    }

    // Construir nota con hora programada si aplica
    let finalNote = form.note || "";
    if (scheduleMode === "later" && form.delivery_time) {
      const timeTag = `[Hora programada: ${form.delivery_time}]`;
      finalNote = finalNote ? `${timeTag} ${finalNote}` : timeTag;
    }
    // Agregar monto de cambio para efectivo
    if (form.payment === "efectivo" && form.change_amount) {
      const changeTag = form.change_amount === "justo" ? "[Pago justo]" : `[Paga con $${form.change_amount}]`;
      finalNote = finalNote ? `${changeTag} ${finalNote}` : changeTag;
    }

    // Telefono normalizado a E.164 AR (549...) en ORIGEN: guardamos el dato
    // limpio en la DB en vez de depender de normalizar al mostrar. El matching
    // por sufijo (phone_key en las RPCs) tolera datos viejos en crudo, asi que
    // esto no fragmenta nada. Si viene vacio/invalido, cae al valor crudo y que
    // la validacion (phoneNumber) lo rechace.
    const normalizedPhone = waPhoneAr(form.phone) || form.phone;

    const orderData = {
      customer: form.name,
      phone: normalizedPhone,
      email: user ? user.email : form.email,
      delivery: form.delivery,
      payment: form.payment,
      payment_account_id: form.payment_account_id || null,
      address: fullAddress,
      note: finalNote,
      is_gift: form.is_gift,
      gift_note: form.is_gift ? form.gift_note : '',
      coupon_id: coupon?.id || null,
      discount: discount,
      delivery_cost: form.delivery === "envio" ? deliveryCost : 0,
      tip_pct: cpTipCustom != null
        ? ((ct + discount) > 0 ? Math.round(tipAmount / (ct + discount) * 100) : 0)
        : (cpTip || 0),
      tip_amount: tipAmount,
      total: ctWithDelivery,
      delivery_date: scheduleMode === "later" ? (form.delivery_date || null) : null,
      user_id: user?.id || null,
      items: cart.map(i => ({
        recipeId: i.id,
        qty: i.qty,
        unitPrice: i.price
      }))
    };

    const result = await submitOrder(orderData);
    setSending(false);

    if (result?.ok) {
      // Upsert a customers para guardar birth_date (si se completó) y otros datos
      // estables del cliente. La tabla customers tiene email como UNIQUE → solo
      // upserteamos si hay email. Fire-and-forget: no bloquea el éxito del pedido.
      const customerEmail = user?.email || form.email;
      if (customerEmail && form.birth_date) {
        try {
          await supabase.from("customers").upsert(
            {
              email: customerEmail,
              name: form.name || null,
              phone: normalizedPhone || null,
              birth_date: form.birth_date,
            },
            { onConflict: "email" }
          );
        } catch (e) {
          console.warn("No se pudo guardar birth_date del cliente (no bloquea):", e);
        }
      }

      // ── MercadoPago Checkout Pro (pasarela) ──────────────────────────────
      // Si MP está conectada (payment_integrations) y el cliente eligió MP,
      // creamos preference y redirigimos al init_point. No cargamos comprobante.
      if (form.payment === "mercadopago" && mpConnected && result.orderId) {
        try {
          const pref = await createMpPreference(result.orderId);
          const target = pref?.init_point || pref?.sandbox_init_point;
          if (target) {
            // No reseteamos UI: el cliente vuelve via back_urls a /pago/*
            window.location.href = target;
            return;
          }
          console.warn("createMpPreference: sin init_point");
        } catch (e) {
          console.warn("createMpPreference falló:", e);
        }
        // El pago online es obligatorio: NO mostramos "pedido enviado" si no
        // pudimos redirigir a MP. Guardamos el orderId para reintentar.
        setMpPendingOrderId(result.orderId);
        setOrderErr("No pudimos iniciar el pago en MercadoPago. Probá de nuevo o elegí otro medio de pago.");
        return;
      }

      const isDigital = form.payment === "transferencia" || form.payment === "mercadopago";
      // Si pagó con transferencia/MP y subió comprobante, subirlo al storage + notificar
      if (receiptFile && result.orderId && isDigital) {
        try {
          const ext = receiptFile.name.split(".").pop() || "jpg";
          const path = `receipts/${result.orderId}.${ext}`;
          await supabase.storage.from("receipts").upload(path, receiptFile, { upsert: true });
          await supabase.from("orders").update({ receipt_url: path }).eq("id", result.orderId);
          // Notificar al grupo admin via webhook
          try {
            const webhookUrl = import.meta.env.VITE_CUSTOMER_WEBHOOK;
            if (webhookUrl) {
              await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                  type: "receipt",
                  store: business.name,
                  customer: form.name,
                  phone: form.phone,
                  payment: form.payment,
                  total: ctWithDelivery,
                  orderId: result.orderId
                })
              });
            }
          } catch {}
        } catch (e) {
          console.warn("Error subiendo comprobante (no bloquea):", e);
        }
      }
      setOrderId(result.orderId);
      try { addActiveOrder(result.orderId); } catch { /* ignore */ }
      // Mostrar animación de confirmación
      setConfirmAnim(true);
      setCart([]);
      setSentForm({ ...form });
      setForm({ ...DEFAULT_FORM });
      setScheduleMode("now");
      setCoupon(null); setCouponCode("");
      setCkStep(0);
      setReceiptFile(null); setReceiptPreview(null); setReceiptStatus("");
      // Después de la animación del corazón (2.5s), entra directo a "Enviado".
      // El timer de 60s de verificación se eliminó — la validación de pago
      // se va a hacer vía pasarela de Mercado Pago en una etapa posterior.
      setTimeout(() => {
        setConfirmAnim(false);
        setSent(true);
      }, 2500);
    } else {
      // Mensaje util del server si existe (rate limit, producto no disponible,
      // cuenta de pago invalida...) — antes se descartaba y el cliente veia
      // siempre el generico (Sprint 4).
      console.error("Pedido no se guardó en Supabase:", result?.error);
      setOrderErr(result?.error || "No pudimos procesar tu pedido. Revisá tu conexión e intentá de nuevo.");
    }
  };

  // Sonido al confirmar pedido (asset compartido, desacoplado de la alarma del admin)
  useEffect(() => {
    if (confirmAnim) {
      try { const a = new Audio("/order-confirmed.mp3"); a.play().catch(() => {}); } catch {}
    }
  }, [confirmAnim]);

  // Musica ambiente del catalogo (loop bajo). Se pausa al salir del catalogo.
  useEffect(() => {
    ensureMusic();
    return () => stopMusic();
  }, []);

  // --- VISTA: CARGANDO ---
  // Splash de bienvenida arriba del catalogo durante el primer load.
  // Sobre tokens del tema (no mas sombras grises).

  // --- VISTA: ANIMACIÓN DE CONFIRMACIÓN ---
  // ── Boton atras del telefono = un paso atras DENTRO de la app ──
  // Pila de capas navegables (la de mas abajo primero, la superior al final).
  // El back del sistema cierra la superior en vez de salir del catalogo.
  const backLayers = [];
  if (cpScreen) backLayers.push(() => setCpScreen(null));
  if (cpDetail) backLayers.push(() => setCpDetail(null));
  if (showCart) backLayers.push(() => setShowCart(false));
  if (showCk) {
    backLayers.push(() => { setShowCk(false); setCkStep(0); });
    for (let i = 0; i < ckStep; i++) backLayers.push(() => setCkStep(s => Math.max(0, s - 1)));
  }
  if (sent) backLayers.push(() => { setSent(false); setOrderId(null); setShowCk(false); });
  if (upsell) backLayers.push(() => setUpsell(null));
  if (ageGatePending) backLayers.push(() => setAgeGatePending(null));
  if (showMenu) backLayers.push(() => setShowMenu(false));
  if (showTrackerInput) backLayers.push(() => setShowTrackerInput(false));
  useAndroidBack(backLayers.length, backLayers[backLayers.length - 1]);

  if (confirmAnim) return <ConfirmationAnimation />;

  // --- VISTA: PEDIDO ENVIADO ---
  if (sent) return <OrderSentView orderId={orderId} form={sentForm || form} receiptFile={receiptFile} settings={sett} onReset={() => { setSent(false); setOrderId(null); setShowCk(false); }} />;

  // --- VISTA: CHECKOUT STEPPER ---
  if (showCk) {
    return (
      <CheckoutScreenPro
        step={ckStep}
        onStepChange={setCkStep}
        onClose={() => { setShowCk(false); setCkStep(0); }}
        user={user}
        profile={profile}
        form={form}
        sf={sf}
        navigate={navigate}
        settings={sett}
        scheduleMode={scheduleMode}
        setScheduleMode={setScheduleMode}
        storeStatus={storeStatus}
        minDate={minDate}
        availableHours={availableHours}
        selectedDayInfo={selectedDayInfo}
        storeHours={sett?.store_hours}
        getAvailableHours={getAvailableHours}
        addresses={addresses}
        geoLoading={geoLoading}
        setGeoLoading={setGeoLoading}
        estimateDelivery={estimateDelivery}
        calcingDelivery={calcingDelivery}
        deliveryCost={deliveryCost}
        setDeliveryCost={setDeliveryCost}
        deliveryKm={deliveryKm}
        setDeliveryKm={setDeliveryKm}
        haversine={haversine}
        STORE_LAT={STORE_LAT}
        STORE_LNG={STORE_LNG}
        calcDeliveryCost={calcDeliveryCost}
        mpConnected={mpConnected}
        paymentIcon={paymentIcon}
        paymentLabel={paymentLabel}
        receiptFile={receiptFile}
        setReceiptFile={setReceiptFile}
        receiptPreview={receiptPreview}
        setReceiptPreview={setReceiptPreview}
        receiptStatus={receiptStatus}
        cart={cart}
        ct={ct}
        ctWithDelivery={ctWithDelivery}
        discount={discount}
        coupon={coupon}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        setCoupon={setCoupon}
        applyCoupon={applyCoupon}
        validatingCoupon={validatingCoupon}
        couponErr={couponErr}
        setCouponErr={setCouponErr}
        ffGift={ffGift}
        tip={cpTip}
        setTip={setCpTip}
        tipCustom={cpTipCustom}
        setTipCustom={setCpTipCustom}
        tipCap={ct + (form.delivery === "envio" ? deliveryCost : 0)}
        tipAmount={tipAmount}
        orderErr={orderErr}
        sending={sending}
        onSubmit={send}
      />
    );
  }

  // --- VISTA: CARRITO ---
  if (showCart) return (
    <CartScreenPro
      items={cart}
      subtotal={cart.reduce((s, i) => s + i.qty * i.price, 0)}
      onBack={() => setShowCart(false)}
      onUpdateQty={(id, qty) => updQ(id, qty)}
      onSeguirAgregando={() => setShowCart(false)}
      onContinue={() => { setShowCart(false); setShowCk(true); }}
      topProducts={products.slice(0, 8)}
      onAddProduct={(p) => addC(p)}
      minOrder={Number(sett?.min_order_amount) || 0}
      form={form}
      sf={(k, v) => setForm(prev => ({ ...prev, [k]: v }))}
      ffGift={ffGift}
    />
  );

  const isOpen = sett.store_open === false ? false : storeStatus.open;

  // --- VISTA PRINCIPAL: CATÁLOGO PRO (Fase 1) ---
  // Horario de HOY para el header ("Abierto · 18:00 a 23:00")
  const todayHours = (() => {
    const hrs = sett?.store_hours;
    if (!hrs) return null;
    const now = serverNow || new Date();
    const today = hrs[(now.getDay() + 6) % 7];
    if (!today || today.closed || !today.open || !today.close) return null;
    return `${today.open} a ${today.close}`;
  })();

  // Cuando esta CERRADO: a que hora abrimos (proxima apertura) para que el
  // cliente sepa cuando volver. Busca el proximo dia con horario (hoy si aun
  // no abrio, sino manana o el dia que corresponda).
  const nextOpenHint = (() => {
    const hrs = sett?.store_hours;
    if (!hrs) return null;
    const now = serverNow || new Date();
    const dayNames = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
    const idxToday = (now.getDay() + 6) % 7;
    const curMin = now.getHours() * 60 + now.getMinutes();
    const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
    for (let d = 0; d < 8; d++) {
      const idx = (idxToday + d) % 7;
      const day = hrs[idx];
      if (!day || day.closed || !day.open) continue;
      if (d === 0 && curMin >= toMin(day.open)) continue; // hoy ya paso la apertura
      const when = d === 0 ? "hoy" : d === 1 ? "mañana" : `el ${dayNames[idx]}`;
      return `abrimos ${when} ${day.open}`;
    }
    return null;
  })();

  const storeForHome = {
    name: sett.biz_name || fallbackSettings.biz_name,
    isOpen,
    hours: todayHours,
    openHint: nextOpenHint,
    logoLetter: sett.logo_letter || fallbackSettings.logo_letter,
    logoColor: sett.logo_color || fallbackSettings.logo_color,
    logoUrl: sett.logo_url || null,
  };

  return (
    <>
      <HomeScreenPro settings={sett}
        store={storeForHome}
        userName={session?.firstName || (form.name ? form.name.split(" ")[0] : null)}
        session={session}
        onLogout={sessionLogout}
        products={products}
        categories={categories}
        cart={cart}
        cartCount={cc}
        cartTotal={ct}
        hasDeal={hasDeal}
        dealPrice={getPrice}
        prepDefault={sett.prep_time_min}
        soldOutIds={soldOutIds}
        onAddToCart={(p) => addC(p)}
        onDecCart={(productId) => {
          const item = cart.find(i => i.id === productId);
          if (item) updQ(item.id, item.qty - 1);
        }}
        onRemoveCart={(productId) => updQ(productId, 0)}
        onOpenCart={() => setShowCart(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        lastOrderItems={lastOrderItems}
        onReorder={(items) => {
          items.forEach(it => {
            const prod = products.find(p => p.id === it.id);
            if (prod) for (let i = 0; i < (it.qty || 1); i++) addC(prod);
          });
          setShowCart(true);
        }}
        onSelectProduct={(p) => { setCpDetail(p); window.scrollTo({ top: 0 }); }}
        onOpenAccount={(tab) => navigate(tab ? `/mi-cuenta?tab=${tab}` : "/mi-cuenta")}
      />
      {cpScreen === "orders" && (
        <OrdersScreenPro
          loadOrders={getOrderHistory}
          onBack={() => setCpScreen(null)}
          onTrack={(id) => navigate(`/order/${id}`)}
        />
      )}
      {cpScreen === "search" && (
        <SearchScreenPro
          products={products}
          categories={categories}
          hasDeal={hasDeal}
          dealPrice={getPrice}
          prepDefault={sett.prep_time_min}
          soldOutIds={soldOutIds}
          onBack={() => setCpScreen(null)}
          onSelectProduct={(p) => { setCpScreen(null); setCpDetail(p); }}
          onSelectCategory={(name) => { const cat = categories.find(c => c.name === name); setCpScreen({ type: "category", name, displayName: cat?.displayName || name, subs: cat?.subs || [] }); }}
          onAddToCart={(p) => addC(p)}
        />
      )}
      {cpScreen && cpScreen.type === "category" && (
        <CategoryScreenPro
          categoryName={cpScreen.name}
          displayName={cpScreen.displayName}
          products={products.filter(p => (cpScreen.subs || []).includes(p.category))}
          hasDeal={hasDeal}
          dealPrice={getPrice}
          prepDefault={sett.prep_time_min}
          soldOutIds={soldOutIds}
          onBack={() => setCpScreen(null)}
          onOpenSearch={() => setCpScreen("search")}
          onSelectProduct={(p) => setCpDetail(p)}
          onAddToCart={(p) => addC(p)}
        />
      )}
      {cpDetail && (
        <ProductDetailScreenPro
          product={cpDetail}
          soldOutIds={soldOutIds}
          hasDeal={hasDeal}
          dealPrice={getPrice}
          prepDefault={sett.prep_time_min}
          related={(cpDetail.related_ids || [])
            .map(id => products.find(x => x.id === id))
            .filter(Boolean)
            .concat(products.filter(x => x.category === cpDetail.category && x.id !== cpDetail.id))
            .slice(0, 4)}
          onBack={() => setCpDetail(null)}
          onSelectRelated={(p) => { setCpDetail(p); window.scrollTo({ top: 0 }); }}
          onAddToCart={(p, qty = 1, size = null) => {
            // +18: si pendiente confirmacion, abrir solo el modal y diferir el resto.
            // El onConfirm del AgeGate cierra detail y abre cart despues.
            let alreadyConfirmed = false;
            try { alreadyConfirmed = !!sessionStorage.getItem("hg_age_18_cart"); } catch { /* empty */ }
            if (p?.requires_age_gate && !alreadyConfirmed) {
              setAgeGatePending({ product: p, size, qty, fromDetail: true });
              return;
            }
            for (let i = 0; i < qty; i++) addC(p, null, size);
            setCpDetail(null);
            setShowCart(true);
          }}
        />
      )}
      {ageGatePending && (
        <AgeGate
          title={ageGatePending.product?.name || "este producto"}
          onConfirm={() => {
            try { sessionStorage.setItem("hg_age_18_cart", "1"); } catch { /* empty */ }
            const { product, size, qty = 1, fromDetail } = ageGatePending;
            setAgeGatePending(null);
            for (let i = 0; i < qty; i++) addC(product, null, size);
            if (fromDetail) {
              setCpDetail(null);
              setShowCart(true);
            }
          }}
        />
      )}
      <WhatsAppFloat whatsapp={sett?.whatsapp} bizName={sett?.biz_name} />
      {/* logoLetter solo cuando settings ya cargo: evita el flash de la "M"
          antes del logo real en la primera visita (sin cache local) */}
      <WelcomeSplash bizName={sett?.biz_name || business.name} logoUrl={sett?.logo_url} logoColor={sett?.logo_color} logoLetter={loading && !sett?.logo_url ? null : sett?.logo_letter} duration={2200} />
      {/* Regalo de cumpleanos: el server valida birth_date (customers) contra
          hoy; % configurable desde CRM. Solo si hay identidad (login o guest) */}
      <BirthdayGift
        email={user?.email || null}
        phone={phoneSession?.phone || null}
        bizName={sett?.biz_name || business.name}
      />
      <ToastContainer />
    </>
  );
}
