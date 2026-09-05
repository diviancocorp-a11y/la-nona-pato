/**
 * PantallaDeCobro — cobrar una cuenta (Etapa 6d).
 *
 * LA DECISION DE DISENO
 * `CajaPanel` explica que la caja tiene dos momentos con necesidades opuestas:
 * el arqueo pasa dos veces por dia y es ceremonial, el cobro pasa doscientas y
 * se mide en segundos. Esta pantalla es el segundo caso, asi que NO tiene tira
 * de papel ni monoespaciada decorativa: tiene el numero que falta en grande y
 * los medios de pago como botones que se aciertan sin mirar.
 *
 * EL CAMINO DE UN TOQUE
 * El 90% de los cobros son "todo junto, con un solo medio". Por eso el monto
 * viene cargado con el saldo completo y alcanza con tocar el medio y cobrar.
 * Dividir la cuenta es escribir un monto menor: no hay modo aparte, porque un
 * modo aparte se elige mal justo cuando hay gente esperando.
 *
 * EL VUELTO NO SE REGISTRA
 * En efectivo se puede escribir con cuanto paga el cliente para ver el vuelto,
 * pero lo que se asienta es lo COBRADO, no lo entregado. Guardar los 10000 de
 * un billete por una cuenta de 6500 haria que la caja esperara 3500 de mas y
 * el arqueo diera faltante todos los dias.
 *
 * COBRAR Y CERRAR LA CUENTA SON DOS COSAS
 * `register_payment` (0046) no toca el estado del pedido, y esta bien: la
 * cuenta puede quedar saldada mientras la gente sigue sentada en la mesa. El
 * pedido se completa cuando alguien lo dice, no cuando entra el ultimo peso.
 */
import { useState, useEffect, useCallback, useId } from 'react';
import Dialog from '../../ui/Dialog';
import {
  fetchMediosDePago, saldoDelPedido, fetchPagosDePedido, cobrar,
} from '../../../services/platformCaja';

const money = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

// Un icono por familia de medio. Ayuda a acertar el boton de reojo, que es
// como se toca cuando hay cola.
const ICONO = {
  cash: '\u{1F4B5}', card: '\u{1F4B3}', mp: '\u{1F4F1}',
  transfer: '\u{1F3E6}', account: '\u{1F4D2}', other: '•',
};

export default function PantallaDeCobro({
  tenantId,
  pedido,
  hayTurnoAbierto = true,
  onCerrar,
  onCobrado,        // se llama despues de cada cobro: refresca la caja de afuera
  onCompletar,      // cerrar la cuenta (pasa el pedido a completado)
}) {
  const tituloId = useId();
  const [medios, setMedios] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [metodo, setMetodo] = useState(null);
  const [monto, setMonto] = useState('');
  const [entregado, setEntregado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const orderId = pedido?.id;

  const recargar = useCallback(async () => {
    if (!orderId) return;
    const [ps, s] = await Promise.all([
      fetchPagosDePedido(orderId),
      saldoDelPedido(orderId),
    ]);
    setPagos(ps);
    setSaldo(s);
    // El monto se recarga con lo que falta: despues de un pago parcial, el
    // siguiente cobro casi siempre es el resto.
    setMonto(s > 0 ? String(s) : '');
    setEntregado('');
  }, [orderId]);

  useEffect(() => {
    if (!tenantId) return;
    fetchMediosDePago(tenantId).then((ms) => {
      setMedios(ms);
      // Un solo medio no es una eleccion: se preselecciona.
      if (ms.length === 1) setMetodo(ms[0].id);
    });
  }, [tenantId]);

  useEffect(() => { recargar(); }, [recargar]);

  const medioSel = medios.find(m => m.id === metodo) || null;
  const esEfectivo = medioSel?.kind === 'cash';
  const montoNum = Number(String(monto).replace(',', '.')) || 0;
  const vuelto = esEfectivo && entregado !== ''
    ? (Number(String(entregado).replace(',', '.')) || 0) - montoNum
    : null;
  const saldado = saldo !== null && saldo <= 0;
  // Techo del cobro. El tope de verdad esta en `register_payment` (0063) —lo
  // que se puede llamar por API es la RPC, no esta pantalla—; aca es para que
  // el cajero vea el error ANTES de mandar, no despues. El centavo de
  // tolerancia es el mismo de la funcion: el total puede venir de una suma
  // redondeada y rechazar por $0,004 seria rechazar un cobro correcto.
  const excedeSaldo = saldo !== null && montoNum > saldo + 0.01;
  const puedeCobrar = !!metodo && montoNum > 0 && !excedeSaldo && !enviando;

  const confirmar = useCallback(async () => {
    if (!puedeCobrar) return;
    setEnviando(true);
    setError(null);
    // Se manda el monto COBRADO. Lo entregado por el cliente solo sirvio para
    // calcular el vuelto en pantalla.
    const r = await cobrar(tenantId, orderId, metodo, montoNum);
    setEnviando(false);
    if (r.__error) { setError(r.message); return; }
    await recargar();
    onCobrado?.();
  }, [puedeCobrar, tenantId, orderId, metodo, montoNum, recargar, onCobrado]);

  if (!pedido) return null;

  const input = {
    width: '100%', padding: '13px 14px', borderRadius: 10, fontSize: 20,
    fontWeight: 650, fontVariantNumeric: 'tabular-nums',
    background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
    border: '1px solid var(--ag-line, rgba(0,0,0,0.15))',
    color: 'inherit', boxSizing: 'border-box',
  };

  return (
    <Dialog
      open
      onClose={onCerrar}
      // aria-label y no aria-labelledby: el contrato de QA Lite localiza este
      // dialogo por `[role="dialog"][aria-label^="Cobrar el pedido"]`
      // (e2e/qa-lite/surfaces.ts). Cambiarlo por el titulo visible romperia el
      // gate sin ganar nada: el nombre accesible es el mismo texto.
      label={`Cobrar el pedido ${pedido.code || ''}`}
      describedBy={tituloId}
      variante="sheet"
      className="ag-cobro"
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div id={tituloId} style={{ fontSize: 16, fontWeight: 700 }}>
              Cobrar {pedido.code ? `#${pedido.code}` : ''}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ag-ink-3, #666)' }}>
              {pedido.customer_name || 'Sin nombre'}
            </div>
          </div>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            style={{
              border: 'none', background: 'transparent', font: 'inherit',
              fontSize: 22, cursor: 'pointer', color: 'inherit', lineHeight: 1,
            }}
          >
            {'×'}
          </button>
        </header>

        {/* Sin turno abierto el cobro entra igual, pero no cae en ningun arqueo:
            aparece como faltante al cerrar. Se avisa antes, no despues. */}
        {!hayTurnoAbierto && (
          <div style={{
            fontSize: 12.5, padding: '9px 11px', borderRadius: 8,
            background: 'var(--ag-warn-bg, #FFF3E0)', color: 'var(--ag-warn, #B15A00)',
          }}>
            La caja está cerrada. Podés cobrar igual, pero este pago no va a
            entrar en el arqueo de ningún turno.
          </div>
        )}

        <div style={{
          display: 'grid', gap: 4, padding: '13px 15px', borderRadius: 12,
          background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
            <span>Total</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(pedido.total)}</span>
          </div>
          {pagos.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 13.5,
              color: 'var(--ag-ink-3, #666)',
            }}>
              <span>Ya pagado</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {money(pagos.reduce((a, p) => a + Number(p.amount || 0), 0))}
              </span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginTop: 6, paddingTop: 8,
            borderTop: '1px dashed var(--ag-line, rgba(0,0,0,0.2))',
          }}>
            <span style={{ fontSize: 14, fontWeight: 650 }}>
              {saldado ? 'Cuenta saldada' : 'Falta'}
            </span>
            <span style={{
              fontSize: 26, fontWeight: 750, fontVariantNumeric: 'tabular-nums',
              color: saldado ? 'var(--ag-ok, #2e7d32)' : 'inherit',
            }}>
              {saldo === null ? '—' : saldado ? '✓' : money(saldo)}
            </span>
          </div>
        </div>

        {pagos.length > 0 && (
          <div style={{ display: 'grid', gap: 5 }}>
            {pagos.map((p) => {
              const m = medios.find(x => x.id === p.method_id);
              return (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 12.5,
                  color: 'var(--ag-ink-3, #666)',
                }}>
                  <span>{ICONO[m?.kind] || ICONO.other} {m?.name || 'Pago'}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(p.amount)}</span>
                </div>
              );
            })}
          </div>
        )}

        {!saldado && (
          <>
            <div>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
                ¿Con qué paga?
              </span>
              {medios.length === 0 ? (
                <div style={{
                  fontSize: 12.5, padding: '9px 11px', borderRadius: 8,
                  background: 'var(--ag-warn-bg, #FFF3E0)', color: 'var(--ag-warn, #B15A00)',
                }}>
                  Este negocio no tiene medios de pago cargados, así que no se
                  puede cobrar todavía.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {medios.map((m) => (
                    <button
                      key={m.id} type="button" onClick={() => setMetodo(m.id)}
                      aria-pressed={metodo === m.id}
                      style={{
                        flex: '1 1 30%', minWidth: 104, padding: '13px 10px',
                        borderRadius: 11, font: 'inherit', fontSize: 14,
                        fontWeight: metodo === m.id ? 700 : 500, cursor: 'pointer',
                        border: metodo === m.id
                          ? '2px solid var(--ag-accent-border, #9a6b00)'
                          : '1px solid var(--ag-line, rgba(0,0,0,0.15))',
                        background: metodo === m.id
                          ? 'var(--ag-accent-soft, rgba(232,185,71,0.16))'
                          : 'transparent',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 19 }}>
                        {ICONO[m.kind] || ICONO.other}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                ¿Cuánto cobrás?
              </span>
              <input
                style={input} inputMode="decimal" value={monto}
                onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ''))}
              />
              <span style={{
                display: 'block', marginTop: 5, fontSize: 12.5,
                color: excedeSaldo ? 'var(--ag-bad, #c62828)' : 'var(--ag-ink-3, #666)',
              }}>
                {excedeSaldo
                  ? `No se puede cobrar más que lo que falta (${money(saldo)}).`
                  : 'Viene con lo que falta. Poné menos para dividir la cuenta.'}
              </span>
            </label>

            {esEfectivo && (
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  ¿Con cuánto paga?{' '}
                  <span style={{ fontWeight: 400, color: 'var(--ag-ink-3, #666)' }}>(opcional)</span>
                </span>
                <input
                  style={{ ...input, fontSize: 17 }} inputMode="decimal" value={entregado}
                  onChange={(e) => setEntregado(e.target.value.replace(/[^\d.,]/g, ''))}
                  placeholder="Para calcular el vuelto"
                />
                {vuelto !== null && (
                  <span style={{
                    display: 'block', marginTop: 7, fontSize: 15, fontWeight: 650,
                    color: vuelto < 0 ? 'var(--ag-bad, #c62828)' : 'inherit',
                  }}>
                    {vuelto < 0
                      ? `Faltan ${money(Math.abs(vuelto))}`
                      : `Vuelto ${money(vuelto)}`}
                  </span>
                )}
              </label>
            )}

            {error && (
              <div style={{ fontSize: 13, color: 'var(--ag-bad, #c62828)' }}>{error}</div>
            )}

            <button
              type="button" onClick={confirmar} disabled={!puedeCobrar}
              style={{
                padding: '15px', borderRadius: 11, font: 'inherit', fontSize: 16,
                fontWeight: 700, border: 'none',
                cursor: puedeCobrar ? 'pointer' : 'not-allowed',
                opacity: puedeCobrar ? 1 : 0.5,
                background: 'var(--ag-accent, #e8b947)', color: '#1a1a1a',
              }}
            >
              {enviando ? 'Cobrando…' : `Cobrar ${money(montoNum)}`}
            </button>
          </>
        )}

        {saldado && (
          <button
            type="button"
            onClick={() => { onCompletar?.(pedido); onCerrar?.(); }}
            style={{
              padding: '15px', borderRadius: 11, font: 'inherit', fontSize: 16,
              fontWeight: 700, border: 'none', cursor: 'pointer',
              background: 'var(--ag-ok, #2e7d32)', color: '#fff',
            }}
          >
            Cerrar la cuenta
          </button>
        )}
      </div>
    </Dialog>
  );
}
