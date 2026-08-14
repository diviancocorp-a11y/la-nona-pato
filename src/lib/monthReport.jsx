/**
 * monthReport.js — generación de informe del mes (PDF imprimible)
 * y recomendaciones automáticas basadas en heurísticas.
 *
 * Las recomendaciones HOY son reglas determinísticas. Cuando definamos
 * un provider de IA (Anthropic, OpenAI, etc.) se reemplaza
 * buildMonthRecommendations() por una llamada al backend.
 */
import { todayISO } from './utils';
import { fmtAR as fmt } from './format';

/* ────────────────────────────────────────────────────────────
 * Recomendaciones (heurísticas determinísticas)
 * ──────────────────────────────────────────────────────────── */
export function buildMonthRecommendations(data) {
  const {
    totalIngresos = 0, totalEgresos = 0, totalGastos = 0,
    totalCostMP = 0, mermaCost = 0, ganancia = 0,
    fixedExp = 0, varExp = 0, ordersCount = 0,
    byPayment = [], topProducts = [], gastosByCat = [],
    wastePct = 5,
  } = data;

  const rec = [];
  const margenPct = totalIngresos > 0 ? (ganancia / totalIngresos) * 100 : 0;

  // ─── Margen ───
  if (totalIngresos > 0) {
    if (margenPct < 0) {
      rec.push({
        type: 'critical', icon: '⚠',
        title: 'Pérdida operativa',
        body: `Estás perdiendo ${margenPct.toFixed(1)}% sobre ventas. Acciones: 1) Revisar precios producto por producto en Recetas; 2) Auditar gastos fijos (próximo punto); 3) Verificar el % de merma real (sub-página Stock).`,
      });
    } else if (margenPct < 10) {
      rec.push({
        type: 'warn', icon: '⚠',
        title: `Margen bajo (${margenPct.toFixed(1)}%)`,
        body: `Para una panadería/restaurant, un margen sano arranca en 15-20%. Estás por debajo. Subir precios un 5-8% en los top productos suele ser invisible para el cliente y mueve la aguja rápido.`,
      });
    } else if (margenPct > 35) {
      rec.push({
        type: 'good', icon: '✓',
        title: `Margen alto (${margenPct.toFixed(1)}%)`,
        body: 'Margen saludable. Conviene revisar si tenés capacidad ociosa: con margen así, sumar 1-2 productos nuevos o expandir horarios puede multiplicar la ganancia rápido.',
      });
    }
  }

  // ─── Concentración de productos (riesgo de dependencia) ───
  if (topProducts.length > 0 && totalIngresos > 0) {
    const top1 = topProducts[0];
    const share = top1.total / totalIngresos;
    if (share > 0.4) {
      rec.push({
        type: 'warn', icon: '⚠',
        title: `Dependencia de "${top1.recipe.name}"`,
        body: `Representa el ${(share * 100).toFixed(0)}% de tus ingresos. Si por algún motivo no podés ofrecerlo (faltante de insumo, equipo roto), pegás un golpe fuerte. Diversificá empujando los productos #2-#5.`,
      });
    }
  }

  // ─── Mezcla de medios de pago ───
  if (byPayment.length > 0) {
    const cash = byPayment.find(([m]) => m === 'efectivo')?.[1] || 0;
    const cashPct = totalIngresos > 0 ? (cash / totalIngresos) * 100 : 0;
    if (cashPct > 70) {
      rec.push({
        type: 'info', icon: '💵',
        title: `${cashPct.toFixed(0)}% en efectivo`,
        body: 'Mucho efectivo concentra riesgos (robo, descuadre, control fiscal). Sumá QR de MP visible en el local y ofrecé descuentos chicos (3-5%) por transferencia para correr volumen a digital.',
      });
    } else if (cashPct < 20 && totalIngresos > 0) {
      rec.push({
        type: 'good', icon: '✓',
        title: 'Mezcla de pagos diversificada',
        body: `Solo ${cashPct.toFixed(0)}% en efectivo. Tu cobranza está digitalizada, eso simplifica control y reduce riesgos.`,
      });
    }
  }

  // ─── Ratio fijos vs variables ───
  if (totalGastos > 0) {
    const fixedRatio = (fixedExp / totalGastos) * 100;
    if (fixedRatio > 60) {
      rec.push({
        type: 'warn', icon: '🏠',
        title: `Gastos fijos altos (${fixedRatio.toFixed(0)}%)`,
        body: 'Gran parte de los gastos no podés bajar a corto plazo (alquiler, sueldos, servicios). En un mes flojo, esto duele. Considerá renegociar contratos cada 6 meses y monitoreá ventas vs. punto de equilibrio.',
      });
    }
  }

  // ─── Merma vs proyectada ───
  if (totalCostMP > 0 && mermaCost > 0) {
    const projected = totalCostMP * (wastePct / 100);
    if (mermaCost > projected * 1.5) {
      rec.push({
        type: 'warn', icon: '🗑',
        title: 'Merma real supera la proyectada',
        body: `Cargaste ${fmt(mermaCost)} en merma, casi 2× lo que el sistema proyectaba con ${wastePct}%. O subí el % en Merma para reflejar la realidad, o atacá las causas (vencimientos, sobre-producción, mal manejo).`,
      });
    }
  }

  // ─── Categoría de gasto dominante ───
  if (gastosByCat.length > 0 && totalGastos > 0) {
    const [topCat, topCatData] = gastosByCat[0];
    const catShare = (topCatData.total / totalGastos) * 100;
    if (catShare > 35) {
      rec.push({
        type: 'info', icon: '📊',
        title: `"${topCat}" es tu mayor gasto`,
        body: `Representa el ${catShare.toFixed(0)}% de los egresos. Es el primer lugar donde optimizar tiene impacto medible. Pedí 2-3 cotizaciones alternativas y comparé.`,
      });
    }
  }

  // ─── Pocos pedidos ───
  if (ordersCount === 0 && totalIngresos === 0) {
    rec.push({
      type: 'info', icon: 'ℹ',
      title: 'Sin actividad registrada',
      body: 'No hay ventas ni pedidos en este mes. Si estás recién arrancando, cargá las ventas históricas para que el sistema tenga base.',
    });
  }

  if (rec.length === 0) {
    rec.push({
      type: 'good', icon: '✓',
      title: 'Todo en orden',
      body: 'No se detectan problemas operativos en los datos del mes. Buen trabajo.',
    });
  }

  return rec;
}

/* ────────────────────────────────────────────────────────────
 * HTML printable del informe completo
 * ──────────────────────────────────────────────────────────── */
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildSection(title, rows, totalLabel, totalValue, color) {
  const tableRows = rows.length === 0
    ? `<tr><td colspan="99" style="padding:14px;text-align:center;color:#888;font-style:italic">Sin movimientos</td></tr>`
    : rows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('');

  return `
  <section class="sec" style="--c:${color}">
    <div class="sec-head">
      <h2>${escape(title)}</h2>
      ${totalLabel ? `<div class="sec-total">${escape(totalLabel)}: <strong>${escape(totalValue)}</strong></div>` : ''}
    </div>
    <table>
      <tbody>${tableRows}</tbody>
    </table>
  </section>`;
}

const PAYMENT_LABEL = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  mercadopago: 'MercadoPago', tarjeta: 'Tarjeta', otro: 'Sin especificar',
};

export function printMonthReport(data) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Permití las ventanas emergentes para descargar el informe.'); return; }

  const {
    monthLabel = '', bizName = '',
    totalIngresos = 0, totalEgresos = 0, totalGastos = 0,
    totalCostMP = 0, mermaCost = 0, ganancia = 0, margenPct = 0,
    fixedExp = 0, varExp = 0, ordersCount = 0, ticketAvg = 0,
    byPayment = [], salesRows = [], expensesRows = [], wasteRows = [],
    topProducts = [], gastosByCat = [],
    recommendations = [],
  } = data;

  // Tablas
  const paymentRows = byPayment.map(([m, v]) => {
    const pct = totalIngresos > 0 ? (v / totalIngresos * 100).toFixed(1) : '0';
    return [PAYMENT_LABEL[m] || m, fmt(v), `${pct}%`];
  });

  const productsTable = topProducts.map((p, i) => [
    `#${i + 1}`, p.recipe?.name || '?', `${p.qty} u`, fmt(p.total),
  ]);

  const gastosCatTable = gastosByCat.map(([cat, d]) => {
    const pct = totalGastos > 0 ? (d.total / totalGastos * 100).toFixed(1) : '0';
    return [cat, fmt(d.total), `${pct}%`];
  });

  const salesTable = salesRows.map(s => [s.date, s.name, `${s.qty} u`, s.payment, fmt(s.total)]);
  const expensesTable = expensesRows.map(e => [e.date, e.category, e.note, e.type, fmt(e.amount)]);
  const wasteTable = wasteRows.map(w => [w.date, w.ingredient, `${w.qty} ${w.unit}`, w.reason, fmt(w.cost)]);

  // Header con tabla de tabla
  const headerTr = (cols) => `<tr>${cols.map(c => `<th>${escape(c)}</th>`).join('')}</tr>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Informe ${escape(monthLabel)} · ${escape(bizName)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;padding:32px 40px;color:#2a2522;background:#fff;font-size:13px;line-height:1.5}
  .toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #eee;padding:10px 0;margin:-16px -8px 24px;display:flex;justify-content:space-between;align-items:center}
  .toolbar button{padding:8px 18px;background:#C45D3E;color:#fff;border:0;border-radius:999px;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 4px 12px rgba(196,93,62,.25)}

  h1{font-size:26px;margin:0;letter-spacing:-0.01em;color:#1a1817}
  .header-meta{color:#888;font-size:13px;margin-top:4px}
  .biz{color:#C45D3E;font-weight:700;font-size:15px;margin-top:6px}

  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:24px 0}
  .summary-card{padding:14px 16px;border-radius:14px;background:#FAF6F0;border-top:3px solid var(--c,#C45D3E)}
  .summary-card .lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.06em}
  .summary-card .val{font-size:22px;font-weight:800;margin-top:4px;color:#1a1817;letter-spacing:-0.01em}
  .summary-card .sub{font-size:11px;color:#888;margin-top:2px}

  .sec{margin-bottom:30px;page-break-inside:avoid}
  .sec-head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--c,#C45D3E);padding-bottom:6px;margin-bottom:12px}
  .sec h2{margin:0;font-size:16px;color:#1a1817}
  .sec-total{font-size:13px;color:#666}
  .sec-total strong{color:var(--c,#1a1817);font-size:15px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#F5EFE7;text-align:left;padding:7px 10px;font-weight:700;color:#444;border-bottom:1px solid #ddd}
  td{padding:6px 10px;border-bottom:1px solid #f0e8dc;color:#333}
  td:last-child{text-align:right;font-weight:600;white-space:nowrap}

  .reco-grid{display:flex;flex-direction:column;gap:10px}
  .reco{padding:12px 14px;border-radius:12px;background:#FAF6F0;border-left:4px solid var(--rc,#888)}
  .reco.critical{--rc:#E85A4A;background:#FBE0DC}
  .reco.warn{--rc:#E8A53A;background:#FAEBC9}
  .reco.info{--rc:#3A8B9F;background:#D7EBF1}
  .reco.good{--rc:#2A9D6E;background:#DFF1E8}
  .reco-t{font-weight:700;font-size:13.5px;color:#1a1817;margin-bottom:4px}
  .reco-b{font-size:12px;color:#444}

  .ai-disclaimer{font-size:10.5px;color:#999;font-style:italic;margin-top:14px;padding:8px 12px;background:#F9F6F1;border-radius:6px}

  .footer{margin-top:40px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center}

  @media print {
    body{padding:14px 24px}
    .toolbar{display:none}
    .sec{break-inside:avoid}
    .summary-grid{break-inside:avoid}
  }
</style></head><body>

<div class="toolbar">
  <span style="font-size:11px;color:#888">Generado: ${todayISO()}</span>
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
</div>

<header>
  <h1>Informe del mes</h1>
  <div class="biz">${escape(bizName)}</div>
  <div class="header-meta">${escape(monthLabel)} · ${ordersCount} pedidos · ticket promedio ${fmt(ticketAvg)}</div>
</header>

<!-- KPIs principales -->
<div class="summary-grid">
  <div class="summary-card" style="--c:#2A9D6E"><div class="lbl">Ingresos</div><div class="val">${fmt(totalIngresos)}</div></div>
  <div class="summary-card" style="--c:#E85A4A"><div class="lbl">Egresos</div><div class="val">${fmt(totalEgresos)}</div><div class="sub">Gastos ${fmt(totalGastos)} · Merma ${fmt(mermaCost)}</div></div>
  <div class="summary-card" style="--c:${ganancia >= 0 ? '#2A9D6E' : '#E85A4A'}"><div class="lbl">Ganancia neta</div><div class="val">${fmt(ganancia)}</div><div class="sub">${margenPct.toFixed(1)}% margen</div></div>
  <div class="summary-card" style="--c:#3A8B9F"><div class="lbl">Pedidos</div><div class="val">${ordersCount}</div><div class="sub">ticket prom ${fmt(ticketAvg)}</div></div>
</div>

<!-- Análisis automático -->
<section class="sec" style="--c:#6B5BD6">
  <div class="sec-head"><h2>Análisis automático</h2><div class="sec-total">${recommendations.length} observaciones</div></div>
  <div class="reco-grid">
    ${recommendations.map(r => `
      <div class="reco ${escape(r.type)}">
        <div class="reco-t">${escape(r.icon)} ${escape(r.title)}</div>
        <div class="reco-b">${escape(r.body)}</div>
      </div>
    `).join('')}
  </div>
  <p class="ai-disclaimer">Las observaciones se generan localmente a partir de tus datos del mes con reglas determinísticas (no IA externa). Cuando se integre un proveedor de IA, este bloque incluirá un análisis más profundo.</p>
</section>

<!-- Ingresos por medio de pago -->
<section class="sec" style="--c:#2A9D6E">
  <div class="sec-head"><h2>Ingresos por medio de pago</h2><div class="sec-total">Total: <strong>${fmt(totalIngresos)}</strong></div></div>
  <table>
    <thead>${headerTr(['Medio', 'Monto', '%'])}</thead>
    <tbody>${paymentRows.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#888;font-style:italic">Sin ventas</td></tr>' : paymentRows.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<!-- Top productos -->
<section class="sec" style="--c:#D4894A">
  <div class="sec-head"><h2>Top productos del mes</h2><div class="sec-total">${topProducts.length} en ranking</div></div>
  <table>
    <thead>${headerTr(['Pos', 'Producto', 'Cantidad', 'Ingreso'])}</thead>
    <tbody>${productsTable.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#888;font-style:italic">Sin productos vendidos</td></tr>' : productsTable.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<!-- Gastos por categoría -->
<section class="sec" style="--c:#E85A4A">
  <div class="sec-head"><h2>Gastos por categoría</h2><div class="sec-total">Total: <strong>${fmt(totalGastos)}</strong> · Fijos ${fmt(fixedExp)} · Variables ${fmt(varExp)}</div></div>
  <table>
    <thead>${headerTr(['Categoría', 'Monto', '%'])}</thead>
    <tbody>${gastosCatTable.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:#888;font-style:italic">Sin gastos</td></tr>' : gastosCatTable.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<!-- Ventas detalladas -->
<section class="sec" style="--c:#2A9D6E">
  <div class="sec-head"><h2>Ventas detalladas</h2><div class="sec-total">${salesTable.length} registros</div></div>
  <table>
    <thead>${headerTr(['Fecha', 'Producto', 'Cantidad', 'Pago', 'Total'])}</thead>
    <tbody>${salesTable.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic">Sin ventas</td></tr>' : salesTable.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<!-- Gastos detallados -->
<section class="sec" style="--c:#E85A4A">
  <div class="sec-head"><h2>Gastos detallados</h2><div class="sec-total">${expensesTable.length} registros</div></div>
  <table>
    <thead>${headerTr(['Fecha', 'Categoría', 'Detalle', 'Tipo', 'Monto'])}</thead>
    <tbody>${expensesTable.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic">Sin gastos</td></tr>' : expensesTable.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<!-- Mermas -->
<section class="sec" style="--c:#E8A53A">
  <div class="sec-head"><h2>Mermas valorizadas</h2><div class="sec-total">Total: <strong>${fmt(mermaCost)}</strong></div></div>
  <table>
    <thead>${headerTr(['Fecha', 'Ingrediente', 'Cantidad', 'Motivo', 'Costo'])}</thead>
    <tbody>${wasteTable.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#888;font-style:italic">Sin mermas</td></tr>' : wasteTable.map(r => `<tr>${r.map(c => `<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</section>

<footer class="footer">
  Dico · Informe generado el ${todayISO()}
</footer>

<script>setTimeout(() => window.focus(), 100);</script>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
