// src/catalog-pro/HomeScreen.jsx
// Home del Catálogo Pro — conectada a datos reales del Catalog.
// Stories y AI recos usan heurísticas estables (homeHelpers) donde no hay data.
//
// Props:
//   store: { name, isOpen, pickupTime, logoLetter, logoColor }
//   userName?: string
//   products: producto[] (shape DB)
//   categories: [{ name, displayName, subs, deal }]
//   cartCount, cartTotal
//   hasDeal(p), dealPrice(p)  — helpers del Catalog
//   prepDefault?: number
//   onAddToCart(p), onOpenCart(), onSearch(), onSelectCategory(name),
//   onSelectProduct(p), onOpenAccount()

import { useState, useRef, useEffect, useMemo } from "react";
import Icon from "./Icon";
import AccountMenu from "./AccountMenu";
import CatalogMusicToggle from "./CatalogMusicToggle";
import { fmtAR } from "./format";
import {
  ProductPhoto, PriceTag, Rating, StickyCart, SectionHeader, AddRound, SoldOutBadge,
  abrible,
} from "./atoms";
import { mapProduct, buildStories, buildRecos } from "./homeHelpers";
import HermesMark from "../components/HermesMark";
import CatalogFooter from "./CatalogFooter";
import BadgeTag from "../components/BadgeTag";
import TopPedidos from "./TopPedidos";
import PromoCarousel from "./PromoCarousel";
import SuperCombos from "./SuperCombos";
import OrderStatusCard from "./OrderStatusCard";
import { getActiveOrders } from "../lib/activeOrders";

export default function HomeScreen({
  store = {}, userName, products = [], categories = [],
  cartCount = 0, cartTotal = 0,
  hasDeal, dealPrice, prepDefault,
  soldOutIds, // Set de recipe_ids agotados (stock de ingredientes)
  onAddToCart, onOpenCart, onSelectProduct, onOpenAccount,
  session, onLogout,
  settings = {},
  searchQuery = "", onSearchChange,
  // Quick reorder: ultimos items pedidos por el user. [{id, name, qty}]
  lastOrderItems = [],
  onReorder,
  // Cart actions (mostrar [-][qty][+] cuando el item ya esta en cart)
  cart = [],
  onDecCart,
  onRemoveCart,
}) {
  // Link de "seguir mi pedido" si hay un pedido reciente (Catalog lo guarda al confirmar).
  // Pedidos activos (pueden ser varios a la vez): una card de seguimiento
  // por cada uno; cada card se auto-oculta al completarse/cancelarse
  const activeOrders = getActiveOrders();
  const cartQtyById = (id) => {
    const item = (cart || []).find(c => c.id === id || c.product_id === id);
    return item ? item.qty : 0;
  };
  const [activeCat, setActiveCat] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState(null);
  const [storyIdx, setStoryIdx] = useState(0);

  const stories = useMemo(() => buildStories(products, hasDeal), [products, hasDeal]);
  // Saludo: viene de la session unificada (phone-only o magic link).
  // session.firstName ya tiene la prioridad correcta (nickname > nombre > email/phone).
  const firstName = session?.firstName || null;
  const recos = useMemo(() => buildRecos(products, hasDeal), [products, hasDeal]);
  // Combos: el flag is_combo de la receta manda (toggle "Es un combo" del
  // admin). El regex por categoria queda como fallback para data vieja.
  const combos = useMemo(
    () => products
      .filter(p => p.is_combo || /combo|pack|promo|caja|docena|mesa/i.test(p.category || ""))
      .slice(0, 8)
      .map(p => mapProduct(p, { hasDeal, dealPrice, prepDefault, soldOutIds })),
    [products, hasDeal, dealPrice, prepDefault, soldOutIds]
  );
  // Grid completo de TODOS los productos filtrados por categoria activa +
  // busqueda + quick filter (en oferta / vegetariano / nuevos / mas pedidos).
  // Busqueda activa: muestra cards de resultados en vivo y difumina el resto
  const searching = (searchQuery || "").trim().length >= 1;

  const gridProducts = useMemo(() => {
    let list = products;
    if (activeCat && activeCat !== "Todos") {
      const cat = categories.find(c => c.name === activeCat);
      if (cat) {
        // Trim para tolerar trailing spaces en recipe.category (data legacy).
        const catName = (cat.name || "").trim();
        const subs = (cat.subs || []).map(s => (s || "").trim());
        list = list.filter(p => {
          const pc = (p.category || "").trim();
          return pc === catName || subs.includes(pc);
        });
      }
    }
    const q = (searchQuery || "").trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      );
    }
    // Quick filters
    if (activeFilter === "deal") {
      list = list.filter(p => hasDeal?.(p));
    } else if (activeFilter === "veg") {
      list = list.filter(p => p.is_vegetarian || /veg|vegan|vegetal/i.test(p.tags || p.description || ""));
    } else if (activeFilter === "new") {
      // Nuevos: creados en los ultimos 30 dias
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      list = list.filter(p => p.created_at && new Date(p.created_at).getTime() > cutoff);
    } else if (activeFilter === "top") {
      // Mas pedidos: ordenar por sale_count o veces que aparece en orders.
      list = [...list].sort((a, b) => (b.sale_count || 0) - (a.sale_count || 0));
    }
    // Combos al final de la carta (sort estable: el resto conserva su orden)
    list = [...list].sort((a, b) => (a.is_combo ? 1 : 0) - (b.is_combo ? 1 : 0));
    return list.map(p => mapProduct(p, { hasDeal, dealPrice, prepDefault, soldOutIds }));
  }, [products, categories, activeCat, searchQuery, activeFilter, hasDeal, dealPrice, prepDefault, soldOutIds]);

  // Categorias ordenadas por hora del dia (personalizacion).
  // Si una categoria matchea palabras clave del momento, aparece primera.
  const sortedCategories = useMemo(() => {
    const h = new Date().getHours();
    let kws = [];
    if (h >= 6 && h < 11) kws = ["desayuno", "cafe", "café", "merienda", "panaderia", "panadería", "dulce"];
    else if (h >= 11 && h < 16) kws = ["almuerzo", "principal", "mesa", "ensalada", "pasta", "pizza"];
    else if (h >= 16 && h < 19) kws = ["merienda", "cafe", "café", "dulce", "torta", "pasteleria"];
    else kws = ["cena", "pizza", "pasta", "hamburguesa", "sanguche"];
    const matches = (name) => kws.some(k => name.toLowerCase().includes(k));
    const todos = categories.find(c => c.name === "Todos");
    const rest = categories.filter(c => c.name !== "Todos");
    rest.sort((a, b) => Number(matches(b.name)) - Number(matches(a.name)));
    return todos ? [todos, ...rest] : rest;
  }, [categories]);

  useEffect(() => {
    if (stories.length === 0) return;
    const t = setInterval(() => setStoryIdx(i => (i + 1) % stories.length), 4500);
    return () => clearInterval(t);
  }, [stories.length]);

  const quickFilters = [
    { id: "deal", name: "En oferta" },
    { id: "veg", name: "Vegetariano" },
    { id: "new", name: "Nuevos" },
    { id: "top", name: "Más pedidos" },
  ];

  const totalCount = products.length;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 20) return "Buenas tardes";
    return "Buenas noches";
  })();

  const logoLetter = (store.logoLetter || store.name?.charAt(0) || "H").toUpperCase();

  return (
    <div className="cp-root cp-surface cp-no-scrollbar" style={{ paddingBottom: 200, minHeight: "100vh", width: "100%" }}>
      {/* ===== BANNER DE BIENVENIDA (settings.banner_text) ===== */}
      {settings?.banner_text && (
        <div style={{
          padding: "8px 16px", background: "var(--ac)", color: "var(--bg)",
          fontSize: 12.5, fontWeight: 600, textAlign: "center",
          letterSpacing: 0.2,
        }}>
          {settings.banner_text}
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div style={{
        padding: "16px 16px 8px 22px", background: "var(--bg)",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 999,
              background: store.logoColor || "linear-gradient(135deg, var(--ac), var(--ac2))",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
              color: "#fff", fontFamily: "var(--font-heading)", fontSize: 18, flexShrink: 0,
            }}>
              {store.logoUrl ? (
                <img src={store.logoUrl} alt={store.name || "Logo"} loading="eager"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : logoLetter}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--tx)", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {firstName ? `${greeting}, ${firstName} 👋` : (store.name || "Tienda")}
              </div>
              <div className="body-s" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: store.isOpen ? "var(--ok)" : "var(--err)", flexShrink: 0 }} />
                {/* Abierto → horarios de hoy · Cerrado → a que hora abrimos (asi el
                    cliente sabe cuando volver). El nombre del negocio ya vive en el
                    saludo/nombre de arriba, no lo repetimos aca. */}
                {store.isOpen
                  ? `Abierto${store.hours ? ` · ${store.hours}` : ""}`
                  : `Cerrado · ${store.openHint || "pedidos programados"}`}
              </div>
              {settings?.slogan && (
                <div style={{
                  marginTop: 4, fontSize: 11.5, color: "var(--ac)",
                  lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", fontWeight: 600,
                }}>
                  {settings.slogan}
                </div>
              )}
              {settings?.has_physical_store !== false && settings?.store_address && (
                <div style={{
                  marginTop: 3, fontSize: 11, color: "var(--t3)",
                  lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {settings.store_address}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <CatalogMusicToggle />
            <AccountMenu
              session={session}
              onSelect={onOpenAccount}
              onLogout={onLogout}
            />
          </div>
        </div>
      </div>

      {/* ===== PEDIDO ACTIVO — siempre arriba de todo (StatusCard compacto) ===== */}
      {activeOrders.length > 0 && (
        <div style={{ padding: "14px 22px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {activeOrders.map((oid) => (
            <OrderStatusCard key={oid} compact href={"/order/" + oid} orderId={oid} />
          ))}
        </div>
      )}

      {/* ===== QUICK REORDER (si hay pedido previo) ===== */}
      {lastOrderItems.length > 0 && (
        <div style={{ padding: "20px 22px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "14px 16px", borderRadius: 14,
            background: "color-mix(in oklab, var(--ac) 10%, var(--bg))",
            border: "1px solid color-mix(in oklab, var(--ac) 30%, var(--line))",
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ac)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                ⚡ Pedi de nuevo
              </div>
              <div style={{ fontSize: 13, color: "var(--tx)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lastOrderItems.map(it => it.name).slice(0, 3).join(", ")}
                {lastOrderItems.length > 3 && ` +${lastOrderItems.length - 3}`}
              </div>
            </div>
            <button onClick={() => onReorder?.(lastOrderItems)} style={{
              flexShrink: 0, padding: "10px 14px", borderRadius: 999,
              background: "var(--ac)", color: "#fff", border: 0,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}>
              Repetir
            </button>
          </div>
        </div>
      )}

      {/* ===== STORIES (arriba del editorial) ===== */}
      {stories.length > 0 && (
        <div style={{ paddingTop: 20 }}>
          <div className="cp-no-scrollbar" style={{ display: "flex", gap: 10, padding: "0 22px", overflowX: "auto" }}>
            {stories.map((s, i) => (
              <div
                key={s.id}
                {...abrible(() => onSelectProduct?.(s._raw), `Ver ${s.name}`)}
                style={{
                flex: "0 0 100px", height: 140, borderRadius: 16,
                position: "relative", overflow: "hidden", cursor: "pointer",
                border: i === storyIdx ? "2px solid var(--ac)" : "1px solid var(--line)",
                transition: "border 200ms ease",
              }}>
                <ProductPhoto src={s.img} ratio="100/140" radius={0} tone="#5C4A3F" />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.65) 100%)" }} />
                <div style={{ position: "absolute", top: 8, left: 8 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: "#fff",
                    background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
                    padding: "3px 7px", borderRadius: 4, textTransform: "uppercase",
                  }}>{s.tag}</span>
                </div>
                <div style={{ position: "absolute", bottom: 10, left: 10, right: 10, color: "#fff", fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>
                  {s.label}
                </div>
                {i === storyIdx && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.25)" }}>
                    <div style={{ height: "100%", background: "#fff", animation: "cp-story-progress 4500ms linear" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== EDITORIAL ===== */}
      <div style={{ padding: "24px 22px 36px" }}>
        <h1 className="h-1" style={{ margin: 0, fontSize: 32 }}>
          ¿Qué te <RotatingVerb words={["tienta", "seduce", "atrae"]} /> hoy?
        </h1>
      </div>

      {/* ===== SMART SEARCH (in-place filter + autocomplete) ===== */}
      <div style={{ padding: "0 22px 18px", position: "relative" }}>
        <div style={{
          width: "100%", height: 50, background: "var(--b2)", borderRadius: 14,
          display: "flex", alignItems: "center", padding: "0 16px", gap: 12,
          border: "1px solid transparent", fontFamily: "var(--font-body)",
        }}>
          <Icon name="search" size={18} style={{ color: "var(--t2)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Buscar productos..."
            style={{
              flex: 1, height: "100%", border: 0, outline: "none",
              background: "transparent", color: "var(--tx)",
              fontFamily: "var(--font-body)", fontSize: 14,
            }}
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchChange?.("")} style={{
              width: 28, height: 28, borderRadius: 999, background: "var(--bg)",
              border: "1px solid var(--line)", color: "var(--t2)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }} aria-label="Limpiar busqueda">
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ===== RESULTADOS DE BUSQUEDA — cards en vivo mientras tipea ===== */}
      {searching && (
        <div style={{ padding: "0 22px 24px" }}>
          <div className="caption" style={{ marginBottom: 10 }}>
            {gridProducts.length === 0 ? "Sin resultados para tu búsqueda" : `${gridProducts.length} resultado${gridProducts.length !== 1 ? "s" : ""}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
            {gridProducts.slice(0, 12).map(p => (
              <div
                key={p.id}
                {...abrible(() => onSelectProduct?.(p._raw), `Ver ${p.name}`)}
                style={{
                cursor: "pointer", animation: "cp-pcg-rise 300ms ease both",
              }}
              >
                <div style={{ position: "relative" }}>
                  <ProductPhoto src={p.img} height={120} radius={12} tone={p.tone} dim={p.soldOut} />
                  {p.soldOut && <div style={{ position: "absolute", top: 8, left: 8 }}><SoldOutBadge /></div>}
                  {!p.soldOut && (
                    <div style={{ position: "absolute", bottom: 8, right: 8 }}>
                      <AddRound size={30} onClick={(e) => { e?.stopPropagation?.(); onAddToCart?.(p._raw); }} />
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 14.5, color: "var(--tx)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ marginTop: 2 }}><PriceTag price={p.price} oldPrice={p.oldPrice} size="sm" /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== RECOS "PARA VOS" — debajo del buscador ===== */}
      {!searching && recos.length > 0 && (
        <AiRecosCollapsible recos={recos} onSelectProduct={onSelectProduct} content={
          <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recos.map(p => (
              <div key={p.id} onClick={() => onSelectProduct?.(p._raw)} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", cursor: "pointer" }}>
                <ProductPhoto src={p.img} height={64} radius={10} tone={p.tone} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: "var(--tx)", marginBottom: 2 }}>{p.name}</div>
                  <div className="body-s" style={{ fontSize: 11, color: "var(--ac)" }}>
                    <Icon name="sparkle" size={10} style={{ verticalAlign: "-1px", marginRight: 3, display: "inline-block" }} />
                    {p.reason}
                  </div>
                  <div style={{ marginTop: 4 }}><PriceTag price={p.price} oldPrice={p.oldPrice} size="sm" /></div>
                </div>
                <AddRound size={32} onClick={(e) => { e?.stopPropagation?.(); onAddToCart?.(p._raw); }} />
              </div>
            ))}
          </div>
          </>
        } />
      )}

      {/* Todo lo de abajo se difumina mientras se tipea una busqueda */}
      <div style={{
        filter: searching ? "blur(7px)" : "none",
        opacity: searching ? 0.45 : 1,
        pointerEvents: searching ? "none" : "auto",
        transition: "filter 300ms ease, opacity 300ms ease",
      }} aria-hidden={searching}>

      {/* ===== CATEGORÍAS CHIPS ===== */}
      <div style={{ paddingTop: 28 }}>
        <div style={{ padding: "0 22px 12px" }}>
          <div className="caption">Carta · {totalCount} productos</div>
        </div>
        <div className="cp-no-scrollbar" style={{ display: "flex", gap: 6, padding: "0 22px", overflowX: "auto" }}>
          {sortedCategories.map(c => {
            const isActive = activeCat === c.name;
            const catName = (c.name || "").trim();
            const subs = (c.subs || []).map(s => (s || "").trim());
            const count = c.name === "Todos"
              ? totalCount
              : products.filter(p => {
                  const pc = (p.category || "").trim();
                  return pc === catName || subs.includes(pc);
                }).length;
            return (
              <button key={c.name} onClick={() => setActiveCat(c.name)} style={{
                flex: "0 0 auto", height: 36, padding: "0 14px", borderRadius: 999,
                background: isActive ? "var(--tx)" : "transparent",
                color: isActive ? "var(--bg)" : "var(--t2)",
                border: isActive ? "1px solid var(--tx)" : "1px solid var(--line)",
                fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 500,
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 120ms var(--ease)",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {c.displayName || c.name}
                <span style={{ fontSize: 10, color: isActive ? "rgba(255,255,255,0.5)" : "var(--t3)", fontWeight: 400 }}>{count}</span>
              </button>
            );
          })}
        </div>
        {/* Quick filters */}
        <div className="cp-no-scrollbar" style={{ display: "flex", gap: 6, padding: "12px 22px 0", overflowX: "auto" }}>
          {quickFilters.map(f => (
            <button key={f.id} onClick={() => {
              const next = activeFilter === f.id ? null : f.id;
              setActiveFilter(next);
              // Anti falso-positivo: activar un quick filter resetea la
              // categoria a Todos; despues puede combinar eligiendo categoria
              if (next) setActiveCat("Todos");
            }} style={{
              flex: "0 0 auto", height: 28, padding: "0 11px", borderRadius: 6,
              background: activeFilter === f.id ? "color-mix(in oklab, var(--ac) 14%, transparent)" : "transparent",
              color: activeFilter === f.id ? "var(--ac)" : "var(--t2)",
              border: "1px solid " + (activeFilter === f.id ? "var(--ac)" : "var(--line)"),
              fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 500,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all 120ms var(--ease)",
            }}>{f.name}</button>
          ))}
        </div>
      </div>

      {/* ===== LO MAS PEDIDO — top 3 real con reveal animado (lite, sin GSAP) ===== */}
      {!searchQuery && (
        <TopPedidos
          products={products}
          soldOutIds={soldOutIds}
          onSelectProduct={onSelectProduct}
        />
      )}

      {/* ===== CARTA — TODOS los productos filtrados por categoria + busqueda ===== */}
      <SectionHeader title="Nuestra" em="carta" />
      {gridProducts.length === 0 && (
        <div style={{ padding: "20px 22px", color: "var(--t3)", fontSize: 14, textAlign: "center" }}>
          No encontramos productos con ese filtro.
        </div>
      )}
      <div style={{ padding: "0 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
        {gridProducts.map(p => (
          <div key={p.id} onClick={() => onSelectProduct?.(p._raw)} style={{ position: "relative", cursor: "pointer", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative" }}>
              <ProductPhoto src={p.img} height={140} radius={12} tone={p.tone} dim={p.soldOut} />
              {p.soldOut && (
                <div style={{ position: "absolute", top: 8, left: 8 }}>
                  <SoldOutBadge />
                </div>
              )}
              {p.deal && (
                <div style={{ position: "absolute", top: 8, right: 8 }}>
                  <BadgeTag compact label={p.dealLabel} tone={p.dealTone} childBg="#000" childColor="#fff">{p.dealShort}</BadgeTag>
                </div>
              )}
              {p._raw?.requires_age_gate && (
                <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(198,40,40,0.92)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, letterSpacing: "0.04em" }}>
                  +18
                </div>
              )}
              {/* Etiqueta COMBO (mismo estilo que +18) para identificarlos en la carta */}
              {p._raw?.is_combo && !p._raw?.requires_age_gate && (
                <div style={{ position: "absolute", bottom: 8, left: 8, background: "color-mix(in srgb, var(--ac) 92%, #000)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, letterSpacing: "0.04em" }}>
                  COMBO
                </div>
              )}
              {p._raw?.is_combo && p._raw?.requires_age_gate && (
                <div style={{ position: "absolute", bottom: 8, left: 52, background: "color-mix(in srgb, var(--ac) 92%, #000)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, letterSpacing: "0.04em" }}>
                  COMBO
                </div>
              )}
              <div style={{ position: "absolute", bottom: -10, right: 8 }}>
                {(() => {
                  // Agotado: boton deshabilitado, sin stepper aunque este en cart
                  if (p.soldOut) return <AddRound size={32} disabled />;
                  const qty = cartQtyById(p.id);
                  if (qty === 0) return <AddRound size={32} onClick={(e) => { e?.stopPropagation?.(); onAddToCart?.(p._raw); }} />;
                  return (
                    <div onClick={(e) => e.stopPropagation()} style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "var(--ac)", color: "#fff",
                      borderRadius: 999, padding: "3px 6px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}>
                      <button type="button" onClick={() => onDecCart?.(p.id)} style={qtyBtnStyle} aria-label={qty === 1 ? "eliminar" : "restar"}>−</button>
                      <span style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 700 }}>{qty}</span>
                      <button type="button" onClick={() => onAddToCart?.(p._raw)} style={qtyBtnStyle} aria-label="sumar">+</button>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ paddingTop: 14, paddingRight: 4 }}>
              <div style={{
                fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--tx)", lineHeight: 1.3,
                letterSpacing: "-0.005em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden", minHeight: 44,
              }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Rating value={p.rating} />
                <span className="body-s" style={{ fontSize: 11, color: "var(--t3)" }}>· {p.prepMin} min</span>
              </div>
              <div style={{ marginTop: 6 }}><PriceTag price={p.price} oldPrice={p.oldPrice} size="sm" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== SUPER COMBOS — debajo de la carta ===== */}
      {combos.length > 0 && (
        <SuperCombos
          combos={combos}
          onSelectProduct={onSelectProduct}
          onAddToCart={onAddToCart}
        />
      )}

      {/* ===== PROMOS (carrusel: ranking semanal, cumple, programados) ===== */}
      {!searchQuery && <PromoCarousel onOpenAccount={onOpenAccount} />}

      {/* cierre del wrapper que se difumina durante la busqueda */}
      </div>

      {/* ===== STICKY CART + FOOTER ===== */}
      {cartCount > 0 && <StickyCart count={cartCount} total={cartTotal} onClick={onOpenCart} />}
      <CatalogFooter settings={settings} brand={<HermesMark size={18} />} />
    </div>
  );
}

function AiRecosCollapsible({ recos, content, onSelectProduct: _ }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      margin: "20px 22px 0", padding: open ? "16px 18px" : "12px 14px",
      background: "linear-gradient(135deg, color-mix(in oklab, var(--ac) 9%, var(--bg)) 0%, var(--bg) 100%)",
      border: "1px solid color-mix(in oklab, var(--ac) 22%, var(--line))", borderRadius: 14,
      transition: "padding 180ms var(--ease)",
    }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "transparent", border: 0, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--ac)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="sparkle" size={12} stroke={2} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ac)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recomendaciones para ti
          </span>
        </span>
        <span style={{ fontSize: 16, color: "var(--ac)", transition: "transform 200ms", transform: open ? "rotate(180deg)" : "none" }}>⌄</span>
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          {content}
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  width: 38, height: 38, borderRadius: 999, background: "transparent",
  border: "1px solid var(--line)", display: "flex", alignItems: "center",
  justifyContent: "center", color: "var(--tx)", cursor: "pointer",
};

const qtyBtnStyle = {
  width: 22, height: 22, borderRadius: 999, border: 0,
  background: "rgba(255,255,255,0.2)", color: "#fff",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, fontFamily: "inherit",
};

// Verbo rotativo con crossfade suave. Cambia entre sinonimos cada 2.5s.
// Inline aqui para no crear archivo nuevo por un componentito de 20 lineas.
/**
 * La palabra que rota en el titulo.
 *
 * POR QUE ES UNA ANIMACION CSS Y NO UN setInterval
 *
 * Antes esto era un `setInterval` de 2500ms que cambiaba estado de React y
 * hacia fade con una transicion inline. Funcionaba, pero el gate visual de
 * QA Lite congela el movimiento continuo a traves de `getAnimations()`, y un
 * timer de JS no aparece ahi: no habia forma de congelarlo. El resultado era
 * que dos corridas del MISMO commit fotografiaban la palabra en fases
 * distintas del fade, con el mismo bbox —`minWidth` lo mantenia— pero con
 * distinta densidad de tinta y franjas de subpixel cambiadas. Medido: 1429
 * pixeles distintos y 451 bloqueantes en `catalog--ambar`.
 *
 * Ahora las tres palabras estan las tres en el DOM, apiladas, y una sola
 * animacion CSS infinita con `animation-delay` escalonado decide cual se ve.
 * Eso la vuelve declarable en el registro de movimiento del harness y
 * congelable como el resto.
 *
 * REDUCED MOTION: antes no se respetaba. Una palabra que se cambia sola para
 * siempre es justo lo que pide WCAG 2.2.2 poder frenar. Con la preferencia
 * activa no rota: se muestra la primera y punto.
 */
function RotatingVerb({ words = [], intervalMs = 2500, fadeMs = 350 }) {
  const total = Math.max(1, words.length) * intervalMs;
  const pct = (ms) => `${((ms / total) * 100).toFixed(3)}%`;

  if (words.length < 2) {
    return <em style={{ fontStyle: 'italic', color: 'var(--ac)' }}>{words[0] || ''}</em>;
  }

  // Cada palabra: entra en `fadeMs`, se queda hasta `intervalMs - fadeMs`, sale
  // en `fadeMs` y espera apagada el resto del ciclo. Con el retraso escalonado,
  // la siguiente entra JUSTO cuando la anterior termino de salir: nunca hay dos
  // visibles a la vez, igual que con el swap de texto de la version anterior.
  const keyframes = `@keyframes cp-verbo-rota{`
    + `0%{opacity:0}`
    + `${pct(fadeMs)}{opacity:1}`
    + `${pct(intervalMs - fadeMs)}{opacity:1}`
    + `${pct(intervalMs)}{opacity:0}`
    + `100%{opacity:0}}`;

  return (
    <span
      className="cp-verbo"
      style={{ display: 'inline-grid', verticalAlign: 'bottom', minWidth: '5ch' }}
    >
      <style>{keyframes}</style>
      {words.map((palabra, i) => (
        <em
          key={palabra}
          className="cp-verbo-palabra"
          aria-hidden={i > 0 ? 'true' : undefined}
          style={{
            gridArea: '1 / 1',
            fontStyle: 'italic',
            color: 'var(--ac)',
            opacity: i === 0 ? 1 : 0,
            animation: `cp-verbo-rota ${total}ms linear ${i * intervalMs}ms infinite backwards`,
          }}
        >
          {palabra}
        </em>
      ))}
    </span>
  );
}
