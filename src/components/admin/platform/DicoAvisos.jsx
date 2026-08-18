/**
 * DicoAvisos — lo que Dico tiene para decir hoy. Capa 2 del PLAN-DICO.
 *
 * Presentacion pura: toda la logica vive en `modules/dico/reglas.js`, que son
 * funciones puras y testeables sin React ni base.
 *
 * El personaje entro el 18/ago: `DicoCara` en SVG (capa 1 del PLAN-DICO). La
 * expresion sale del nivel del aviso mas grave — si hay algo roto Dico esta
 * preocupado, si solo hay sugerencias esta esperando. No es decoracion: es la
 * misma informacion que el color, para el que no distingue el naranja del
 * verde.
 *
 * Se puede cerrar, y eso importa: un panel que te reta y no se puede callar
 * se deja de mirar. Vuelve solo cuando cambia lo que tiene para decir.
 */
import { useState } from 'react';
import { avisosDe } from '../../../modules/dico/reglas';
import DicoCara from '../../dico/DicoCara';

// Que cara pone segun lo mas grave que tenga para decir.
const CARA_POR_NIVEL = {
  alerta: 'preocupado',
  aviso: 'pregunta',
  sugerencia: 'esperando',
};

const COLOR = {
  alerta: { fg: 'var(--ag-c-orders)', bg: 'var(--ag-c-orders-soft)' },
  aviso: { fg: 'var(--ag-c-terra)', bg: 'rgba(245,158,11,0.10)' },
  sugerencia: { fg: 'var(--ag-c-prep)', bg: 'var(--ag-c-prep-soft)' },
};

export default function DicoAvisos({ onIr, ...datos }) {
  const avisos = avisosDe(datos);
  // La firma de lo que se esta diciendo. Si cambia, el cartel vuelve aunque
  // lo hayas cerrado: cerrar significa "ya lo vi", no "no me hables nunca".
  const firma = avisos.map(a => a.id).join('|');
  const [cerrado, setCerrado] = useState('');

  if (avisos.length === 0 || cerrado === firma) return null;

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div className="ag-card" style={{ padding: '12px 14px', borderTop: `3px solid ${COLOR[avisos[0].nivel].fg}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <DicoCara
            size={30}
            estado={CARA_POR_NIVEL[avisos[0].nivel] || 'idle'}
            title={`Dico: ${avisos.length} ${avisos.length === 1 ? 'cosa para mirar' : 'cosas para mirar'}`}
          />
          <div style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ag-ink-3)' }}>
            Dico
          </div>
          <button
            type="button"
            onClick={() => setCerrado(firma)}
            aria-label="Cerrar avisos"
            style={{
              width: 24, height: 24, borderRadius: 999, border: 0,
              background: 'var(--ag-bg-soft)', color: 'var(--ag-ink-3)',
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {avisos.map((a, i) => {
            const c = COLOR[a.nivel];
            return (
              <div key={a.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--ag-line)', paddingTop: i === 0 ? 0 : 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    marginTop: 5, width: 7, height: 7, borderRadius: 999,
                    background: c.fg, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-ink)' }}>{a.titulo}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ag-ink-3)', marginTop: 2, lineHeight: 1.35 }}>{a.detalle}</div>
                  </div>
                  {a.ir && (
                    <button
                      type="button"
                      onClick={() => onIr?.(a.ir.tab)}
                      style={{
                        padding: '5px 11px', borderRadius: 999, flexShrink: 0,
                        border: `1px solid ${c.fg}`, background: c.bg, color: c.fg,
                        fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >{a.ir.texto}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
