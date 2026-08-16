/**
 * RecipeEditor — que insumos lleva un producto, dentro del formulario.
 *
 * Va acá y no en una pantalla aparte porque en el edificio la receta ES el
 * producto: separarlas obligaría a cargar lo mismo dos veces, en dos lugares.
 *
 * Muestra el costo y el margen mientras se edita — que es el momento en que
 * sirven, cuando se está decidiendo el precio.
 */
import { useMemo } from 'react';
import {
  costoReceta, factorDeCosto, indexarInsumos,
} from '../../../services/platformRecipes';

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

const input = {
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  color: 'var(--ag-ink)', background: 'var(--ag-bg-card)',
  border: '1px solid var(--ag-line)', borderRadius: 'var(--ag-r-md, 10px)',
  outline: 'none', boxSizing: 'border-box',
};

export default function RecipeEditor({ lineas, ingredientes, precio, settings, onChange }) {
  const porId = useMemo(() => indexarInsumos(ingredientes), [ingredientes]);

  const costo = costoReceta(lineas, porId, settings);
  const factor = factorDeCosto(settings);
  const precioNum = Number(precio) || 0;
  const ganancia = precioNum - costo;
  const pct = precioNum > 0 ? (ganancia / precioNum) * 100 : null;

  const set = (i, campo, valor) => {
    const next = lineas.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l));
    onChange(next);
  };
  const agregar = () => onChange([...lineas, { ingredient_id: '', qty: '' }]);
  const quitar = (i) => onChange(lineas.filter((_, idx) => idx !== i));

  // Insumos ya usados: no ofrecerlos de nuevo. La PK de la tabla es
  // (product_id, ingredient_id), así que un duplicado moriría contra la DB.
  const usados = new Set(lineas.map(l => l.ingredient_id).filter(Boolean));

  if (!ingredientes.length) {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 10, fontSize: 12,
        background: 'var(--ag-bg-soft)', color: 'var(--ag-ink-3)',
      }}>
        Todavía no cargaste insumos. Cargalos en <strong>Stock</strong> y después volvé
        acá para armar la receta y ver el costo real.
      </div>
    );
  }

  return (
    <div>
      {lineas.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <select
            style={{ ...input, flex: 1, minWidth: 0 }}
            value={l.ingredient_id}
            onChange={e => set(i, 'ingredient_id', e.target.value)}
            aria-label="Insumo"
          >
            <option value="">Elegí un insumo...</option>
            {ingredientes
              .filter(ing => ing.id === l.ingredient_id || !usados.has(ing.id))
              .map(ing => (
                <option key={ing.id} value={ing.id}>
                  {ing.name}{ing.unit ? ` (${ing.unit})` : ''}
                </option>
              ))}
          </select>
          <input
            style={{ ...input, width: 90 }}
            type="number" inputMode="decimal" min="0" step="0.01"
            value={l.qty}
            onChange={e => set(i, 'qty', e.target.value)}
            placeholder="Cant."
            aria-label="Cantidad"
          />
          <button
            type="button"
            onClick={() => quitar(i)}
            aria-label="Quitar insumo"
            style={{
              background: 'none', border: 0, padding: 6, cursor: 'pointer',
              color: 'var(--ag-ink-3)', lineHeight: 0, flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        className="ag-btn-mini"
        onClick={agregar}
        style={{ marginTop: 2 }}
      >
        + Agregar insumo
      </button>

      {lineas.length > 0 && (
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 10,
          background: 'var(--ag-bg-soft)', fontSize: 12, color: 'var(--ag-ink-2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Costo de insumos</span>
            <span>{money(costo)}</span>
          </div>
          {factor > 1 && (
            <div style={{ fontSize: 11, color: 'var(--ag-ink-3)', marginBottom: 6 }}>
              Incluye el colchón de merma y gastos ({Math.round((factor - 1) * 100)}%) que
              cargaste en configuración.
            </div>
          )}
          {precioNum > 0 ? (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              paddingTop: 6, borderTop: '1px solid var(--ag-line)',
              color: ganancia >= 0 ? 'var(--ag-c-sales, #3A7D44)' : 'var(--ag-c-orders, #C62828)',
              fontWeight: 700,
            }}>
              <span>Ganancia por unidad</span>
              <span>{money(ganancia)}{pct != null ? ` · ${pct.toFixed(0)}%` : ''}</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--ag-ink-3)', paddingTop: 6, borderTop: '1px solid var(--ag-line)' }}>
              Poné un precio arriba para ver la ganancia.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
