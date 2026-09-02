import { useEffect, useState } from 'react';

/**
 * Escucha una media query desde JS.
 *
 * SE USA SOLO CUANDO EL CSS NO ALCANZA. Mostrar u ocultar se hace con `@media`
 * —no hay parpadeo ni doble render— pero MOVER un componente de un lugar del
 * arbol a otro no se puede hacer con CSS: si `DicoPresence` se montara en los
 * dos lugares habria dos maquinas de presencia con estados distintos.
 *
 * El valor inicial se lee sincronicamente para que el primer frame ya sea el
 * correcto; leerlo en un efecto haria que el panel entero parpadee.
 */
export default function useMediaQuery(query) {
  const [coincide, setCoincide] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;   // SSR o entorno sin matchMedia: el default es mobile
    }
  });

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(query);
    } catch {
      return undefined;
    }
    const alCambiar = (evento) => setCoincide(evento.matches);
    setCoincide(mq.matches);
    // `addListener` es el fallback para Safari viejo, donde `addEventListener`
    // sobre un MediaQueryList no existe.
    if (mq.addEventListener) mq.addEventListener('change', alCambiar);
    else mq.addListener(alCambiar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar);
      else mq.removeListener(alCambiar);
    };
  }, [query]);

  return coincide;
}
