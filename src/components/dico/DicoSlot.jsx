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

export default function DicoSlot() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={`dico-slot${abierto ? ' dico-slot--abierto' : ''}`}>
      <div className="dico-slot-stage" aria-live="polite">
        {abierto && (
          <div className="dico-physical" role="img" aria-label="Dico Physical">
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
        onClick={() => setAbierto(valor => !valor)}
        aria-expanded={abierto}
        aria-label={abierto ? 'Guardar Dico Physical' : 'Abrir Dico Physical'}
      >
        <span className="dico-slot-ranura" aria-hidden="true">
          <span className="dico-slot-luz" />
        </span>
      </button>
    </div>
  );
}
