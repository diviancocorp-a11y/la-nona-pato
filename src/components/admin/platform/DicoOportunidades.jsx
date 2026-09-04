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
 *
 * ── PASS 1: DE QUIEN ES ESTA VOZ ──
 * El bloque se rotulaba «Para mirar» y se cerraba con una X de 22px: un
 * mensaje sin autor, a diez pixeles de Dico, compitiendo con el por el mismo
 * lugar de la pantalla. La funcion no sobra —sigue siendo lo que arriba se
 * explica— pero la voz sí era ambigua.
 *
 * Ahora dice quien habla. Es Dico observando, y por eso el acento es Volt y no
 * el teal de seccion: Machine Soul define Volt como "actividad interna y
 * tecnica, nunca protagonista", que es exactamente esto — el sistema mirando
 * por su cuenta algo que nadie le pidio. El teal ademas daba 3,17:1 en el
 * boton, por debajo de AA.
 */
import { useState } from 'react';
import { oportunidadesDe } from '../../../modules/dico/oportunidades';
import './oportunidades.css';

export default function DicoOportunidades({ onIr, ...datos }) {
  const oportunidades = oportunidadesDe(datos);
  // Igual que los avisos: cerrar significa "ya lo vi", no "no me hables mas".
  // Si cambia lo que hay para decir, vuelve.
  const firma = oportunidades.map(o => o.id).join('|');
  const [cerrado, setCerrado] = useState('');

  if (oportunidades.length === 0 || cerrado === firma) return null;

  return (
    <div className="ag-oportunidades">
      <div className="ag-oportunidades-head">
        <span className="ag-oportunidades-firma">
          <span className="ag-oportunidades-punto" aria-hidden="true" />
          Dico está mirando
        </span>
        <button
          type="button"
          className="ag-oportunidades-cerrar"
          onClick={() => setCerrado(firma)}
          aria-label="Cerrar lo que Dico está mirando"
        >✕</button>
      </div>

      <div className="ag-oportunidades-lista">
        {oportunidades.map(o => (
          <div key={o.id} className="ag-card ag-oportunidad">
            <div className="ag-oportunidad-titulo">{o.titulo}</div>

            {/* La cuenta. Sin esto es una caja negra. */}
            <div className="ag-oportunidad-porque">{o.porque}</div>

            <div className="ag-oportunidad-pie">
              <div className="ag-oportunidad-hacer">{o.hacer}</div>
              {o.ir && (
                <button
                  type="button"
                  className="ag-oportunidad-ir"
                  onClick={() => onIr?.(o.ir.tab)}
                >{o.ir.texto}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
