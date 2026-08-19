/**
 * PersonalPanel — el equipo hoy (Etapa 6e).
 *
 * QUE MUESTRA Y POR QUE ESE ORDEN
 * Un encargado que abre esto a las 14:00 quiere saber DOS cosas, en este
 * orden: quien esta adentro, y cuanto le esta costando. El armado de la semana
 * es otra tarea, de otro momento, y meterla en la misma pantalla haria que lo
 * urgente compita con lo importante.
 *
 * EL COSTO SE MUESTRA CONTRA LA VENTA, NO SOLO
 * "$24.000 de personal" no dice nada. "12% de lo que vendiste" si, porque es
 * un numero comparable contra ayer, contra el martes y contra el objetivo.
 *
 * FICHAR NO ES CONFIGURAR
 * El boton de entrada/salida es lo mas grande de la pantalla. Lo toca alguien
 * apurado, muchas veces desde un telefono con las manos ocupadas.
 */
import { useMemo } from 'react';

const money = (n) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(Number(n) || 0);

/** Hace cuanto entro, en palabras. Un timestamp obliga a hacer la resta. */
function haceCuanto(desde) {
  const min = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

// Como se verifico el fichaje. Importa que se distinga: `manual` no prueba
// nada, y mostrarlo igual que una passkey seria mentir sobre el dato.
const METODOS = {
  webauthn: { label: 'Verificado', tono: 'var(--ag-ok, #2e7d32)' },
  pin:      { label: 'Con código', tono: 'var(--ag-ink-3, #666)' },
  manual:   { label: 'Cargado a mano', tono: 'var(--ag-warn, #ef6c00)' },
};

export default function PersonalPanel({
  personal = [],
  fichajesAbiertos = [],
  costoLaboral = null,
  onFichar,          // (staffId, adentro) -> void
  onVerSemana,
  cargando = false,
}) {
  const adentroPorStaff = useMemo(() => {
    const m = new Map();
    for (const f of fichajesAbiertos) m.set(f.staff_id, f);
    return m;
  }, [fichajesAbiertos]);

  const { adentro, afuera } = useMemo(() => ({
    adentro: personal.filter(p => adentroPorStaff.has(p.id)),
    afuera: personal.filter(p => !adentroPorStaff.has(p.id)),
  }), [personal, adentroPorStaff]);

  const pct = costoLaboral?.costo_sobre_ventas_pct;

  return (
    <section className="cp-root" style={{ display: 'grid', gap: 18 }}>
      {/* ── Lo que cuesta el turno, contra lo que vendio ── */}
      {costoLaboral && (
        <div style={{
          display: 'flex', gap: 20, alignItems: 'baseline', flexWrap: 'wrap',
          padding: '12px 15px', borderRadius: 11,
          background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {pct == null ? '—' : `${pct}%`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ag-ink-3, #666)' }}>
              del día en personal
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ag-ink-3, #666)', lineHeight: 1.6 }}>
            {Number(costoLaboral.horas_trabajadas || 0).toFixed(1)} h trabajadas ·{' '}
            {money(costoLaboral.costo_laboral)} de costo<br />
            {/* Sin ventas todavia el porcentaje no existe, y ponerle 0 o 100
                seria inventar. Se dice que falta el dato. */}
            {Number(costoLaboral.ventas || 0) > 0
              ? <>sobre {money(costoLaboral.ventas)} vendidos</>
              : <>todavía sin ventas cargadas hoy</>}
          </div>
        </div>
      )}

      {/* ── Quien esta adentro ── */}
      <div>
        <h3 style={{ fontSize: 14, margin: '0 0 10px', fontWeight: 650 }}>
          Trabajando ahora ({adentro.length})
        </h3>
        {adentro.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ag-ink-3, #666)' }}>
            No hay nadie fichado.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {adentro.map(p => {
              const f = adentroPorStaff.get(p.id);
              const m = METODOS[f?.method] || METODOS.manual;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 13px', borderRadius: 10,
                  background: 'var(--ag-surface-2, rgba(0,0,0,0.03))',
                  border: '1px solid var(--ag-line, rgba(0,0,0,0.08))',
                }}>
                  <span aria-hidden="true" style={{
                    width: 9, height: 9, borderRadius: '50%',
                    background: 'var(--ag-ok, #2e7d32)', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ag-ink-3, #666)' }}>
                      {p.job ? `${p.job} · ` : ''}entró {haceCuanto(f.clock_in_at)}
                      {' · '}
                      <span style={{ color: m.tono }}>{m.label}</span>
                    </div>
                  </div>
                  <button
                    type="button" disabled={cargando}
                    onClick={() => onFichar?.(p.id, true)}
                    style={{
                      padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                      font: 'inherit', fontSize: 13.5, fontWeight: 600,
                      border: '1px solid var(--ag-line, rgba(0,0,0,0.15))',
                      background: 'transparent', color: 'inherit',
                    }}
                  >
                    Marcar salida
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Quien puede entrar ── */}
      {afuera.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, margin: '0 0 10px', fontWeight: 650 }}>
            Fuera de turno ({afuera.length})
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {afuera.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 13px', borderRadius: 10,
                border: '1px solid var(--ag-line, rgba(0,0,0,0.08))',
              }}>
                <span aria-hidden="true" style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: 'var(--ag-line, rgba(0,0,0,0.18))', flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{p.name}</div>
                  {p.job && (
                    <div style={{ fontSize: 12, color: 'var(--ag-ink-3, #666)' }}>{p.job}</div>
                  )}
                </div>
                <button
                  type="button" disabled={cargando}
                  onClick={() => onFichar?.(p.id, false)}
                  style={{
                    padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
                    font: 'inherit', fontSize: 13.5, fontWeight: 650, border: 'none',
                    background: 'var(--ag-accent, #e8b947)', color: '#1a1a1a',
                  }}
                >
                  Marcar entrada
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {personal.length === 0 && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ag-ink-3, #666)' }}>
          Todavía no cargaste a nadie en el equipo.
        </p>
      )}

      {onVerSemana && personal.length > 0 && (
        <button
          type="button" onClick={onVerSemana}
          style={{
            padding: '11px', borderRadius: 10, cursor: 'pointer', font: 'inherit',
            border: '1px solid var(--ag-line, rgba(0,0,0,0.15))',
            background: 'transparent', color: 'inherit',
          }}
        >
          Armar la semana
        </button>
      )}
    </section>
  );
}
