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

  /* PASS 2 — la tira de resumen.
   *
   * SOLO datos que ya estan en esta pantalla y que se pueden verificar
   * contando. Nada de "valor de inventario": el edificio no tiene modelo de
   * costos —`unit_cost` va en 0— asi que ese numero seria una invencion con
   * formato de dato. El de stock aparece unicamente si ALGUN producto lo
   * tiene cargado; con la columna vacia, un "0 con stock bajo" diria que esta
   * todo bien cuando en realidad no se sabe.
   */
  const resumen = useMemo(() => {
    const visibles = products.filter(x => x.active !== false).length;
    const conStock = products.filter(x => x.stock !== null && x.stock !== undefined);
    return {
      visibles,
      ocultos: products.length - visibles,
      categorias: new Set(products.map(x => x.category || 'Sin categoría')).size,
      sinStock: conStock.length > 0 ? conStock.filter(x => Number(x.stock) <= 0).length : null,
    };
  }, [products]);

  // Agrupado por categoria, respetando el orden que ya trae el service.
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.category || 'Sin categoría';
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
      body: 'Se borra del catálogo para siempre. Si solo querés que deje de venderse, apagá "Visible" y listo.',
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
    // `ag-pantalla-productos` es el limite de la Golden Screen. Dentro de
    // `.ag-main` tambien viven las oportunidades y el aviso de Dico, que son de
    // Phase 8/9 y tienen su propia deuda declarada; sin este ancla, el gate de
    // Phase 4 les cobraria a ellos.
    <div className="ag-pantalla-productos">
      {/* NO va un <h2> con el nombre de la seccion.
          El shell ya lo pone en `.ag-section-title` (PlatformAdmin), asi que
          la pantalla mostraba "Productos" DOS VECES, una arriba de la otra y
          en dos tipografias distintas: Butler el del shell, DM Sans clavado a
          mano el de aca. Era el sintoma mas visible de "mezcla de eras" y el
          unico lugar de la pantalla que forzaba una familia tipografica. */}

      {/* ── A · Header ─────────────────────────────────────────────────
          El titulo de seccion lo pone el shell; aca va el contexto que ese
          titulo no puede dar —cuantos hay y de que— mas la accion primaria. */}
      <div className="ag-productos-header">
        <div className="ag-productos-header-texto">
          <p className="ag-productos-contexto">
            {products.length === 0
              ? `Todavia no cargaste ningun ${t.singular}.`
              : `${products.length} ${products.length === 1 ? t.singular : t.plural.toLowerCase()} en ${resumen.categorias} ${resumen.categorias === 1 ? 'categoría' : 'categorías'}.`}
          </p>
        </div>
        {(loading || products.length > 0) && (
          <button type="button" className="ag-cta" onClick={() => setEditing('new')}>
            + Agregar {t.singular}
          </button>
        )}
      </div>

      {/* ── B · Resumen ────────────────────────────────────────────────
          Se cuenta, no se estima. El de stock solo sale si hay stock cargado
          (ver `resumen`). */}
      {products.length > 0 && (
        <div className="ag-productos-resumen">
          <div className="ag-kpi">
            <span className="ag-kpi-valor">{resumen.visibles}</span>
            <span className="ag-kpi-pie">en el catálogo</span>
          </div>
          <div className={`ag-kpi${resumen.ocultos > 0 ? ' es-aviso' : ''}`}>
            <span className="ag-kpi-valor">{resumen.ocultos}</span>
            <span className="ag-kpi-pie">ocultos</span>
          </div>
          <div className="ag-kpi">
            <span className="ag-kpi-valor">{resumen.categorias}</span>
            <span className="ag-kpi-pie">categorías</span>
          </div>
          {resumen.sinStock !== null && (
            <div className={`ag-kpi${resumen.sinStock > 0 ? ' es-alerta' : ''}`}>
              <span className="ag-kpi-valor">{resumen.sinStock}</span>
              <span className="ag-kpi-pie">sin stock</span>
            </div>
          )}
        </div>
      )}

      {/* ── C · Toolbar ──────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="ag-productos-barra">
          <div className="ag-productos-buscador">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t.buscar}
              aria-label={t.buscar}
            />
          </div>
        </div>
      )}

      {loading && <p className="ag-productos-estado ag-body">Cargando...</p>}

      {!loading && products.length === 0 && (
        <div className="ag-productos-vacio">
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
        <p className="ag-productos-estado ag-body">
          Nada coincide con “{search}”.
        </p>
      )}

      {/* ── D · Categorias como paneles ─────────────────────────────────
          Una card POR CATEGORIA con filas compactas adentro, no una card
          gigante por producto. Con 21 productos lo anterior era una tira de
          21 tarjetas de 60px de alto: nada agrupaba y nada terminaba. */}
      <div className="ag-productos-categorias">
      {groups.map(([cat, items]) => (
          <section key={cat} className="ag-categoria">
            <header className="ag-categoria-head">
              <h3 className="ag-categoria-nombre">{cat}</h3>
              <span className="ag-categoria-cuenta">
                {items.length} {items.length === 1 ? t.singular : t.plural.toLowerCase()}
              </span>
            </header>

            <div className="ag-categoria-filas">
              {items.map(p => {
                // null cuando no hay receta cargada: sin insumos el costo da 0
                // y el margen daria 100%, que es una mentira comoda.
                const m = recetas ? margen(p, recetas.get(p.id), insumosPorId, settings) : null;
                return (
                <div key={p.id} className={`ag-fila${p.active ? '' : ' esta-oculta'}`}>
                  <button
                    type="button"
                    className="ag-fila-abrir"
                    onClick={() => setEditing(p)}
                    aria-label={`Editar ${p.name}`}
                  >
                    <span className="ag-fila-nombre">
                      {p.name}
                      {p.requires_age_gate && <span className="ag-fila-edad">+18</span>}
                    </span>
                    <span className="ag-fila-meta">
                      {!p.active && <span className="ag-fila-oculto">oculto</span>}
                      {p.duration_min ? <span>{p.duration_min} min</span> : null}
                      {m && (
                        <span className={`ag-fila-margen ${m.ganancia >= 0 ? 'gana' : 'pierde'}`}>
                          deja {money(m.ganancia)} ({m.pct.toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  </button>

                  <span className="ag-fila-precio">{money(p.price)}</span>

                  <div className="ag-fila-acciones">
                    <button
                      type="button"
                      className="ag-btn-mini"
                      onClick={() => onToggleActive(p)}
                      title={p.active ? 'Ocultar del catálogo' : 'Mostrar en el catálogo'}
                      aria-label={p.active ? `Ocultar ${p.name}` : `Mostrar ${p.name}`}
                    >
                      {p.active ? 'Ocultar' : 'Mostrar'}
                    </button>

                    <button
                      type="button"
                      className="ag-producto-eliminar"
                      onClick={() => handleDelete(p)}
                      title="Eliminar"
                      aria-label={`Eliminar ${p.name}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" /><path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </section>
      ))}
      </div>
    </div>
  );
}
