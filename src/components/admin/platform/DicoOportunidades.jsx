/**
 * DicoOportunidades — plata que se está yendo sin que nadie la mire (6g).
 *
 * POR QUE NO VA ADENTRO DE `DicoAvisos`
 * Son dos lecturas distintas y mezclarlas arruina las dos. Un aviso de higiene
 * se atiende y se tacha: "cargá el precio". Una oportunidad no se tacha, se
 * piensa: "estos clientes dejaron de venir". Si van juntas, o la oportunidad
 * queda tapada por lo urgente, o lo urgente se diluye entre sugerencias.
 *
 * Ademas la higiene se cierra sola cuando el negocio la arregla; esto no. Por
 * eso van en tarjetas aparte, abajo, y no suman al punto rojo de la nav.
 *
 * EL NUMERO VA A LA VISTA, NO ESCONDIDO
 * `porque` no es un tooltip ni un "ver detalle": es la linea que sigue al
 * titulo. El titulo solo ("3 clientes dejaron de venir") es una afirmacion que
 * hay que creer; con la cuenta al lado es algo que se puede verificar. El plan
 * lo dice sin vueltas: explicar no es opcional.
 */
import { useState } from 'react';
import { oportunidadesDe } from '../../../modules/dico/oportunidades';

export default function DicoOportunidades({ onIr, ...datos }) {
  const oportunidades = oportunidadesDe(datos);
  // Igual que los avisos: cerrar significa "ya lo vi", no "no me hables mas".
  // Si cambia lo que hay para decir, vuelve.
  const firma = oportunidades.map(o => o.id).join('|');
  const [cerrado, setCerrado] = useState('');

  if (oportunidades.length === 0 || cerrado === firma) return null;

  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
        padding: '0 2px',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--ag-ink-3)', flex: 1,
        }}>
          Para mirar
        </span>
        <button
          type="button"
          onClick={() => setCerrado(firma)}
          aria-label="Cerrar oportunidades"
          style={{
            width: 22, height: 22, borderRadius: 999, border: 0,
            background: 'var(--ag-bg-soft)', color: 'var(--ag-ink-3)',
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, fontSize: 11,
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {oportunidades.map(o => (
          <div
            key={o.id}
            className="ag-card"
            style={{ padding: '12px 14px', borderLeft: '3px solid var(--ag-c-prep)' }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ag-ink)' }}>
              {o.titulo}
            </div>

            {/* La cuenta. Sin esto es una caja negra. */}
            <div style={{
              fontSize: 11.5, color: 'var(--ag-ink-2)', marginTop: 4,
              lineHeight: 1.4,
            }}>
              {o.porque}
            </div>

            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 8,
            }}>
              <div style={{
                flex: 1, fontSize: 11.5, color: 'var(--ag-ink-3)', lineHeight: 1.35,
              }}>
                {o.hacer}
              </div>
              {o.ir && (
                <button
                  type="button"
                  onClick={() => onIr?.(o.ir.tab)}
                  style={{
                    padding: '5px 11px', borderRadius: 999, flexShrink: 0,
                    border: '1px solid var(--ag-c-prep)',
                    background: 'var(--ag-c-prep-soft)', color: 'var(--ag-c-prep)',
                    fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{o.ir.texto}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
