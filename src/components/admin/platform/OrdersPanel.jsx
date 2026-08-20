/**
 * OrdersPanel — pedidos del edificio.
 *
 * Version minima y honesta: listar, ver el detalle y mover el estado. NO hay
 * descuento de stock ni registro de venta como en el legacy (useOrderWorkflow),
 * porque el edificio todavia no tiene ni ingredientes ni modelo de costos.
 * Cuando existan, este panel es el lugar donde se enganchan.
 */
import { useState } from 'react';
import { useConfirm } from '../../ConfirmSlideProvider';
import {
  PlatformOrderStatus, OPEN_ORDER_STATUSES, nextOrderStatus, fetchOrderItems,
} from '../../../services/platformAdmin';
import PantallaDeCobro from './PantallaDeCobro';
import { vePrecios } from '../../../modules/roles';

const LABELS = {
  [PlatformOrderStatus.PENDING_PAYMENT]: 'Esperando pago',
  [PlatformOrderStatus.NEW]: 'Nuevo',
  [PlatformOrderStatus.PREPARING]: 'En preparación',
  [PlatformOrderStatus.ACTIVE]: 'Listo',
  [PlatformOrderStatus.COMPLETED]: 'Completado',
  [PlatformOrderStatus.CANCELLED]: 'Cancelado',
};

const COLORS = {
  [PlatformOrderStatus.PENDING_PAYMENT]: { bg: '#FFF3E0', tx: '#B15A00' },
  [PlatformOrderStatus.NEW]: { bg: '#E3F2FD', tx: '#1565C0' },
  [PlatformOrderStatus.PREPARING]: { bg: '#FFF8E1', tx: '#8D6E00' },
  [PlatformOrderStatus.ACTIVE]: { bg: '#E8F5E9', tx: '#3A7D44' },
  [PlatformOrderStatus.COMPLETED]: { bg: '#F3EDE4', tx: '#9C8B7A' },
  [PlatformOrderStatus.CANCELLED]: { bg: '#FFEBEE', tx: '#C62828' },
};

// Que dice el boton que lleva al estado siguiente.
const ADVANCE_LABEL = {
  [PlatformOrderStatus.PENDING_PAYMENT]: 'Marcar pagado',
  [PlatformOrderStatus.NEW]: 'Preparar',
  [PlatformOrderStatus.PREPARING]: 'Listo',
  [PlatformOrderStatus.ACTIVE]: 'Completar',
};

function money(n) {
  return `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function when(ts) {
  if (!ts) return '';
  // Postgres puede mandar "2026-08-15 10:27:15+00" (espacio en vez de T), que
  // en algunos browsers parsea NaN. Mismo fix que useAdminData.
  const norm = typeof ts === 'string' && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
  const d = new Date(norm);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusChip({ status }) {
  const c = COLORS[status] || COLORS[PlatformOrderStatus.NEW];
  return (
    <span style={{
      fontSize: 11, padding: '3px 9px', borderRadius: 999,
      background: c.bg, color: c.tx, whiteSpace: 'nowrap',
    }}>
      {LABELS[status] || status}
    </span>
  );
}

function OrderCard({ order, onAdvance, onCancel, onCobrar, conImportes = true }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const next = nextOrderStatus(order.status);
  const puedeCobrar = !!onCobrar && OPEN_ORDER_STATUSES.includes(order.status);

  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (opening && items === null) setItems(await fetchOrderItems(order.id));
  };

  return (
    <article style={{
      background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)',
      borderRadius: 12, padding: '11px 13px',
    }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 0, padding: 0, cursor: 'pointer',
          font: 'inherit', color: 'inherit', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, color: 'var(--ag-ink)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {order.customer_name || 'Sin nombre'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ag-ink-3)', marginTop: 2 }}>
            {when(order.created_at)} · {order.delivery === 'envio' ? 'Envío' : 'Retiro'}
            {conImportes && <> · {order.payment}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {/* La cocina no ve importes (nota 1 de la matriz de 6f): prepara, no
              cobra, y el margen no tiene por que pasar por ahi. */}
          {conImportes && (
            <div style={{ fontSize: 14, color: 'var(--ag-ink)' }}>{money(order.total)}</div>
          )}
          <div style={{ marginTop: 3 }}><StatusChip status={order.status} /></div>
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--ag-line)' }}>
          {items === null && <p style={{ fontSize: 12, color: 'var(--ag-ink-3)', margin: 0 }}>Cargando ítems...</p>}
          {items?.length === 0 && <p style={{ fontSize: 12, color: 'var(--ag-ink-3)', margin: 0 }}>Sin ítems.</p>}
          {items?.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ag-ink-2)', marginBottom: 4 }}>
              <span>{it.qty}× {it.name_snapshot || 'Producto'}</span>
              {conImportes && <span>{money(it.subtotal ?? it.unit_price * it.qty)}</span>}
            </div>
          ))}

          <dl style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ag-ink-3)' }}>
            {order.customer_phone && <Line label="Teléfono" value={order.customer_phone} />}
            {order.delivery === 'envio' && order.delivery_address && <Line label="Dirección" value={order.delivery_address} />}
            {conImportes && Number(order.delivery_cost) > 0 && <Line label="Envío" value={money(order.delivery_cost)} />}
            {conImportes && Number(order.discount) > 0 && <Line label="Descuento" value={`- ${money(order.discount)}`} />}
            {conImportes && Number(order.tip_amount) > 0 && <Line label="Propina" value={money(order.tip_amount)} />}
            {order.note && <Line label="Nota" value={order.note} />}
            {order.is_gift && <Line label="Regalo" value={order.gift_note || 'Sí'} />}
          </dl>

          {/* Cobrar va PRIMERO y en toda la fila: es la accion que se busca en
              esta tarjeta cuando el pedido esta en curso. Avanzar de estado es
              frecuente; cobrar es lo que cierra la plata del dia. */}
          {puedeCobrar && (
            <button
              type="button" className="ag-btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              onClick={() => onCobrar(order)}
            >
              Cobrar {money(order.total)}
            </button>
          )}

          {(next || order.status !== PlatformOrderStatus.CANCELLED) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {next && (
                <button
                  type="button"
                  // Con el cobro presente, avanzar de estado baja a secundario:
                  // dos botones llenos uno encima del otro no dicen cual es el
                  // que importa.
                  className={puedeCobrar ? 'ag-btn-ghost' : 'ag-btn-primary'}
                  style={{ flex: 1 }}
                  onClick={() => onAdvance(order, next)}
                >
                  {ADVANCE_LABEL[order.status]}
                </button>
              )}
              {/* "Preparar y marcar listo; no cobra ni anula" (nota 2 de la
                  matriz de 6f). Anular un pedido es una decision de plata. */}
              {conImportes
                && order.status !== PlatformOrderStatus.COMPLETED
                && order.status !== PlatformOrderStatus.CANCELLED && (
                <button type="button" className="ag-btn-ghost" onClick={() => onCancel(order)}>
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
      <dt style={{ flexShrink: 0 }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--ag-ink-2)', textAlign: 'right' }}>{value}</dd>
    </div>
  );
}

export default function OrdersPanel({
  orders, loading, onSetStatus, showToast,
  // Cobrar es opcional: sin `tenantId` el panel se comporta como antes. Asi el
  // catalogo de un negocio que todavia no usa caja no muestra un boton que no
  // lleva a ningun lado.
  tenantId = null, hayTurnoAbierto = true, onCobrado,
  // 6f: sin roles se comporta como antes (todo visible). El recorte es de
  // pantalla; lo que de verdad protege los datos son las policies de 0050.
  roles = null,
}) {
  const confirmSlide = useConfirm();
  const [cobrando, setCobrando] = useState(null);
  const conImportes = roles === null ? true : vePrecios(roles);

  const openOrders = orders.filter(o => OPEN_ORDER_STATUSES.includes(o.status));
  const closedOrders = orders.filter(o => !OPEN_ORDER_STATUSES.includes(o.status));

  const advance = async (order, next) => {
    const res = await onSetStatus(order.id, next);
    if (res?.__error) { showToast?.(res.message || 'No se pudo actualizar'); return; }
    showToast?.(`Pedido → ${LABELS[next]}`);
  };

  const cancel = async (order) => {
    const ok = await confirmSlide({
      title: 'Cancelar pedido',
      body: `El pedido de ${order.customer_name || 'este cliente'} queda como cancelado.`,
      label: 'Deslizá para cancelar',
    });
    if (!ok) return;
    const res = await onSetStatus(order.id, PlatformOrderStatus.CANCELLED);
    if (res?.__error) { showToast?.(res.message || 'No se pudo cancelar'); return; }
    showToast?.('Pedido cancelado');
  };

  // Cerrar la cuenta desde el cobro es el mismo camino que "Completar": un solo
  // lugar decide como se completa un pedido.
  const completar = (order) => advance(order, PlatformOrderStatus.COMPLETED);

  // En flujo, no `ag-page-over`: esa clase es un overlay full-screen que
  // esconde el topbar y el bottom nav (ver la nota en ProductsPanel).
  return (
    <div style={{ padding: '12px 16px 6px', position: 'relative', zIndex: 2 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18,
          margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em',
        }}>Pedidos</h2>
      </div>

      <div>
        {loading && <p style={{ color: 'var(--ag-ink-3)', fontSize: 13, textAlign: 'center' }}>Cargando...</p>}

        {!loading && orders.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '28px 20px',
            background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)', borderRadius: 14,
          }}>
            <div style={{ fontSize: 15, color: 'var(--ag-ink)', marginBottom: 6 }}>Todavía no entró ningún pedido</div>
            <div style={{ fontSize: 13, color: 'var(--ag-ink-3)' }}>
              Cuando alguien compre en tu catálogo, aparece acá.
            </div>
          </div>
        )}

        {openOrders.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ag-ink-3)', margin: '0 0 8px 2px' }}>
              En curso <span style={{ opacity: .6 }}>· {openOrders.length}</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openOrders.map(o => (
                <OrderCard
                  key={o.id} order={o} onAdvance={advance} onCancel={cancel}
                  conImportes={conImportes}
                  onCobrar={tenantId && conImportes ? setCobrando : null}
                />
              ))}
            </div>
          </section>
        )}

        {closedOrders.length > 0 && (
          <section>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ag-ink-3)', margin: '0 0 8px 2px' }}>
              Cerrados <span style={{ opacity: .6 }}>· {closedOrders.length}</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {closedOrders.map(o => (
                <OrderCard
                  key={o.id} order={o} onAdvance={advance} onCancel={cancel}
                  conImportes={conImportes}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {cobrando && (
        <PantallaDeCobro
          tenantId={tenantId}
          pedido={cobrando}
          hayTurnoAbierto={hayTurnoAbierto}
          onCerrar={() => setCobrando(null)}
          onCobrado={onCobrado}
          onCompletar={completar}
        />
      )}
    </div>
  );
}
