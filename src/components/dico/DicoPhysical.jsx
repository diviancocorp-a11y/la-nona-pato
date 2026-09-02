/**
 * DicoPhysical — el personaje 3D en runtime, con el pack oficial.
 *
 * Es un PRIMITIVE, no una maquina: recibe una pose y la dibuja. No sabe cuando
 * aparecer —eso lo decide `DicoPresence`—, no conoce el POS, no habla. Lo que
 * dice Dico va en la burbuja, que es otro componente: aca no se rasteriza
 * texto ni se simula lipsync nunca.
 *
 * ─────────────────── POR QUE NO PUEDE HABER SALTO ───────────────────
 *
 * Los ocho assets comparten canvas EXACTO (1600x1136), centro (800, 546,5) y
 * diametro de moneda dentro del 0,29% — verificado por el validator que ya
 * esta en el repo. Asi que las dos capas se dibujan en la MISMA caja, con
 * `inset: 0` y `object-fit: contain`: el encuadre no puede moverse entre poses
 * porque no hay nada que lo mueva. No hace falta compensar nada.
 *
 * Por eso tampoco hay microtraslacion. El brief la permite hasta 2px "si
 * realmente mejora la continuidad", y medido no hay discontinuidad que
 * mejorar: mover el personaje seria agregar movimiento decorativo, no
 * arreglarlo.
 *
 * ───────────────────────── EL CRUCE ─────────────────────────
 *
 * La pose saliente se queda OPACA abajo y la entrante aparece encima. No es un
 * cross-dissolve: si las dos se desvanecieran a la vez se veria el fondo a
 * traves del personaje en el medio del cambio. La saliente se retira recien
 * cuando la entrante termino.
 *
 * Y la entrante no empieza a aparecer hasta que el WebP CARGO. Sin eso, la
 * primera vez que se usa una pose el navegador todavia la esta bajando y el
 * cruce arranca contra un hueco transparente.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PHYSICAL_POSES, physicalPoseCanonica } from './vocabulario';
import useMediaQuery from '../../lib/useMediaQuery';
import './physical.css';

/** Duracion del cruce. El CSS lo lee de aca via variable. */
export const CRUCE_MS = 140;

/**
 * De pose a archivo. NO es una segunda lista: es la regla de nombre del pack
 * (`pointDown` -> `dico-3d-point-down.webp`), y hay un contrato que la compara
 * contra `platform/brand/dico-3d-assets.mjs`, que es el manifiesto certificado.
 */
export const rutaDePose = (pose) => {
  const guiones = pose.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  return `/brand/dico/physical/dico-3d-${guiones}.webp`;
};

export default function DicoPhysical({
  pose = 'idle',
  /** Override para tests. Sin esto sale de la media query. */
  reducedMotion,
  className = '',
  title = 'Dico',
}) {
  const actual = physicalPoseCanonica(pose);
  const menosMovimiento = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sinCruce = reducedMotion ?? menosMovimiento;

  // Estado derivado de props SIN efecto: es el patron de React para "ajustar
  // estado cuando una prop cambia". Con un efecto, el primer frame despues del
  // cambio dibujaria la pose nueva sin la saliente y el cruce se perderia.
  const [capas, setCapas] = useState({ actual, saliente: null, lista: true });
  if (capas.actual !== actual) {
    setCapas({
      actual,
      saliente: sinCruce ? null : capas.actual,
      // Con reduced motion no hay nada que esperar: el cambio es inmediato.
      lista: sinCruce,
    });
  }

  const temporizador = useRef(null);
  const retirarSaliente = useCallback(() => {
    setCapas((c) => (c.saliente === null ? c : { ...c, saliente: null }));
  }, []);

  // La saliente se retira cuando termina el cruce. El tope existe para que una
  // imagen que no carga nunca no deje dos capas montadas para siempre.
  useEffect(() => {
    if (capas.saliente === null) return undefined;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(retirarSaliente, capas.lista ? CRUCE_MS + 20 : CRUCE_MS + 900);
    return () => clearTimeout(temporizador.current);
  }, [capas.saliente, capas.lista, retirarSaliente]);

  const entranteCargo = useCallback(() => {
    setCapas((c) => (c.lista ? c : { ...c, lista: true }));
  }, []);

  const clases = ['dico-physical', sinCruce ? 'dico-physical--sin-cruce' : '', className]
    .filter(Boolean).join(' ');

  return (
    <div
      className={clases}
      style={{ '--dico-cruce': `${CRUCE_MS}ms` }}
      role="img"
      aria-label={title}
      data-dico-physical={capas.actual}
      data-dico-physical-cruzando={capas.saliente ? 'si' : 'no'}
    >
      {capas.saliente && (
        <img
          key={capas.saliente}
          className="dico-physical-capa dico-physical-capa--saliente"
          src={rutaDePose(capas.saliente)}
          alt=""
          width={1600}
          height={1136}
          draggable="false"
          aria-hidden="true"
        />
      )}
      <img
        key={capas.actual}
        className={`dico-physical-capa dico-physical-capa--actual${capas.lista ? ' dico-physical-capa--lista' : ''}`}
        src={rutaDePose(capas.actual)}
        alt=""
        width={1600}
        height={1136}
        draggable="false"
        decoding="async"
        onLoad={entranteCargo}
      />
    </div>
  );
}

export { PHYSICAL_POSES };
