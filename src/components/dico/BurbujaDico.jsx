/**
 * BurbujaDico — lo que Dico dice, en un globo dibujado a mano.
 *
 * EL MARCO ES SVG Y NO UN border DE CSS
 * Un `border-radius` da una curva perfecta, y una curva perfecta no se lee como
 * dibujada. Lo que hace que el globo de la referencia parezca hecho con pluma
 * son dos cosas que CSS no puede: el trazo que no cierra parejo y las rayitas
 * de eco por fuera de las esquinas, como el segundo pase de un entintador.
 * Por eso el contorno se genera como path a partir del tamanio MEDIDO del
 * contenido: asi el trazo mantiene su grosor sea cual sea el largo del texto,
 * cosa que un SVG estirado con preserveAspectRatio="none" no logra.
 *
 * DOS DECISIONES QUE PARECEN DETALLE Y NO LO SON
 *
 * 1. EL MARCO ES RETRO, EL TEXTO NO. La tipografia de las caricaturas de los 30
 *    es condensada, temblorosa y dificil de leer. El retro lo lleva el
 *    contorno; la letra se queda legible. Justamente el publico al que le
 *    queremos hablar con esto es el que peor lee la letra de epoca.
 *
 * 2. UNA BURBUJA A LA VEZ. `reglas.js` devuelve hasta cuatro avisos. Cuatro
 *    globos simultaneos no es un personaje hablando, es una lista con dibujos.
 *    Va el mas grave y los otros esperan detras con un contador.
 *
 * EL TIPEO letra por letra es el gesto de videojuego viejo, y es lo unico de la
 * epoca que si conviene copiar: cuesta cero legibilidad porque el texto termina
 * completo igual. Va rapido y se saltea tocando, como funcionaban.
 *
 * El texto completo esta SIEMPRE en el DOM para el lector de pantalla: nadie
 * deberia esperar una animacion para enterarse de que le falta stock.
 */
import { useState, useRef, useLayoutEffect } from 'react';
import './burbuja.css';
import useTipeo from './useTipeo';

const R = 20;          // radio de las esquinas

/**
 * El contorno, en dos partes: el globo (que se rellena) y las rayitas de eco
 * (que no). Los desvios estan escritos a mano y son SIEMPRE LOS MISMOS: un
 * temblor al azar cambiaria en cada render y se veria como un parpadeo.
 */
function xDeCola(w, cola) {
  if (cola === 'centro') return w / 2;
  if (cola === 'derecha') return w - 52;
  return 52;
}

/**
 * DOS SALIDAS PARA LA COLA, segun donde este Dico.
 *
 * `izquierda` / `centro` / `derecha` la sacan por ABAJO: sirven cuando la
 * burbuja esta encima del personaje, que es la composicion de mobile.
 *
 * `lateral` la saca por la IZQUIERDA, a la altura del hombro. Es para el
 * shell desktop, donde Dico vive en la sidebar y la burbuja se abre hacia el
 * workspace: una cola que baja apuntaria al vacio en vez de a quien habla.
 *
 * Los desvios estan escritos a mano y son SIEMPRE LOS MISMOS en las dos
 * variantes: un temblor al azar cambiaria en cada render y se veria como un
 * parpadeo.
 */
const ALTO_COLA_LATERAL = 34;   // a la altura del hombro, no del piso

function contorno(w, h, cola) {
  if (cola === 'lateral') {
    const y = Math.min(ALTO_COLA_LATERAL, Math.max(h - 18, 20));
    return [
      `M${R + 2} 5`,
      `L${w - R - 5} 1.5`,
      `Q${w - 3} 1 ${w - 1.5} ${R + 3}`,
      `L${w - 2.5} ${h - R + 1}`,
      `Q${w - 4} ${h - 1} ${w - R - 5} ${h - 2}`,
      `L${R + 2} ${h - 3}`,
      `Q2.5 ${h - 4} 2 ${h - R - 2}`,
      `L3 ${y + 16}`,
      // Sale hacia la izquierda, hacia Dico. Misma asimetria que la de abajo.
      `Q-7 ${y + 11} ${-21} ${y - 1}`,
      `Q-6 ${y - 2} 3 ${y - 13}`,
      `L3 ${R + 4}`,
      `Q3 ${7} ${R + 2} 5`,
      'Z',
    ].join(' ');
  }
  const x = xDeCola(w, cola);
  const globo = [
    `M${R + 2} 5`,
    `L${w - R - 5} 1.5`,
    `Q${w - 3} 1 ${w - 1.5} ${R + 3}`,
    `L${w - 2.5} ${h - R + 1}`,
    `Q${w - 4} ${h - 1} ${w - R - 5} ${h - 2}`,
    `L${x + 15} ${h - 2}`,
    // La cola sale por abajo. La curva larga y asimetrica es la que hace que
    // se lea como historieta y no como tooltip de producto.
    `Q${x + 8} ${h + 13} ${x - 12} ${h + 24}`,
    `Q${x - 2} ${h + 8} ${x - 17} ${h - 2}`,
    `L${R + 2} ${h - 3}`,
    `Q2.5 ${h - 4} 2 ${h - R - 2}`,
    `L3 ${R + 4}`,
    `Q3 ${7} ${R + 2} 5`,
    'Z',
  ].join(' ');
  return globo;
}

export default function BurbujaDico({
  texto,
  nivel = 'sugerencia',
  restantes = 0,
  accion,
  onAccion,
  onSiguiente,
  onCerrar,
  cola = 'izquierda',
}) {
  // El tipeo es el MISMO que el de la tarjeta de Dico 2D: una sola voz, una
  // sola velocidad. Ver `useTipeo`.
  const { letras, completo, saltear } = useTipeo(texto);
  const [caja, setCaja] = useState({ w: 0, h: 0 });
  const contenido = useRef(null);

  // El marco se dibuja sobre el tamanio real del contenido. La copia completa
  // invisible reserva esa geometria desde el primer frame; ResizeObserver solo
  // cubre cambios reales de ancho o contenido, no cada letra del typewriter.
  useLayoutEffect(() => {
    const el = contenido.current;
    if (!el) return undefined;
    const medir = () => setCaja({ w: el.offsetWidth, h: el.offsetHeight });
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const globo = contorno(Math.max(caja.w, 80), Math.max(caja.h, 40), cola);
  const tienePie = accion || restantes > 0 || onCerrar;

  return (
    <div className={`dico-burbuja dico-burbuja--${nivel} dico-burbuja--cola-${cola}`} role="status">
      <div className="dico-burbuja-globo">
        {caja.w > 0 && (
          <svg className="dico-burbuja-marco" viewBox={`0 0 ${caja.w} ${caja.h}`}
            width={caja.w} height={caja.h} aria-hidden="true">
            <path className="dico-burbuja-relleno" d={globo} />
            <path className="dico-burbuja-trazo" d={globo} />
          </svg>
        )}

        <button
          type="button"
          className="dico-burbuja-contenido"
          ref={contenido}
          onClick={saltear}
          tabIndex={completo ? -1 : 0}
          aria-label={completo ? undefined : 'Completar mensaje de Dico'}
        >
          <span className="dico-burbuja-reserva" aria-hidden="true">
            {texto}
            <i className="dico-burbuja-cursor-reserva" />
          </span>
          <span className="dico-burbuja-texto" aria-hidden="true">
            {texto.slice(0, letras)}
            {!completo && <i className="dico-burbuja-cursor" />}
          </span>
        </button>
      </div>

      {/* Para el lector de pantalla, siempre entero. */}
      <span className="dico-burbuja-lectura">{texto}</span>

      {tienePie && <div className="dico-burbuja-pie">
        {accion && (
          <button type="button" className="dico-burbuja-accion" onClick={onAccion}>
            {accion}
          </button>
        )}
        {/* «Siguiente», no «hay 2 más»: lo que el usuario decide es avanzar,
            no contar. El numero, cuando importa, lo lleva la tarjeta de Dico
            2D en su cabecera. */}
        {restantes > 0 && (
          <button type="button" className="dico-burbuja-mas" onClick={onSiguiente}>
            Siguiente
          </button>
        )}
        {onCerrar && (
          <button
            type="button" className="dico-burbuja-cerrar" onClick={onCerrar}
            aria-label="Cerrar lo que dice Dico"
          >
            ✕
          </button>
        )}
      </div>}
    </div>
  );
}
