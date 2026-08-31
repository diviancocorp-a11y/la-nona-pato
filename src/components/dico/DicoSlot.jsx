/**
 * DicoSlot — frontera entre Native y Physical.
 *
 * El Slot no abre ni cierra los avisos. Su unica responsabilidad es traer a
 * Dico Physical al plano de la interfaz y devolverlo a la maquina.
 */
import { useState } from 'react';
import CaraDeTinta from './CaraDeTinta';
import './dico.css';
import physicalBody from './poses/dico-physical-body.webp';
import './dico-slot.css';

function reduceMotionActivo() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function DicoSlot() {
  const [fase, setFase] = useState('cerrado');
  const visible = fase !== 'cerrado';
  const abierto = fase === 'abierto';
  const cerrando = fase === 'cerrando';

  function alternar() {
    if (cerrando) return;
    if (!visible) {
      setFase('abierto');
      return;
    }

    if (reduceMotionActivo()) {
      setFase('cerrado');
      return;
    }

    setFase('cerrando');
  }

  function terminarRetorno(event) {
    if (event.currentTarget !== event.target || fase !== 'cerrando') return;
    setFase('cerrado');
  }

  const clases = [
    'dico-slot',
    visible ? 'dico-slot--visible' : '',
    abierto ? 'dico-slot--abierto' : '',
    cerrando ? 'dico-slot--cerrando' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={clases}>
      <div className="dico-slot-stage" aria-live="polite">
        {visible && (
          <div
            className="dico-physical"
            role="img"
            aria-label="Dico Physical"
            onAnimationEnd={terminarRetorno}
          >
            <img
              className="dico-physical-cuerpo"
              src={physicalBody}
              alt=""
              draggable="false"
            />
            <svg className="dico-physical-cara" viewBox="0 0 120 120" aria-hidden="true">
              <g className="dico--idle">
                <CaraDeTinta />
              </g>
            </svg>
          </div>
        )}
      </div>

      <button
        type="button"
        className="dico-slot-control"
        onClick={alternar}
        disabled={cerrando}
        aria-expanded={abierto}
        aria-label={cerrando
          ? 'Guardando Dico Physical'
          : abierto
            ? 'Guardar Dico Physical'
            : 'Abrir Dico Physical'}
      >
        <span className="dico-slot-ranura" aria-hidden="true">
          <span className="dico-slot-luz" />
        </span>
      </button>
    </div>
  );
}
