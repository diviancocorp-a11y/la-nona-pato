/**
 * DicoAvisos — presencia Native persistente + avisos bajo demanda.
 *
 * Dico ya no desaparece cuando se cierra la burbuja. El personaje vive como
 * presencia estable del sistema y el mensaje se abre solo cuando el usuario
 * decide mirarlo. Presence y Message son estados distintos.
 */
import { useEffect, useRef, useState } from 'react';
import { avisosDe } from '../../../modules/dico/reglas';
import DicoCara from '../../dico/DicoCara';
import BurbujaDico from '../../dico/BurbujaDico';

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

export default function DicoAvisos({
  abierto = false,
  onAbrir,
  onCerrar,
  onIr,
  omitir = [],
  ...datos
}) {
  const idsOmitidos = new Set(omitir);
  const avisos = avisosDe(datos).filter(aviso => !idsOmitidos.has(aviso.id));
  const firma = avisos.map(a => a.id).join('|');
  const [pagina, setPagina] = useState({ firma: '', indice: 0 });
  const [entrada] = useState(esPrimeraEntrada);
  const firmaAnterior = useRef(firma);

  const indice = pagina.firma === firma
    ? Math.min(pagina.indice, Math.max(avisos.length - 1, 0))
    : 0;
  const actual = avisos[indice];
  const tieneAvisos = avisos.length > 0;
  const estado = actual
    ? (CARA_POR_NIVEL[actual.nivel] || 'idle')
    : (datos.listo === false ? 'esperando' : 'idle');

  useEffect(() => {
    if (!entrada) return;
    try { localStorage.setItem(CLAVE_PRIMERA_ENTRADA, '1'); } catch { /* sin storage */ }
  }, [entrada]);

  useEffect(() => {
    if (firmaAnterior.current === firma) return;
    firmaAnterior.current = firma;
    setPagina({ firma, indice: 0 });
    onCerrar?.();
  }, [firma, onCerrar]);

  const personaje = (
    <DicoCara
      size={36}
      estado={estado}
      lookX={abierto ? 0.55 : 0}
      entrada={entrada}
      title={tieneAvisos
        ? `Dico: ${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}`
        : 'Dico'}
    />
  );

  return (
    <div className={`dico-avisos${abierto ? ' dico-avisos--abierto' : ''}`}>
      {abierto && actual && (
        <div className="dico-avisos-mensaje">
          <BurbujaDico
            key={`${firma}:${indice}`}
            texto={`${actual.titulo}. ${actual.detalle}`}
            nivel={actual.nivel}
            cola="centro"
            accion={actual.ir?.texto}
            onAccion={actual.ir ? () => onIr?.(actual.ir.tab) : undefined}
            restantes={avisos.length - indice - 1}
            onSiguiente={() => setPagina({ firma, indice: indice + 1 })}
            onCerrar={onCerrar}
          />
        </div>
      )}

      <div className="dico-avisos-presencia">
        {tieneAvisos ? (
          <button
            type="button"
            className="dico-avisos-trigger"
            onClick={abierto ? onCerrar : onAbrir}
            aria-expanded={abierto}
            aria-label={abierto
              ? 'Cerrar avisos de Dico'
              : `Abrir ${avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`} de Dico`}
          >
            {personaje}
            <span className="dico-avisos-badge" aria-hidden="true">{avisos.length}</span>
          </button>
        ) : (
          <span className="dico-avisos-idle">{personaje}</span>
        )}
      </div>
    </div>
  );
}
