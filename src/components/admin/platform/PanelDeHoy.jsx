/**
 * Dico hoy: dónde poner el tiempo.
 *
 * ── QUÉ ES Y QUÉ NO ──
 * No es un tablero analítico. Con siete negocios, cualquier pregunta se
 * contesta con una consulta; esto existe para otra cosa: que al abrir la
 * consola sepas a quién llamar.
 *
 * ── SÓLO LO QUE EL SISTEMA YA SABE ──
 * Ni una fila se carga a mano. No hay prospectos ni demos acá, porque esos
 * datos no tienen sistema de registro y una pantalla para tipear lo que ya
 * sabés es trabajo que no rinde. La regla, para el día que alguien quiera
 * agregarle algo: **si una fila pide que la cargues, el panel se rompió.**
 *
 * Los cálculos viven en `src/modules/panelDeHoy.js` y están testeados. Acá sólo
 * se dibuja.
 */
import { useMemo } from 'react';
import { panelDeHoy, nombreDelPrimerValor } from '../../../modules/panelDeHoy';

const C = {
  card: '#1a1a1c', line: '#2a2a2e',
  tx: '#f5f5f4', t2: '#a1a1aa', t3: '#71717a', ac: '#e8b947',
  ok: '#4ade80', warn: '#fbbf24', bad: '#f87171',
};

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;

function Cifra({ valor, pie, alerta = false }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: '13px 15px', display: 'grid', gap: 4,
    }}>
      <span style={{
        fontSize: 24, fontWeight: 700, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: alerta ? C.bad : C.tx,
      }}>
        {valor}
      </span>
      <span style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.35 }}>{pie}</span>
    </div>
  );
}

export default function PanelDeHoy({ negocios, planes, onVerNegocio }) {
  // `ahora` se congela por render: si cada fila leyera el reloj, dos filas
  // calculadas con un milisegundo de diferencia podrían decir días distintos.
  const { cifras, pendientes } = useMemo(
    () => panelDeHoy(negocios, planes, new Date()),
    [negocios, planes],
  );

  const porRubro = useMemo(() => {
    const m = {};
    for (const n of negocios || []) m[n.slug] = n.vertical;
    return m;
  }, [negocios]);

  return (
    <div style={{ display: 'grid', gap: 18 }}>

      <div style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        <Cifra valor={cifras.negocios} pie="negocios en el edificio" />
        <Cifra
          valor={cifras.llegaronAlPrimerValor}
          pie="llegaron al primer valor"
          alerta={cifras.llegaronAlPrimerValor === 0}
        />
        <Cifra
          valor={cifras.medianaAlPrimerValor === null ? '—' : `${cifras.medianaAlPrimerValor} d`}
          pie="mediana hasta el primer valor"
        />
        <Cifra
          valor={cifras.clientesPagos}
          pie="clientes pagos"
          alerta={cifras.clientesPagos === 0}
        />
        <Cifra valor={money(cifras.mrr)} pie="por mes" />
        <Cifra valor={cifras.enMora} pie="en mora" alerta={cifras.enMora > 0} />
      </div>

      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0, fontWeight: 700 }}>
          Qué resolver hoy
        </h2>

        {pendientes.length === 0 ? (
          <div style={{
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
            padding: '16px 15px', fontSize: 13, color: C.t3,
          }}>
            Nada pendiente. Con el embudo vacío eso no es una buena noticia: es
            que todavía no hay a quién atender.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {pendientes.map((p, i) => (
              <button
                key={`${p.slug}-${p.que}-${i}`}
                type="button"
                onClick={() => onVerNegocio?.(p.slug)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap',
                  background: C.card, border: `1px solid ${C.line}`,
                  borderLeft: `3px solid ${p.urgencia === 'alta' ? C.bad : C.warn}`,
                  borderRadius: 10, padding: '11px 13px',
                  font: 'inherit', color: C.tx, textAlign: 'left',
                  cursor: onVerNegocio ? 'pointer' : 'default',
                }}
              >
                <strong style={{ fontSize: 13.5, minWidth: 130 }}>{p.nombre}</strong>
                <span style={{ fontSize: 12.5, color: C.t2, flex: 1, minWidth: 200 }}>
                  {p.detalle}
                </span>
                <span style={{
                  fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: p.urgencia === 'alta' ? C.bad : C.warn, whiteSpace: 'nowrap',
                }}>
                  {p.que}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* El primer valor se llama distinto en cada rubro y no todos los que
          miran esta pantalla lo tienen presente. Se aclara acá una vez, en vez
          de repetirlo en cada fila. */}
      {pendientes.some((p) => p.que === 'sin primer valor') && (
        <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.5 }}>
          «Primer valor» es la primera operación <strong>cobrada</strong>, no el
          primer pedido cargado:{' '}
          {[...new Set(pendientes
            .filter((p) => p.que === 'sin primer valor')
            .map((p) => nombreDelPrimerValor(porRubro[p.slug])))].join(', ')}.
          Es lo que separa a un negocio que probó de uno al que le sirvió.
        </p>
      )}
    </div>
  );
}
