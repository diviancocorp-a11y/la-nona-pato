// src/catalog-pro/CategoryScreen.jsx
// Listado de una categoría: header + sort + toggle grid/list + productos.
//
// Props: categoryName, displayName, products (ya filtrados de esa categoría),
//   hasDeal, dealPrice, prepDefault,
//   onBack(), onSelectProduct(p), onAddToCart(p), onOpenSearch()

import { useState, useMemo } from "react";
import BadgeTag from "../components/BadgeTag";
import Icon from "./Icon";
import { ProductPhoto, Rating, AddRound, PriceTag, SoldOutBadge, abrible } from "./atoms";
import { mapProduct } from "./homeHelpers";

const SORT_LABELS = {
  pop: "Más pedidos",
  price_asc: "Precio: menor",
  price_desc: "Precio: mayor",
  rating: "Mejor valorados",
};

export default function CategoryScreen({
  categoryName, displayName, products = [],
  hasDeal, dealPrice, prepDefault,
  soldOutIds, // Set de recipe_ids agotados
  onBack, onSelectProduct, onAddToCart, onOpenSearch,
}) {
  const [view, setView] = useState("list");
  const [sort, setSort] = useState("pop");
  const [sortOpen, setSortOpen] = useState(false);

  const mapped = useMemo(
    () => products.map(p => mapProduct(p, { hasDeal, dealPrice, prepDefault, soldOutIds })),
    [products, hasDeal, dealPrice, prepDefault, soldOutIds]
  );

  const sorted = useMemo(() => {
    const arr = [...mapped];
    if (sort === "price_asc") arr.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") arr.sort((a, b) => b.price - a.price);
    else if (sort === "rating") arr.sort((a, b) => b.rating - a.rating);
    else arr.sort((a, b) => b.reviews - a.reviews);
    return arr;
  }, [mapped, sort]);

  return (
    <div className="cp-root cp-surface cp-no-scrollbar" style={{ position: "fixed", inset: 0, width: "100%", zIndex: 240, overflowY: "auto", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 10px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, background: "var(--bg)", zIndex: 5 }}>
        <button onClick={onBack} style={iconBtn} aria-label="Atrás"><Icon name="arrow-left" size={18} /></button>
        <div style={{ flex: 1 }} />
        <button onClick={onOpenSearch} style={iconBtn} aria-label="Buscar"><Icon name="search" size={18} /></button>
      </div>

      {/* Título */}
      <div style={{ padding: "8px 22px 16px" }}>
        <div className="caption" style={{ color: "var(--ac)", marginBottom: 6 }}>Categoría</div>
        <h1 className="h-1" style={{ margin: 0, fontSize: 34 }}>{displayName || categoryName}</h1>
        <div className="body-s" style={{ marginTop: 6, fontSize: 13 }}>{products.length} productos</div>
      </div>

      {/* Sort + view toggle */}
      <div style={{ padding: "0 22px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setSortOpen(o => !o)} style={{
            height: 36, padding: "0 14px", borderRadius: 999, border: "1px solid var(--line)",
            background: "transparent", color: "var(--tx)", fontSize: 13, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)",
          }}>
            <Icon name="filter" size={13} />
            <span style={{ color: "var(--t2)" }}>{SORT_LABELS[sort]}</span>
            <Icon name="chevron-down" size={13} />
          </button>
          {sortOpen && (
            <div style={{
              position: "absolute", top: 42, left: 0, zIndex: 10,
              background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12,
              boxShadow: "var(--sh-md)", overflow: "hidden", minWidth: 180,
            }}>
              {Object.entries(SORT_LABELS).map(([k, label]) => (
                <button key={k} onClick={() => { setSort(k); setSortOpen(false); }} style={{
                  width: "100%", textAlign: "left", padding: "11px 14px", border: 0,
                  background: sort === k ? "var(--b2)" : "transparent",
                  color: sort === k ? "var(--ac)" : "var(--tx)",
                  fontSize: 13, fontWeight: sort === k ? 600 : 400, cursor: "pointer", fontFamily: "var(--font-body)",
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "var(--b2)", borderRadius: 999, padding: 3 }}>
          {["list", "grid"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              width: 34, height: 30, borderRadius: 999, border: 0, cursor: "pointer",
              background: view === v ? "var(--bg)" : "transparent",
              color: view === v ? "var(--tx)" : "var(--t3)",
              boxShadow: view === v ? "var(--sh-sm)" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {v === "list"
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>}
            </button>
          ))}
        </div>
      </div>

      {/* Productos */}
      {view === "list" ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.map(p => (
            <div
              key={p.id}
              {...abrible(() => onSelectProduct?.(p._raw), `Ver ${p.name}`)}
              style={{
              display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 14, alignItems: "center",
              padding: "12px 22px", borderBottom: "1px solid var(--line)", cursor: "pointer",
            }}>
              <div style={{ position: "relative" }}>
                <ProductPhoto src={p.img} height={100} radius={10} tone={p.tone} dim={p.soldOut} />
                {p.soldOut && (
                  <div style={{ position: "absolute", top: 6, left: 6 }}>
                    <SoldOutBadge compact />
                  </div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 17, color: "var(--tx)", lineHeight: 1.3, marginBottom: 4 }}>{p.name}</div>
                {p.desc && <div className="body-s" style={{ fontSize: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 6 }}>{p.desc}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Rating value={p.rating} />
                  <PriceTag price={p.price} oldPrice={p.oldPrice} size="sm" />
                </div>
              </div>
              <AddRound size={32} disabled={p.soldOut} onClick={(e) => { e?.stopPropagation?.(); onAddToCart?.(p._raw); }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "0 22px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {sorted.map(p => (
            <div
              key={p.id}
              {...abrible(() => onSelectProduct?.(p._raw), `Ver ${p.name}`)}
              style={{ position: "relative", cursor: "pointer" }}
            >
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
                <div style={{ position: "absolute", bottom: -10, right: 8 }}>
                  <AddRound size={32} disabled={p.soldOut} onClick={(e) => { e?.stopPropagation?.(); onAddToCart?.(p._raw); }} />
                </div>
              </div>
              <div style={{ paddingTop: 14 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: "var(--tx)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 42 }}>{p.name}</div>
                <div style={{ marginTop: 6 }}><PriceTag price={p.price} oldPrice={p.oldPrice} size="sm" /></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fin del listado */}
      <div style={{ padding: "32px 22px", textAlign: "center" }}>
        <div className="body-s" style={{ fontSize: 13 }}>Eso es todo en {displayName || categoryName}</div>
      </div>
    </div>
  );
}

const iconBtn = {
  width: 38, height: 38, borderRadius: 999, background: "transparent",
  border: "1px solid var(--line)", display: "flex", alignItems: "center",
  justifyContent: "center", color: "var(--tx)", cursor: "pointer",
};
