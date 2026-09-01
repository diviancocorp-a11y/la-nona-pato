/**
 * DicoPulso — el pulso Volt, como capa reutilizable.
 *
 * Es la firma tecnica de Dico: sobre el aro azul aparece una senial mas clara
 * que lo recorre. Vive en una capa SEPARADA del asset, asi que el mismo
 * componente se superpone a Dico 2D, a Dico 3D y a la O del logo sin editar
 * ningun PNG y sin tocar el Gold.
 *
 * DESACOPLADO A PROPOSITO. No conoce roles, verticales, `DicoPresence`, el
 * Slot, los mensajes ni las poses. Recibe una actividad y dibuja. Quien decide
 * la actividad es otro; mezclar esa decision acá seria volver a atar la firma
 * visual a la maquina de presencia, que es justo lo que B1 separo.
 *
 * `activity` es un EJE INDEPENDIENTE de `nativeState` y `physicalPose`: que el
 * sistema este procesando no implica que Dico ponga cara de nada.
 */
import { ACTIVITIES, activityCanonica } from './vocabulario';
import './pulso.css';

/** Reexport por comodidad. La autoridad del eje vive en `vocabulario.js`. */
export { ACTIVITIES };

/**
 * Largo de la estela y de la punta, en porcentaje de la circunferencia.
 * La punta es corta y la estela la sigue: cabeza y cola. Un arco unico y duro
 * es exactamente lo que hace que algo se lea como spinner generico.
 */
const LARGO = {
  idle:       { estela: 0,    punta: 0 },
  active:     { estela: 0,    punta: 0 },
  processing: { estela: 0.26, punta: 0.085 },
  thinking:   { estela: 0.38, punta: 0.11 },
  attention:  { estela: 0.20, punta: 0.10 },
};

export default function DicoPulso({
  activity = 'idle',
  /** Radio en unidades del viewBox de 100. Mueve la circunferencia. */
  radio = 44,
  /** Grosor del trazo, mismas unidades. */
  grosor = 6,
  /** Multiplicador global de opacidad, 0..1. */
  intensidad = 1,
  /** Duracion de una vuelta completa en `processing`. */
  vuelta = '2.6s',
  /** Dibujar tambien el aro base. Solo donde NO hay arte debajo. */
  aro = false,
  className = '',
  style,
}) {
  const modo = activityCanonica(activity);
  const circunferencia = 2 * Math.PI * radio;
  const { estela, punta } = LARGO[modo];

  const clases = [
    'dico-pulso',
    `dico-pulso--${modo}`,
    aro ? 'dico-pulso--con-aro' : '',
    className,
  ].filter(Boolean).join(' ');

  const vars = {
    '--dico-pulso-grosor': grosor,
    '--dico-pulso-radio': radio,
    '--dico-pulso-intensidad': intensidad,
    '--dico-pulso-vuelta': vuelta,
    ...style,
  };

  // El dasharray deja UN segmento visible y el resto del aro vacio. La punta
  // arranca donde termina la estela para que se lean como una sola senial.
  const traza = (largo) => `${circunferencia * largo} ${circunferencia}`;

  return (
    <svg
      className={clases}
      style={vars}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      data-dico-pulso={modo}
    >
      <circle
        className="dico-pulso-aro"
        cx="50" cy="50" r={radio}
        strokeWidth={grosor}
      />
      <g className="dico-pulso-giro">
        <circle
          className="dico-pulso-estela"
          cx="50" cy="50" r={radio}
          strokeWidth={grosor}
          strokeDasharray={traza(estela)}
          transform={`rotate(-90 50 50)`}
        />
        <circle
          className="dico-pulso-punta"
          cx="50" cy="50" r={radio}
          strokeWidth={grosor}
          strokeDasharray={traza(punta)}
          transform={`rotate(${-90 + estela * 360} 50 50)`}
        />
      </g>
    </svg>
  );
}
