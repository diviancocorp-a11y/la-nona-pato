/**
 * El tipeo letra por letra, compartido.
 *
 * Vive aparte porque ahora hay DOS superficies donde Dico habla y las dos
 * tienen que sonar igual: el globo dibujado (`BurbujaDico`, que quedo para
 * Physical) y la tarjeta del sistema (`MensajeDico`, la de Dico 2D). Si cada
 * una tuviera su propio intervalo, la velocidad se separaria en cuanto
 * alguien tocara una de las dos y Dico dejaria de sonar como una sola voz.
 *
 * El texto COMPLETO sigue siendo responsabilidad de quien llama: esto devuelve
 * cuanto se lleva escrito, no el texto. Nadie deberia esperar una animacion
 * para enterarse de que le falta stock, asi que el mensaje entero va siempre
 * al DOM para el lector de pantalla.
 */
import { useEffect, useRef, useState } from 'react';

export const MS_POR_LETRA = 18;

export const menosMovimiento = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function useTipeo(texto) {
  const [letras, setLetras] = useState(() => (menosMovimiento() ? texto.length : 0));
  const timer = useRef(null);

  useEffect(() => {
    if (menosMovimiento()) {
      setLetras(texto.length);
      return undefined;
    }
    setLetras(0);
    timer.current = setInterval(() => {
      setLetras((n) => {
        if (n >= texto.length) { clearInterval(timer.current); return n; }
        return n + 1;
      });
    }, MS_POR_LETRA);
    return () => clearInterval(timer.current);
  }, [texto]);

  const completo = letras >= texto.length;

  // Tocar el mensaje lo completa, como los juegos de los que sale el gesto.
  const saltear = () => {
    if (completo) return;
    clearInterval(timer.current);
    setLetras(texto.length);
  };

  return { letras, completo, saltear };
}
