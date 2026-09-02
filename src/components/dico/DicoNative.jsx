/**
 * DicoNative — la presencia 2D, con los assets finales.
 *
 * UN SOLO ADAPTADOR, no siete componentes. Recibe un `nativeState`, elige el
 * PNG y monta el pulso Volt encima. Reemplaza visualmente al Native SVG
 * anterior (`DicoCara`), que queda para la vitrina y los contratos historicos.
 *
 * DESACOPLADO. No conoce roles, verticales ni el Slot: recibe estado y
 * actividad, y avisa el click hacia arriba. Quien decide que cara y que
 * actividad corresponden es la capa que dispara el evento — son EJES
 * INDEPENDIENTES y `activity` no determina `state`.
 *
 * ─────────────────────── LA GEOMETRIA NO SE ADIVINA ───────────────────────
 *
 * Los tres numeros de abajo salen de medir los assets, no de tantear:
 *
 *   el personaje ocupa   78,91% del ancho del canvas
 *   su centro cae en     49,80% X / 48,05% Y   <- NO es el medio de la caja
 *   el aro azul vive a   r/R 0,67 del radio del personaje  <- NO es el borde
 *
 * Con el pulso centrado en 50/50 y radio 44 quedaba descentrado y por fuera del
 * aro. Los siete assets comparten canvas y geometria EXACTOS —dispersion
 * 0,000pp— asi que un solo juego de numeros sirve para los siete y cambiar de
 * estado no mueve un pixel del encuadre.
 */
import { useMemo } from 'react';
import DicoPulso from './DicoPulso';
import { NATIVE_STATES, nativeStateCanonico } from './vocabulario';
import './native.css';

/** Los assets viven en `public/`, asi que se referencian por URL. */
const RUTA = (estado) => `/brand/dico/dico-2d-${estado}.png`;

/* Medido sobre `public/brand/dico/`. Ver el bloque de arriba. */
const CENTRO_X = 49.80;
const CENTRO_Y = 48.05;
const ANCHO_PERSONAJE = 0.7891;   // fraccion del canvas
const ARO_SOBRE_RADIO = 0.67;     // donde vive el aro dentro del personaje

/** Radio del aro en unidades del viewBox de 100 del overlay. */
const RADIO_ARO = +((ANCHO_PERSONAJE / 2) * ARO_SOBRE_RADIO * 100).toFixed(2);
/** Grosor del aro, tambien medido: ocupa r/R 0,62 a 0,72 del personaje. */
const GROSOR_ARO = +(((0.72 - 0.62) / 2) * ANCHO_PERSONAJE * 100).toFixed(2);

export default function DicoNative({
  state = 'neutral',
  activity = 'idle',
  /** Tamanio VISUAL. El area clickeable es siempre >= 44 (ver `native.css`). */
  size = 40,
  onClick,
  title,
  className = '',
  style,
}) {
  const estado = nativeStateCanonico(state);
  const etiqueta = title || 'Dico';

  // La caja interna mide EXACTAMENTE `size`. El overlay del pulso se posiciona
  // con `inset: 0` sobre ella, asi que su viewBox de 100 coincide con el arte.
  // Si el overlay colgara del boton —que mide 44 para el hit target— quedaria
  // repartido sobre 44 y el aro caeria desalineado respecto del PNG.
  const contenido = useMemo(() => (
    <span className="dico-native-caja">
      <img
        className="dico-native-arte"
        src={RUTA(estado)}
        alt=""
        width={size}
        height={size}
        draggable="false"
        decoding="async"
      />
      <DicoPulso
        activity={activity}
        cx={CENTRO_X}
        cy={CENTRO_Y}
        radio={RADIO_ARO}
        grosor={GROSOR_ARO}
      />
    </span>
  ), [estado, activity, size]);

  const clases = ['dico-native', `dico-native--${estado}`, className].filter(Boolean).join(' ');
  const vars = { '--dico-native-size': `${size}px`, ...style };

  // Sin `onClick` es presencia decorativa y no debe recibir foco ni anunciarse
  // como control: el aviso de al lado ya tiene el suyo.
  if (!onClick) {
    return (
      <span className={clases} style={vars} role="img" aria-label={etiqueta} data-dico-native={estado}>
        {contenido}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${clases} dico-native--boton`}
      style={vars}
      onClick={onClick}
      aria-label={etiqueta}
      data-dico-native={estado}
    >
      {contenido}
    </button>
  );
}

export { NATIVE_STATES, RADIO_ARO, GROSOR_ARO, CENTRO_X, CENTRO_Y };
