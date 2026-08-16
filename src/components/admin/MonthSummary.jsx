/**
 * MonthSummary — vista consolidada del mes (FASE A).
 *
 * Vista raíz: cards con ingresos · egresos · resultado · top productos · gastos por categoría
 * Drill-down: cada card abre una sub-pantalla con todos los movimientos.
 *
 * Sin cambios de DB — solo agregados sobre datos existentes.
 *
 * Props:
 *   sales, expenses, orders, recipes, ingredients, waste, settings
 *   calculateRecipeCost · función del hook useFinancials
 *   onBack              · volver al Home
 */
import { useMemo, useState } from 'react';
import { formatInt } from '../../lib/utils';
import AnaCard from './shared/cards/AnaCard';
import { buildMonthRecommendations, printMonthReport } from '../../lib/monthReport';
import UsarPnL from "./UsarPnL";
import MenuEngineering from "./MenuEngineering";
import TheoreticalFoodCost from "./TheoreticalFoodCost";
import AnimatedStatCard from "./shared/cards/AnimatedStatCard";
import UsarTrendCard from "./shared/cards/UsarTrendCard";

// Gastos de comida/packaging NO cuentan como gasto operativo: ya viven en el
// costo de mercaderia (mismo criterio que useFinancials, fix doble conteo jun 2026)
const isFoodExpense = (e) =>
  typeof e.usar_category === 'string' &&
  (e.usar_category.startsWith('food_') || e.usar_category === 'packaging');

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const PAYMENT_LABELS = {
  efectivo:      { label: 'Efectivo',     color: 'var(--ag-c-sales)',   icon: '💵' },
  transferencia: { label: 'Transferencia',color: 'var(--ag-c-prep)',    icon: '🏦' },
  mercadopago:   { label: 'MercadoPago',  color: 'var(--ag-c-crm)',     icon: '💳' },
  tarjeta:       { label: 'Tarjeta',      color: 'var(--ag-c-stock)',   icon: '💳' },
  otro:          { label: 'Sin especificar', color: 'var(--ag-ink-3)',  icon: '❓' },
};

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

function fmtDate(str) {
  if (!str) return '';
  const d = str.slice(0, 10);
  const [y, m, day] = d.split('-');
  return `${day}/${m}`;
}

export default function MonthSummary({
  sales = [], expenses = [], orders = [],
  recipes = [], ingredients = [], waste = [],
  settings = {}, calculateRecipeCost,
  onBack,
  // Los analisis USAR (P&L de restaurante, matriz de menu, food cost teorico)
  // son gastronomicos. El edificio los apaga fuera de gastro — a una barberia
  // no se le muestra "food cost". Default true: el admin legacy no cambia.
  permiteUsar = true,
}) {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(monthKey(today));
  const [detail, setDetail] = useState(null); // null | 'income' | 'expenses' | 'products' | 'gastos'

  const [year, month] = selectedMonth.split('-').map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const monthLabel = `${MONTH_NAMES[monthDate.getMonth()]} ${year}`;
  const isCurrentMonth = selectedMonth === monthKey(today);

  const inMonthDate  = (str) => (str || '').slice(0, 7) === selectedMonth;
  const inMonthOrder = (o)   => ((o.created_at || o.date) || '').slice(0, 7) === selectedMonth;

  const ms = useMemo(() => sales.filter(s => inMonthDate(s.date)), [sales, selectedMonth]);
  const me = useMemo(() => expenses.filter(e => inMonthDate(e.date)), [expenses, selectedMonth]);
  const mo = useMemo(() => orders.filter(inMonthOrder), [orders, selectedMonth]);
  const mw = useMemo(() => waste.filter(w => inMonthDate(w.date)), [waste, selectedMonth]);

  // ─── INGRESOS ───
  const totalIngresos = ms.reduce((a, s) => a + (s.total || 0), 0);
  const completedOrders = mo.filter(o => o.status !== 'cancelled');
  const ordersCount = completedOrders.length;
  const ticketAvg = ordersCount > 0 ? Math.round(totalIngresos / ordersCount) : 0;

  const getPaymentMethod = (s) => {
    let m = s.payment_method;
    if (!m && s.order_id) m = mo.find(o => o.id === s.order_id)?.payment;
    m = (m || 'otro').toLowerCase();
    if (!PAYMENT_LABELS[m]) m = 'otro';
    return m;
  };

  const byPayment = useMemo(() => {
    const map = {};
    ms.forEach(s => {
      const m = getPaymentMethod(s);
      map[m] = (map[m] || 0) + (s.total || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, mo]);

  // ─── COSTOS ───
  const totalCostMP = useMemo(() => {
    return ms.reduce((a, s) => {
      const r = recipes.find(x => x.id === s.recipe_id);
      if (!r) return a;
      return a + (calculateRecipeCost?.(r) || 0) * (s.qty || 1);
    }, 0);
  }, [ms, recipes, calculateRecipeCost]);

  const margenBruto = totalIngresos - totalCostMP;

  // ─── EGRESOS ───
  // Fix jun 2026: (1) excluir compras de comida (ya estan en totalCostMP — sumarlas
  // era doble conteo), (2) e.is_fixed NO EXISTE en la tabla → fijos daban siempre 0;
  // el campo real es expense_type.
  const opExpenses = useMemo(() => me.filter(e => !isFoodExpense(e)), [me]);
  const totalGastos = opExpenses.reduce((a, e) => a + (e.amount || 0), 0);
  const fixedExp = opExpenses.filter(e => e.expense_type === 'fixed').reduce((a, e) => a + (e.amount || 0), 0);
  const varExp = totalGastos - fixedExp;

  const mermaCost = useMemo(() => {
    return mw.reduce((a, w) => {
      const ig = ingredients.find(i => i.id === w.ingredient_id);
      return a + (ig?.cost || 0) * (w.qty || 0);
    }, 0);
  }, [mw, ingredients]);

  const totalEgresos = totalGastos + mermaCost;
  const ganancia = margenBruto - totalGastos - mermaCost;
  const margenPct = totalIngresos > 0 ? (ganancia / totalIngresos) * 100 : 0;

  // ─── TOP PRODUCTOS ───
  const productsAll = useMemo(() => {
    const map = {};
    ms.forEach(s => {
      if (!s.recipe_id) return;
      if (!map[s.recipe_id]) map[s.recipe_id] = { qty: 0, total: 0 };
      map[s.recipe_id].qty += (s.qty || 1);
      map[s.recipe_id].total += (s.total || 0);
    });
    return Object.entries(map)
      .map(([id, d]) => ({ recipe: recipes.find(r => r.id === id), ...d }))
      .filter(x => x.recipe)
      .sort((a, b) => b.total - a.total);
  }, [ms, recipes]);
  const topProducts = productsAll.slice(0, 5);

  // ─── GASTOS POR CATEGORÍA ───
  const gastosByCatAll = useMemo(() => {
    const map = {};
    me.forEach(e => {
      const cat = e.category || e.label || 'Otros';
      if (!map[cat]) map[cat] = { total: 0, items: [] };
      map[cat].total += (e.amount || 0);
      map[cat].items.push(e);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [me]);
  const gastosByCat = gastosByCatAll.slice(0, 8);

  const maxIngreso = Math.max(...byPayment.map(([, v]) => v), 1);
  const maxCat = Math.max(...gastosByCat.map(([, d]) => d.total), 1);

  // ─── Recomendaciones automáticas ───
  const recommendations = useMemo(() => buildMonthRecommendations({
    totalIngresos, totalEgresos, totalGastos, totalCostMP, mermaCost, ganancia,
    fixedExp, varExp, ordersCount, byPayment, topProducts, gastosByCat,
    wastePct: settings?.waste_pct ?? 5,
  }), [totalIngresos, totalEgresos, totalGastos, totalCostMP, mermaCost, ganancia, fixedExp, varExp, ordersCount, byPayment, topProducts, gastosByCat, settings]);

  // ─── Exportar informe ───
  const handleExport = () => {
    const salesRows = ms.map(s => {
      const r = recipes.find(x => x.id === s.recipe_id);
      const pm = getPaymentMethod(s);
      return {
        date: (s.date || '').slice(0, 10),
        name: r?.name || '?',
        qty: s.qty || 1,
        payment: PAYMENT_LABELS[pm]?.label || pm,
        total: s.total || 0,
      };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const expensesRows = me.map(e => ({
      date: (e.date || '').slice(0, 10),
      category: e.category || e.label || 'Otros',
      note: e.note || '',
      type: e.is_fixed ? 'Fijo' : 'Variable',
      amount: e.amount || 0,
    })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const wasteRows = mw.map(w => {
      const ig = ingredients.find(i => i.id === w.ingredient_id);
      return {
        date: (w.date || '').slice(0, 10),
        ingredient: ig?.name || '?',
        qty: w.qty || 0,
        unit: ig?.unit || '',
        reason: w.reason || 'otro',
        cost: (ig?.cost || 0) * (w.qty || 0),
      };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    printMonthReport({
      monthLabel, bizName: settings?.biz_name || 'Dico',
      totalIngresos, totalEgresos, totalGastos, totalCostMP, mermaCost,
      ganancia, margenPct, fixedExp, varExp, ordersCount, ticketAvg,
      byPayment, salesRows, expensesRows, wasteRows,
      topProducts, gastosByCat,
      recommendations,
    });
  };

  const goPrev = () => {
    const d = new Date(year, month - 2, 1);
    setSelectedMonth(monthKey(d));
    setDetail(null);
  };
  const goNext = () => {
    const d = new Date(year, month, 1);
    if (d > today) return;
    setSelectedMonth(monthKey(d));
    setDetail(null);
  };

  // ═══════════════════════════════════════════════════════
  //                      DRILL-DOWN
  // ═══════════════════════════════════════════════════════
  if (detail) {
    return (
      <DetailScreen
        detail={detail}
        monthLabel={monthLabel}
        onBack={() => setDetail(null)}
        ms={ms} me={me} mw={mw} mo={mo}
        recipes={recipes} ingredients={ingredients}
        getPaymentMethod={getPaymentMethod}
        productsAll={productsAll}
        gastosByCatAll={gastosByCatAll}
        totals={{ totalIngresos, totalGastos, mermaCost, totalCostMP, totalEgresos }}
      />
    );
  }

  // ═══════════════════════════════════════════════════════
  //                       VISTA ROOT
  // ═══════════════════════════════════════════════════════
  return (
    <div style={{ padding: '12px 16px 24px', position: 'relative', zIndex: 2 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0 4px' }}>
        <button type="button" className="ag-subpage-back" onClick={onBack} aria-label="Volver">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Atrás</span>
        </button>
        <button
          type="button"
          className="ag-cta"
          onClick={handleExport}
          aria-label="Exportar informe del mes"
          style={{ padding: '7px 14px', fontSize: 12, gap: 6 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Exportar</span>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0 16px' }}>
        <button type="button" onClick={goPrev} className="ag-month-nav" aria-label="Mes anterior">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em' }}>{monthLabel}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ag-ink-3)' }}>
            {isCurrentMonth ? 'Mes en curso · datos en vivo' : 'Cerrado'}
          </p>
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={isCurrentMonth}
          className="ag-month-nav"
          aria-label="Mes siguiente"
          style={{ opacity: isCurrentMonth ? 0.3 : 1, cursor: isCurrentMonth ? 'not-allowed' : 'pointer' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* CARDS ANIMADOS: ingresos y gastos por dia del mes (hover = resaltar
          dias sobre el promedio + mejor dia). Datos reales, no decorativos. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
        {(() => {
          const daysInMonth = new Date(year, month, 0).getDate();
          const dayLabel = (i) => `${pad(i + 1)}/${pad(month)}`;
          const salesByDay = Array.from({ length: daysInMonth }, (_, i) => ({ label: dayLabel(i), value: 0 }));
          ms.forEach(s => {
            const d = Number((s.date || '').slice(8, 10)) - 1;
            if (d >= 0 && d < daysInMonth) salesByDay[d].value += s.total || 0;
          });
          const expByDay = Array.from({ length: daysInMonth }, (_, i) => ({ label: dayLabel(i), value: 0 }));
          opExpenses.forEach(e => {
            const d = Number((e.date || '').slice(8, 10)) - 1;
            if (d >= 0 && d < daysInMonth) expByDay[d].value += e.amount || 0;
          });
          // Delta vs mes anterior (real)
          const prevKey = monthKey(new Date(year, month - 2, 1));
          const prevSales = sales.filter(s => (s.date || '').slice(0, 7) === prevKey).reduce((a, s) => a + (s.total || 0), 0);
          const prevExp = expenses.filter(e => (e.date || '').slice(0, 7) === prevKey && !isFoodExpense(e)).reduce((a, e) => a + (e.amount || 0), 0);
          const deltaIngresos = prevSales > 0 ? ((totalIngresos - prevSales) / prevSales) * 100 : null;
          const deltaGastos = prevExp > 0 ? ((totalGastos - prevExp) / prevExp) * 100 : null;
          return (
            <>
              <AnimatedStatCard
                title="Ingresos"
                description="Ventas por día del mes"
                value={`$${formatInt(totalIngresos)}`}
                deltaPct={deltaIngresos}
                bars={salesByDay}
                mainColor="var(--ag-c-sales)"
                secondaryColor="var(--ag-c-stock)"
              />
              <AnimatedStatCard
                title="Gastos operativos"
                description="Sin compras de comida (van en costo de mercadería)"
                value={`$${formatInt(totalGastos)}`}
                deltaPct={deltaGastos}
                bars={expByDay}
                mainColor="var(--ag-c-orders)"
                secondaryColor="var(--ag-c-prep)"
              />
            </>
          );
        })()}
      </div>

      {/* ANÁLISIS AUTOMÁTICO (heurísticas locales — futuro: IA real) */}
      <div style={{ marginBottom: 14 }}>
        <AnaCard title="Análisis automático" state="crm" meta={`${recommendations.length} observaciones`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {recommendations.map((r, i) => {
              const palette = {
                critical: { bg: 'var(--ag-c-orders-soft)', bar: 'var(--ag-c-orders)', text: 'var(--ag-c-orders)' },
                warn:     { bg: 'var(--ag-c-stock-soft)',  bar: 'var(--ag-c-stock)',  text: 'var(--ag-ink)' },
                info:     { bg: 'var(--ag-c-prep-soft)',   bar: 'var(--ag-c-prep)',   text: 'var(--ag-ink)' },
                good:     { bg: 'var(--ag-c-sales-soft)',  bar: 'var(--ag-c-sales)',  text: 'var(--ag-ink)' },
              }[r.type] || { bg: 'var(--ag-bg-soft)', bar: 'var(--ag-ink-3)', text: 'var(--ag-ink)' };
              return (
                <div key={i} style={{
                  padding: '10px 12px 10px 14px',
                  borderRadius: 10,
                  background: palette.bg,
                  borderLeft: `3px solid ${palette.bar}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.text, marginBottom: 4 }}>
                    {r.icon} {r.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ag-ink-2)', lineHeight: 1.45 }}>{r.body}</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--ag-ink-3)', fontStyle: 'italic', margin: '12px 0 0' }}>
            Generado localmente con reglas determinísticas. Cuando integremos un proveedor de IA, este análisis se hace más profundo.
          </p>
        </AnaCard>
      </div>

      {/* Tendencia USAR: ventas vs gastos por dia + margen acumulado.
          Movimiento de reveal al hover/touch (distinto al de resaltado). */}
      <div style={{ marginBottom: 14 }}>
        <UsarTrendCard sales={ms} expenses={me} year={year} month={month} />
      </div>

      {/* P&L USAR (Dark Kitchen) ─────────────────────────────── */}
      {permiteUsar && (
        <div style={{ marginBottom: 14 }}>
          <UsarPnL
            orders={mo}
            sales={ms}
            expenses={me}
            ingredients={ingredients}
            recipes={recipes}
            settings={settings}
            calculateRecipeCost={calculateRecipeCost}
          />
        </div>
      )}

      {/* Menu Engineering (matriz Kasavana) */}
      {permiteUsar && (
        <div style={{ marginBottom: 14 }}>
          <MenuEngineering
            sales={ms}
            recipes={recipes}
            calculateRecipeCost={calculateRecipeCost}
          />
        </div>
      )}

      {/* Theoretical vs Actual Food Cost (detector de fugas) */}
      {permiteUsar && (
        <div style={{ marginBottom: 14 }}>
          <TheoreticalFoodCost
            sales={ms}
            expenses={me}
            ingredients={ingredients}
            recipes={recipes}
          />
        </div>
      )}

      {/* INGRESOS */}
      <div style={{ marginBottom: 14 }}>
        <AnaCard
          title="Ingresos"
          state="sales"
          meta={`${ms.length} ventas`}
          onClick={() => setDetail('income')}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ag-ink)', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em', marginTop: 6, marginBottom: 12 }}>
            ${formatInt(totalIngresos)}
          </div>
          {byPayment.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ag-ink-3)', margin: 0, fontStyle: 'italic' }}>Sin ventas en este mes</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ag-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Por medio de pago · ticket prom ${formatInt(ticketAvg)}
              </div>
              {byPayment.map(([m, v]) => {
                const meta = PAYMENT_LABELS[m] || PAYMENT_LABELS.otro;
                const pct = (v / maxIngreso) * 100;
                const sharePct = totalIngresos > 0 ? (v / totalIngresos) * 100 : 0;
                return (
                  <div key={m}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ag-ink)', fontWeight: 600 }}>{meta.icon} {meta.label}</span>
                      <span style={{ color: meta.color, fontWeight: 700 }}>
                        ${formatInt(v)} <span style={{ color: 'var(--ag-ink-3)', fontWeight: 500, fontSize: 11 }}>({sharePct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--ag-bg-soft)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AnaCard>
      </div>

      {/* EGRESOS */}
      <div style={{ marginBottom: 14 }}>
        <AnaCard
          title="Egresos"
          state="orders"
          meta={`${me.length + mw.length} movimientos`}
          onClick={() => setDetail('expenses')}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ag-c-orders)', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em', marginTop: 6, marginBottom: 12 }}>
            ${formatInt(totalEgresos)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <BreakItem label="Costo materia prima" value={totalCostMP} />
            <BreakItem label="Gastos fijos" value={fixedExp} />
            <BreakItem label="Gastos variables" value={varExp} />
            <BreakItem label="Merma valorizada" value={mermaCost} />
          </div>
        </AnaCard>
      </div>

      {/* RESULTADO (no clickeable: es un cálculo, no una lista) */}
      <div style={{ marginBottom: 14 }}>
        <AnaCard title="Resultado" state={ganancia >= 0 ? 'crm' : 'orders'} meta={`${margenPct.toFixed(1)}% margen`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0 10px' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ag-ink-2)', fontWeight: 600 }}>Margen bruto</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ag-c-sales)' }}>${formatInt(margenBruto)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--ag-line)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ag-ink-2)', fontWeight: 600 }}>− Gastos del mes</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ag-c-orders)' }}>−${formatInt(totalGastos)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--ag-line)' }}>
            <span style={{ fontSize: 12.5, color: 'var(--ag-ink-2)', fontWeight: 600 }}>− Merma valorizada</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ag-c-orders)' }}>−${formatInt(mermaCost)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0 4px', borderTop: '2px solid var(--ag-c-terra)' }}>
            <span style={{ fontSize: 14, color: 'var(--ag-ink)', fontWeight: 700 }}>Ganancia neta</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: ganancia >= 0 ? 'var(--ag-c-sales)' : 'var(--ag-c-orders)', fontFamily: "'DM Sans', sans-serif", letterSpacing: '-0.01em' }}>
              ${formatInt(ganancia)}
            </span>
          </div>
        </AnaCard>
      </div>

      {/* TOP PRODUCTOS */}
      {topProducts.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <AnaCard
            title="Top productos"
            state="recipes"
            meta={`${productsAll.length} en total`}
            onClick={() => setDetail('products')}
          >
            <div style={{ marginTop: 8 }}>
              {topProducts.map((p, i) => (
                <div key={p.recipe.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--ag-c-recipes-soft)', color: 'var(--ag-c-recipes)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ag-ink)' }}>{p.recipe.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>{p.qty} uds</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-ink)' }}>${formatInt(p.total)}</div>
                </div>
              ))}
            </div>
          </AnaCard>
        </div>
      )}

      {/* GASTOS POR CATEGORÍA */}
      {gastosByCat.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <AnaCard
            title="Gastos por categoría"
            state="orders"
            meta={`${gastosByCatAll.length} categorías`}
            onClick={() => setDetail('gastos')}
          >
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {gastosByCat.map(([cat, d]) => {
                const pct = (d.total / maxCat) * 100;
                const sharePct = totalGastos > 0 ? (d.total / totalGastos) * 100 : 0;
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ag-ink)', fontWeight: 600, textTransform: 'capitalize' }}>{cat}</span>
                      <span style={{ color: 'var(--ag-c-orders)', fontWeight: 700 }}>
                        ${formatInt(d.total)} <span style={{ color: 'var(--ag-ink-3)', fontWeight: 500, fontSize: 11 }}>({sharePct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--ag-bg-soft)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ag-c-orders)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </AnaCard>
        </div>
      )}

    </div>
  );
}

function BreakItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: 'var(--ag-ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ag-ink)' }}>${formatInt(value)}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────────── */
/*               DRILL-DOWN — DetailScreen               */
/* ───────────────────────────────────────────────────── */

function DetailScreen({
  detail, monthLabel, onBack,
  ms, me, mw, mo, recipes, ingredients,
  getPaymentMethod, productsAll, gastosByCatAll, totals,
}) {
  const TITLES = {
    income:   { t: 'Ingresos',           sub: `${ms.length} ventas`,                         total: totals.totalIngresos,             color: 'var(--ag-c-sales)',  state: 'sales' },
    expenses: { t: 'Egresos',            sub: `${me.length + mw.length} movimientos`,        total: totals.totalEgresos,              color: 'var(--ag-c-orders)', state: 'orders' },
    products: { t: 'Productos vendidos', sub: `${productsAll.length} productos distintos`,   total: totals.totalIngresos,             color: 'var(--ag-c-recipes)',state: 'recipes' },
    gastos:   { t: 'Gastos por categoría', sub: `${gastosByCatAll.length} categorías`,       total: totals.totalGastos,               color: 'var(--ag-c-orders)', state: 'orders' },
  };
  const cfg = TITLES[detail] || TITLES.income;

  return (
    <div style={{ padding: '12px 16px 24px', position: 'relative', zIndex: 2 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px' }}>
        <button type="button" className="ag-subpage-back" onClick={onBack} aria-label="Volver al resumen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Resumen</span>
        </button>
      </div>

      <div style={{ padding: '6px 0 16px' }}>
        <div style={{ fontSize: 11.5, color: 'var(--ag-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 3 }}>{monthLabel}</div>
        <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 22, margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em' }}>{cfg.t}</h1>
        <div style={{ fontSize: 12, color: 'var(--ag-ink-3)', marginTop: 2 }}>{cfg.sub}</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: cfg.color, fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>
          ${formatInt(cfg.total)}
        </div>
      </div>

      {detail === 'income' && (
        <IncomeList ms={ms} recipes={recipes} getPaymentMethod={getPaymentMethod} />
      )}
      {detail === 'expenses' && (
        <ExpensesList me={me} mw={mw} ingredients={ingredients} costoMP={totals.totalCostMP} />
      )}
      {detail === 'products' && (
        <ProductsList products={productsAll} />
      )}
      {detail === 'gastos' && (
        <GastosByCatList groups={gastosByCatAll} />
      )}
    </div>
  );
}

/* ─── Listas detalladas ─── */

function IncomeList({ ms, recipes, getPaymentMethod }) {
  // Agrupa por día para ser leíble
  const byDay = useMemo(() => {
    const map = {};
    ms.forEach(s => {
      const d = (s.date || '').slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(s);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [ms]);

  if (ms.length === 0) {
    return <EmptyState text="No hay ventas registradas en este mes." />;
  }

  return (
    <div>
      {byDay.map(([day, items]) => {
        const dayTotal = items.reduce((a, s) => a + (s.total || 0), 0);
        return (
          <div key={day} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ag-ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fmtDate(day)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ag-c-sales)' }}>${formatInt(dayTotal)}</span>
            </div>
            <div className="ag-card" style={{ padding: 4 }}>
              {items.map((s, i) => {
                const r = recipes.find(x => x.id === s.recipe_id);
                const pm = getPaymentMethod(s);
                const meta = PAYMENT_LABELS[pm] || PAYMENT_LABELS.otro;
                return (
                  <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ag-c-sales-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{meta.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ag-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r?.name || 'Producto'}</div>
                      <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>{s.qty || 1} u · {meta.label}</div>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ag-c-sales)' }}>${formatInt(s.total || 0)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpensesList({ me, mw, ingredients, costoMP }) {
  // Combina gastos + mermas en una lista cronológica
  const combined = useMemo(() => {
    const list = [];
    me.forEach(e => list.push({
      type: 'expense',
      date: e.date || '',
      label: e.category || e.label || 'Gasto',
      hint: e.note || (e.is_fixed ? 'Fijo' : 'Variable'),
      amount: e.amount || 0,
      icon: '💸',
      id: 'e-' + e.id,
    }));
    mw.forEach(w => {
      const ig = ingredients.find(i => i.id === w.ingredient_id);
      const cost = (ig?.cost || 0) * (w.qty || 0);
      list.push({
        type: 'waste',
        date: w.date || '',
        label: `Merma: ${ig?.name || 'ingrediente'}`,
        hint: `${w.qty || 0} ${ig?.unit || ''} · ${w.reason || 'otro'}`,
        amount: cost,
        icon: '🗑️',
        id: 'w-' + w.id,
      });
    });
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [me, mw, ingredients]);

  return (
    <div>
      {/* Banner del costo materia prima — no es una "operación" del mes pero conviene mostrarlo */}
      {costoMP > 0 && (
        <div className="ag-card" style={{ padding: '12px 14px', marginBottom: 14, background: 'var(--ag-bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ag-ink)' }}>Costo materia prima (consumida)</div>
              <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>Estimado por ventas × receta. No es una operación.</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ag-ink)' }}>${formatInt(costoMP)}</div>
          </div>
        </div>
      )}

      {combined.length === 0
        ? <EmptyState text="No hay gastos ni mermas registradas en este mes." />
        : (
          <div className="ag-card" style={{ padding: 4 }}>
            {combined.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: item.type === 'waste' ? 'var(--ag-c-stock-soft)' : 'var(--ag-c-orders-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ag-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>{fmtDate(item.date)} · {item.hint}</div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ag-c-orders)' }}>−${formatInt(item.amount)}</div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function ProductsList({ products }) {
  if (products.length === 0) return <EmptyState text="No hay ventas en este mes." />;
  const totalQty = products.reduce((a, p) => a + p.qty, 0);
  return (
    <div className="ag-card" style={{ padding: 4 }}>
      {products.map((p, i) => {
        const sharePct = totalQty > 0 ? (p.qty / totalQty) * 100 : 0;
        return (
          <div key={p.recipe.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ag-c-recipes-soft)', color: 'var(--ag-c-recipes)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>#{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ag-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.recipe.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>{p.qty} u · {sharePct.toFixed(1)}% del volumen</div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ag-ink)' }}>${formatInt(p.total)}</div>
          </div>
        );
      })}
    </div>
  );
}

function GastosByCatList({ groups }) {
  if (groups.length === 0) return <EmptyState text="No hay gastos registrados en este mes." />;
  return (
    <div>
      {groups.map(([cat, d]) => (
        <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-ink)', textTransform: 'capitalize' }}>{cat}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-c-orders)' }}>${formatInt(d.total)}</span>
          </div>
          <div className="ag-card" style={{ padding: 4 }}>
            {d.items.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((e, i) => (
              <div key={e.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ag-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.note || e.label || cat}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>{fmtDate(e.date)} · {e.is_fixed ? 'Fijo' : 'Variable'}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-c-orders)' }}>−${formatInt(e.amount || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="ag-card" style={{ padding: 28, textAlign: 'center', color: 'var(--ag-ink-3)', fontSize: 13 }}>
      {text}
    </div>
  );
}
