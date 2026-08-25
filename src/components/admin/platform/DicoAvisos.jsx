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
 * Un aviso por vez: cuatro globos juntos vuelven a Dico una lista decorada.
 * Se puede avanzar y cerrar. Cerrar significa "ya lo vi": si cambia la firma
 * de los avisos, Dico vuelve con lo nuevo.
 */
import { useEffect, useState } from 'react';
import { avisosDe } from '../../../modules/dico/reglas';
import DicoCara from '../../dico/DicoCara';
import BurbujaDico from '../../dico/BurbujaDico';

// Que cara pone segun lo mas grave que tenga para decir.
const CARA_POR_NIVEL = {
  alerta: 'preocupado',
  aviso: 'pregunta',
  sugerencia: 'esperando',
};

const CLAVE_PRIMERA_ENTRADA = 'dico:primera-entrada:v1';

function esPrimeraEntrada() {
  try {
    return localStorage.getItem(CLAVE_PRIMERA_ENTRADA) !== '1';
  } catch {
    return false;
  }
}

export default function DicoAvisos({ onIr, omitir = [], ...datos }) {
  const idsOmitidos = new Set(omitir);
  const avisos = avisosDe(datos).filter(aviso => !idsOmitidos.has(aviso.id));
  // La firma de lo que se esta diciendo. Si cambia, el cartel vuelve aunque
  // lo hayas cerrado: cerrar significa "ya lo vi", no "no me hables nunca".
  const firma = avisos.map(a => a.id).join('|');
  const [cerrado, setCerrado] = useState('');
  const [pagina, setPagina] = useState({ firma: '', indice: 0 });
  const [entrada] = useState(esPrimeraEntrada);

  const indice = pagina.firma === firma
    ? Math.min(pagina.indice, Math.max(avisos.length - 1, 0))
    : 0;
  const actual = avisos[indice];

  useEffect(() => {
    if (!entrada || avisos.length === 0) return;
    try { localStorage.setItem(CLAVE_PRIMERA_ENTRADA, '1'); } catch { /* sin storage */ }
  }, [entrada, avisos.length]);

  if (avisos.length === 0 || cerrado === firma) return null;

  return (
    <div className="dico-avisos">
      <div className="dico-avisos-contenido">
        <div className="dico-avisos-personaje">
          <DicoCara
            size={82}
            estado={CARA_POR_NIVEL[actual.nivel] || 'idle'}
            entrada={entrada}
            title={`Dico: ${avisos.length} ${avisos.length === 1 ? 'cosa para mirar' : 'cosas para mirar'}`}
          />
        </div>
        <BurbujaDico
          key={`${firma}:${indice}`}
          texto={`${actual.titulo}. ${actual.detalle}`}
          nivel={actual.nivel}
          accion={actual.ir?.texto}
          onAccion={actual.ir ? () => onIr?.(actual.ir.tab) : undefined}
          restantes={avisos.length - indice - 1}
          onSiguiente={() => setPagina({ firma, indice: indice + 1 })}
          onCerrar={() => setCerrado(firma)}
        />
      </div>
    </div>
  );
}
