/**
 * DicoPresence — autoridad unica de presencia Native / Notice / Physical.
 *
 * Slot y avisos son vistas controladas. Ninguna de las dos decide que Dico
 * existe: solamente emiten eventos hacia esta maquina de estados.
 */
import { useCallback, useEffect, useReducer, useState } from 'react';
import DicoAvisos from '../admin/platform/DicoAvisos';
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

export default function DicoPresence({ onStateChange, ...avisos }) {
  const [estado, enviar] = useReducer(reduceDicoPresence, S.NATIVE_IDLE);
  const [reduceMotion] = useState(reduceMotionActivo);
  const visible = visibilidadDico(estado);

  const abrirAviso = useCallback(() => enviar(E.OPEN_NOTICE), []);
  const cerrarAviso = useCallback(() => enviar(E.CLOSE_NOTICE), []);
  const abrirPhysical = useCallback(() => enviar(E.OPEN_PHYSICAL), []);
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

  return (
    <>
      <DicoSlot
        estado={estado}
        onAbrir={abrirPhysical}
        onAperturaCompleta={physicalAbierto}
        onCerrar={cerrarPhysical}
        onCierreCompleto={physicalCerrado}
      />

      {visible.native && (
        <DicoAvisos
          {...avisos}
          abierto={visible.notice}
          onAbrir={abrirAviso}
          onCerrar={cerrarAviso}
          onInvocar={abrirPhysical}
        />
      )}
    </>
  );
}
