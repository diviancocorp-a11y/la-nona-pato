/**
 * ProductsPanel — el ABM de productos del edificio.
 *
 * Es la pantalla que hace que el alta self-service sirva de algo: hasta ahora
 * un tenant nuevo se registraba y no tenia donde cargar nada.
 *
 * A diferencia de Recipes.jsx (legacy), aca NO hay ingredientes, ni costeo, ni
 * combos: el edificio no tiene modelo de costos todavia. Un producto es
 * nombre + precio + categoria.
 */
import { useState, useMemo } from 'react';
import { useConfirm } from '../../ConfirmSlideProvider';
import ProductEditor from './ProductEditor';
import { categoriesFrom } from '../../../services/platformAdmin';
import { margen, indexarInsumos } from '../../../services/platformRecipes';
import { terminologia } from '../../../modules/registry';
import DicoCoreEscena from '../../dico/DicoCoreEscena';

function money(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

export default function ProductsPanel({
  products, vertical, loading, onSave, onToggleActive, onDelete, showToast,
  /**
   * Cuando Dico Physical esta atendiendo el catalogo vacio, esta pantalla NO
   * monta su propia escena 2D: serian dos Dicos a la vez. Publica el nodo al
   * que Physical se ancla —el dedo de `pointDown` cae ahi— y deja el CTA real
   * debajo.
   */
  intervencionActiva = false,
  anclaDico,
  ingredientes = [], recetas = null, settings = null, onSubirImagen = null,
}) {
  const confirmSlide = useConfirm();
  const [editing, setEditing] = useState(null); // objeto producto | 'new' | null
  const [search, setSearch] = useState('');

  // Como se llama lo que vende este negocio. Un corte de pelo no es un
  // "producto": la palabra cambia toda la pantalla.
  const t = terminologia(vertical);
  const categories = useMemo(() => categoriesFrom(products), [products]);

  // Indice de insumos una sola vez: el margen se calcula para cada fila de la
  // lista, y rearmarlo por producto seria O(productos x insumos) por render.
  const insumosPorId = useMemo(() => indexarInsumos(ingredientes), [ingredientes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  // Agrupado por categoria, respetando el orden que ya trae el service.
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.category || 'Sin categoria';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()];
  }, [filtered]);

  // La receta se guarda DESPUES del producto y no antes: un producto nuevo
  // todavia no tiene id, y las lineas de receta lo necesitan.
  const handleSave = async (form, lineas) => {
    const saved = await onSave(form, lineas);
    if (saved?.__error) { showToast?.(saved.message || 'No se pudo guardar'); return; }
    showToast?.(form.id ? `${t.singular} actualizado` : `${t.singular} creado`);
    setEditing(null);
  };

  const handleDelete = async (p) => {
    const ok = await confirmSlide({
      title: `Eliminar ${p.name}`,
      body: 'Se borra del catalogo para siempre. Si solo querés que deje de venderse, apagá "Visible" y listo.',
      label: 'Deslizá para eliminar',
    });
    if (!ok) return;
    const res = await onDelete(p.id);
    if (res?.__error) { showToast?.(res.message); return; }
    showToast?.('Producto eliminado');
  };

  /* ── Formulario a pantalla completa ── */
  if (editing) {
    const isNew = editing === 'new';
    return (
      <div className="ag-page-over">
        <div className="ag-page-over-head">
          <button type="button" className="ag-subpage-back" onClick={() => setEditing(null)} aria-label="Volver">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Atrás</span>
          </button>
          <h2 className="ag-page-over-title">{isNew ? t.nuevo : `Editar ${t.singular}`}</h2>
        </div>
        <div className="ag-page-over-body">
          <ProductEditor
            product={isNew ? null : editing}
            vertical={vertical}
            categories={categories}
            ingredientes={ingredientes}
            lineasReceta={isNew ? [] : (recetas?.get(editing.id) || [])}
            settings={settings}
            onSave={handleSave}
            onSubirImagen={onSubirImagen}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  /* ── Listado ──
     Contenedor EN FLUJO, no `ag-page-over`. Esa clase es un overlay de
     pantalla completa (position:fixed, z-index 950) y admin-shared.css tiene
     una regla explicita que esconde el topbar y el bottom nav mientras haya
     uno en el DOM. Usarla para una pestania principal dejaba el panel sin
     engranaje y sin navegacion: los elementos se renderizaban y quedaban
     tapados. Los overlays de verdad —el formulario de abajo— si la usan. */
  return (
    <div style={{ padding: '12px 16px 6px', position: 'relative', zIndex: 2 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18,
          margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em',
        }}>{t.plural}</h2>
      </div>

      <div>
        {products.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 14px', marginBottom: 14,
            background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)', borderRadius: 12,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ag-ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t.buscar}
              aria-label={t.buscar}
              style={{
                flex: 1, border: 0, outline: 'none', background: 'transparent',
                color: 'var(--ag-ink)', fontFamily: 'inherit', fontSize: 13,
              }}
            />
          </div>
        )}

        {(loading || products.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <button type="button" className="ag-cta" onClick={() => setEditing('new')}>
              + Agregar {t.singular}
            </button>
          </div>
        )}

        {loading && <p style={{ color: 'var(--ag-ink-3)', fontSize: 13, textAlign: 'center' }}>Cargando...</p>}

        {!loading && products.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '12px 16px 20px',
            background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)', borderRadius: 14,
          }}>
            {intervencionActiva ? (
              <>
                {/* El ancla. Physical viaja hasta aca y el dedo queda sobre el
                    boton de abajo; el texto lo pone la burbuja de la
                    intervencion, no esta pantalla. */}
                <div className="dico-objetivo" data-dico-objetivo="catalogo-vacio" ref={anclaDico} />
                <button
                  type="button"
                  className="ag-cta dico-cuadro-accion"
                  onClick={() => setEditing('new')}
                >
                  {`+ Agregar ${t.singular}`}
                </button>
              </>
            ) : (
              <DicoCoreEscena
                estado="pregunta"
                lookY={0.65}
                size={188}
                texto={`Empecemos por tu primer ${t.singular}. Cargalo y queda publicado en tu catálogo.`}
                accion={`+ Agregar ${t.singular}`}
                onAccion={() => setEditing('new')}
                title={`Dico mira el botón para agregar el primer ${t.singular}`}
              />
            )}
          </div>
        )}

        {!loading && products.length > 0 && filtered.length === 0 && (
          <p style={{ color: 'var(--ag-ink-3)', fontSize: 13, textAlign: 'center' }}>
            Nada coincide con “{search}”.
          </p>
        )}

        {groups.map(([cat, items]) => (
          <section key={cat} style={{ marginBottom: 18 }}>
            <h3 style={{
              fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em',
              color: 'var(--ag-ink-3)', margin: '0 0 8px 2px',
            }}>
              {cat} <span style={{ opacity: .6 }}>· {items.length}</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(p => {
                // null cuando no hay receta cargada: sin insumos el costo da 0
                // y el margen daria 100%, que es una mentira comoda.
                const m = recetas ? margen(p, recetas.get(p.id), insumosPorId, settings) : null;
                return (
                <article
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px',
                    background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)',
                    borderRadius: 12, opacity: p.active ? 1 : .55,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                      border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit',
                    }}
                    aria-label={`Editar ${p.name}`}
                  >
                    <div style={{
                      fontSize: 14, color: 'var(--ag-ink)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                      {p.requires_age_gate && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ag-ink-3)' }}>+18</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ag-ink-2)', marginTop: 2 }}>
                      {money(p.price)}
                      {p.duration_min ? ` · ${p.duration_min} min` : ''}
                      {!p.active && ' · oculto'}
                      {m && (
                        <span style={{
                          marginLeft: 6,
                          color: m.ganancia >= 0 ? 'var(--ag-c-sales, #3A7D44)' : 'var(--ag-c-orders, #C62828)',
                        }}>
                          · deja {money(m.ganancia)} ({m.pct.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="ag-btn-mini"
                    onClick={() => onToggleActive(p)}
                    title={p.active ? 'Ocultar del catalogo' : 'Mostrar en el catalogo'}
                    aria-label={p.active ? `Ocultar ${p.name}` : `Mostrar ${p.name}`}
                  >
                    {p.active ? 'Ocultar' : 'Mostrar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    title="Eliminar"
                    aria-label={`Eliminar ${p.name}`}
                    style={{
                      background: 'none', border: 0, padding: 6, cursor: 'pointer',
                      color: 'var(--ag-ink-3)', lineHeight: 0,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                    </svg>
                  </button>
                </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
