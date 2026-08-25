/**
 * DicoEscena — poses narrativas heredadas para marketing y Retro Moments.
 *
 * Dentro del flujo operativo usar DicoCoreEscena. Este componente conserva la
 * API y los siete renders anteriores hasta migrarlos a la identidad nueva.
 */
import BurbujaDico from './BurbujaDico';
import celebra from './poses/escena-celebra.webp';
import descubre from './poses/escena-descubre.webp';
import explica from './poses/escena-explica.webp';
import fatal from './poses/escena-fatal.webp';
import idle from './poses/escena-idle.webp';
import pregunta from './poses/escena-pregunta.webp';
import senala from './poses/escena-senala.webp';
import './escena.css';

const IMAGEN_POR_POSE = { celebra, descubre, explica, fatal, idle, pregunta, senala };

export const POSES_DICO_ESCENA = Object.freeze(Object.keys(IMAGEN_POR_POSE));

export default function DicoEscena({
  pose = 'idle',
  texto,
  accion,
  onAccion,
  nivel = 'sugerencia',
  size = 190,
  title = 'Dico',
}) {
  const segura = IMAGEN_POR_POSE[pose] ? pose : 'idle';

  return (
    <section className={`dico-cuadro dico-cuadro--${segura}`}>
      {texto && (
        <BurbujaDico texto={texto} nivel={nivel} cola="centro" />
      )}

      <div className="dico-cuadro-personaje" style={{ '--dico-cuadro-size': `${size}px` }}>
        <img src={IMAGEN_POR_POSE[segura]} alt={title} draggable="false" />
      </div>

      {accion && (
        <button type="button" className="ag-cta dico-cuadro-accion" onClick={onAccion}>
          {accion}
        </button>
      )}
    </section>
  );
}
