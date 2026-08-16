/**
 * VentasPanel — la pestaña "Ventas" del panel del edificio. ETAPA 4.
 *
 * Contenedor con dos solapas, mismo criterio que FinanzasPanel:
 *   - Ventas:  SalesView del legacy (historial + venta manual)
 *   - Resumen: MonthSummary del legacy (el P&L del mes)
 *
 * Las pantallas hablan el idioma del legacy; los adaptadores
 * (productosComoRecetas / pedidosParaVentas, en platformSales.js) traducen el
 * modelo del edificio UNA vez, aca en el borde.
 *
 * El costo del mes va SIN el colchon de merma/gastos proyectados
 * (costoBruto, no costoReceta): esos porcentajes son de PRICING. Aplicarlos
 * al P&L ademas de restar los gastos reales es el doble conteo que ya se
 * arreglo en el legacy el 12/jun — la ganancia quedaba subestimada.
 */
import { useMemo, useState } from 'react';
import { SalesView } from '../Finance';
import MonthSummary from '../MonthSummary';
import { productosComoRecetas, pedidosParaVentas } from '../../../services/platformSales';
import { costoBruto, indexarInsumos } from '../../../services/platformRecipes';

const SOLAPAS = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'resumen', label: 'Resumen del mes' },
];

function Solapas({ valor, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '12px 16px 0' }}>
      {SOLAPAS.map(o => {
        const on = valor === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-current={on ? 'page' : undefined}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 999,
              border: on ? '2px solid var(--ag-c-terra)' : '1px solid var(--ag-line)',
              background: on ? 'rgba(245,158,11,0.08)' : 'var(--ag-bg-card)',
              color: on ? 'var(--ag-c-terra)' : 'var(--ag-ink-2)',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

export default function VentasPanel({
  sales, setSales,
  orders, itemsPorPedido,
  products, recetas, ingredients, expenses,
  settings, showToast,
  // Los analisis USAR del resumen son gastronomicos (registry).
  permiteUsar = true,
  // Saver del edificio para la venta manual.
  onCrearVenta,
}) {
  const [solapa, setSolapa] = useState('ventas');
  const [ov, setOv] = useState(null);

  const recs = useMemo(
    () => productosComoRecetas(products, recetas),
    [products, recetas]
  );

  const insumosPorId = useMemo(() => indexarInsumos(ingredients), [ingredients]);

  // SalesView muestra los pedidos completados Y las ventas sueltas. Las
  // ventas que complete_order asienta desde un pedido llevan order_id: si se
  // pasaran las dos cosas, cada pedido apareceria dos veces y el total del
  // mes daria el doble.
  const pedidosCompletados = useMemo(
    () => pedidosParaVentas((orders || []).filter(o => o.status === 'completed'), itemsPorPedido),
    [orders, itemsPorPedido]
  );
  const ventasManuales = useMemo(
    () => (sales || []).filter(s => !s.order_id),
    [sales]
  );

  // La venta manual congela el costo de la receta ACTUAL del producto. Sin
  // receta queda 0: el margen de esa venta no se conoce, y un 0 honesto es
  // mejor que un invento.
  const crearVentaConCosto = async (s) => {
    const lineas = recetas?.get?.(s.recipe_id) || [];
    const unitCost = costoBruto(lineas, insumosPorId);
    return onCrearVenta({ ...s, unit_cost: unitCost });
  };

  // Costo del mes para el resumen: receta actual SIN colchon (ver cabecera).
  const costoRecetaMes = (rec) => costoBruto(
    (rec?.ingredients || []).map(l => ({ ingredient_id: l.ingredient_id, qty: l.quantity })),
    insumosPorId
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Solapas valor={solapa} onChange={setSolapa} />

      {solapa === 'ventas' && (
        <SalesView
          sales={ventasManuales}
          setSales={setSales}
          orders={pedidosCompletados}
          recipes={recs}
          overlay={ov}
          setOverlay={setOv}
          showToast={showToast}
          onCreate={crearVentaConCosto}
        />
      )}

      {solapa === 'resumen' && (
        <MonthSummary
          sales={sales || []}
          expenses={expenses || []}
          orders={orders || []}
          recipes={recs}
          ingredients={ingredients || []}
          waste={[]}
          settings={settings || {}}
          calculateRecipeCost={costoRecetaMes}
          permiteUsar={permiteUsar}
          onBack={() => setSolapa('ventas')}
        />
      )}
    </div>
  );
}
