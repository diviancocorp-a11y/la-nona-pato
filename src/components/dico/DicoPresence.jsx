/**
 * DicoPresence — autoridad unica de presencia Native / Notice / Physical.
 *
 * Slot y avisos son vistas controladas. Ninguna de las dos decide que Dico
 * existe: solamente emiten eventos hacia esta maquina de estados.
 */
import { useCallback, useEffect, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import DicoAvisos from '../admin/platform/DicoAvisos';
import BurbujaDico from './BurbujaDico';
import DicoSlot from './DicoSlot';
import {
  DICO_PRESENCE_EVENTS,
  DICO_PRESENCE_STATES,
  reduceDicoPresence,
  visibilidadDico,
} from './dicoPresenceMachine';

const S = DICO_PRESENCE_STATES;
const E = DICO_PRESENCE_EVENTS;

function reduceMotionActivo() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function DicoPresence({
  onStateChange,
  anclaje = 'arriba',
  /**
   * La intervencion activa, o null. LA POSEE EL PRODUCTOR, no este componente.
   *
   * Es a proposito: `DicoPresence` se remonta al cruzar los 769px —en desktop
   * vive en la sidebar y en mobile en el flujo— y cualquier cosa guardada aca
   * adentro se pierde en ese salto. El productor (`PlatformAdmin`) no se
   * remonta, asi que la carga sobrevive aunque la presencia se reinicie.
   */
  intervencion = null,
  /** Nodo real al que anclar cuando la intervencion pide `target`. */
  objetivo = null,
  onIntervencionCta,
  onIntervencionCerrada,
  ...avisos
}) {
  const [estado, enviar] = useReducer(reduceDicoPresence, S.NATIVE_IDLE);
  const [reduceMotion] = useState(reduceMotionActivo);
  const visible = visibilidadDico(estado);

  const abrirAviso = useCallback(() => enviar(E.OPEN_NOTICE), []);
  const cerrarAviso = useCallback(() => enviar(E.CLOSE_NOTICE), []);
  const abrirPhysical = useCallback(() => enviar(E.OPEN_PHYSICAL), []);

  // La intervencion es la CARGA de `OPEN_PHYSICAL`: cuando el productor manda
  // una, Physical sale; cuando la retira, se guarda. La maquina sigue siendo la
  // unica autoridad de visible/hidden y sigue hablando en estados, no en datos.
  useEffect(() => {
    if (intervencion) enviar(E.OPEN_PHYSICAL);
    else enviar(E.CLOSE_PHYSICAL);
  }, [intervencion]);
  const physicalAbierto = useCallback(() => enviar(E.PHYSICAL_OPENED), []);
  const cerrarPhysical = useCallback(() => enviar(E.CLOSE_PHYSICAL), []);
  const physicalCerrado = useCallback(() => enviar(E.PHYSICAL_CLOSED), []);

  useEffect(() => {
    onStateChange?.(estado);
  }, [estado, onStateChange]);

  useEffect(() => {
    if (!reduceMotion) return;
    if (estado === S.PHYSICAL_OPENING) enviar(E.PHYSICAL_OPENED);
    if (estado === S.PHYSICAL_CLOSING) enviar(E.PHYSICAL_CLOSED);
  }, [estado, reduceMotion]);

  // Guardar a Dico con la ranura tambien cierra la intervencion: si no, el
  // productor seguiria creyendo que esta abierta y no volveria a abrirla nunca.
  const guardarPhysical = useCallback(() => {
    cerrarPhysical();
    onIntervencionCerrada?.();
  }, [cerrarPhysical, onIntervencionCerrada]);

  const escena = (
    <>
      <DicoSlot
        estado={estado}
        pose={intervencion?.pose}
        intervencionId={intervencion?.id || ''}
        onAbrir={abrirPhysical}
        onAperturaCompleta={physicalAbierto}
        onCerrar={guardarPhysical}
        onCierreCompleto={physicalCerrado}
      >
        {intervencion && (
          <div className="dico-intervencion-mensaje">
            <BurbujaDico
              key={intervencion.id}
              texto={intervencion.mensaje}
              nivel={intervencion.id === 'nada-visible' ? 'alerta' : 'sugerencia'}
              cola={intervencion.anclaje === 'target' ? 'centro' : 'lateral'}
              accion={intervencion.cta?.texto}
              onAccion={intervencion.cta ? () => onIntervencionCta?.(intervencion) : undefined}
              onCerrar={guardarPhysical}
            />
          </div>
        )}
      </DicoSlot>
    </>
  );

  return (
    <>
      {/* `target` no es una coordenada: es un nodo real del DOM que el
          objetivo publica. Physical viaja hasta ahi con un portal, asi que el
          dedo cae sobre el CTA sin que nadie mida pixeles. Si el nodo no esta,
          se queda donde vive: mejor eso que apuntar al vacio. */}
      {intervencion?.anclaje === 'target' && objetivo
        ? createPortal(<div className="dico-anclado">{escena}</div>, objetivo)
        : escena}

      {visible.native && (
        <DicoAvisos
          {...avisos}
          abierto={visible.notice}
          onAbrir={abrirAviso}
          onCerrar={cerrarAviso}
          onInvocar={abrirPhysical}
          anclaje={anclaje}
        />
      )}
    </>
  );
}
