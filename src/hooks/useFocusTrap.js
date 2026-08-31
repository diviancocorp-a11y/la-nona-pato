// src/hooks/useFocusTrap.js
//
// Atrapa el foco dentro de un contenedor mientras esta activo, y lo devuelve
// a quien lo abrio al desactivarse.
//
// ── QUE ARREGLA ──
// Medido el 30/ago sobre el dialogo de cobro: al abrir, el foco quedaba en el
// boton "Cobrar" del FONDO; los primeros cuatro Tab recorrian botones de la
// pantalla de atras; Escape no cerraba; y al cerrar por la X el foco caia en
// `body`. `aria-modal="true"` estaba declarado, asi que un lector de pantalla
// ocultaba el fondo mientras el teclado si lo alcanzaba — peor que no
// declararlo.
//
// Es un hook chico y propio a proposito: el contrato entero son ~80 lineas y
// no justifica una dependencia nueva.

import { useEffect, useRef } from 'react';

/** Selector de lo que el navegador considera enfocable por tabulacion. */
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'object',
  'embed', 'audio[controls]', 'video[controls]', 'summary',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]',
].join(',');

/**
 * Visible segun el arbol de estilos, no segun el layout.
 *
 * A proposito NO se usa `getClientRects()`: jsdom no calcula layout y devuelve
 * vacio para TODO, asi que ese chequeo dejaria la lista de enfocables vacia en
 * los tests y el trap caeria siempre al contenedor. `display` y `visibility` si
 * los computa, y son los que de verdad sacan un control de la tabulacion.
 */
function estaVisible(el) {
  let n = el;
  while (n && n.nodeType === 1) {
    if (n.hasAttribute?.('hidden')) return false;
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(n) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse')) return false;
    n = n.parentElement;
  }
  return true;
}

/** Los enfocables VISIBLES de un contenedor, en orden de tabulacion. */
export function focusablesDe(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    if (Number(el.getAttribute('tabindex')) < 0) return false;
    return estaVisible(el);
  });
}

/**
 * @param {object} opciones
 * @param {boolean} opciones.activo
 * @param {React.RefObject<HTMLElement>} opciones.contenedorRef
 * @param {() => void} [opciones.onEscape]
 * @param {boolean} [opciones.bloquearScroll=true]
 */
export function useFocusTrap({ activo, contenedorRef, onEscape, bloquearScroll = true }) {
  // El disparador se guarda en un ref y no en estado: cambiarlo no tiene que
  // re-renderizar, y tiene que sobrevivir a los renders del contenido.
  const disparadorRef = useRef(null);
  // onEscape en un ref para que el efecto no se re-arme —y por lo tanto no
  // reinstale listeners ni vuelva a mover el foco— cuando el padre pasa una
  // funcion nueva en cada render.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!activo) return undefined;
    const contenedor = contenedorRef.current;
    if (!contenedor) return undefined;

    disparadorRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Foco inicial: el primer control util; si no hay ninguno, el contenedor.
    // El contenedor necesita tabindex="-1" para poder recibirlo — lo pone
    // Dialog, no este hook, para no mutar nodos ajenos.
    const primero = focusablesDe(contenedor)[0];
    if (primero) primero.focus();
    else contenedor.focus?.();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const lista = focusablesDe(contenedor);
      if (lista.length === 0) {
        // Sin enfocables el foco no puede salir: se queda en el contenedor.
        e.preventDefault();
        contenedor.focus?.();
        return;
      }
      const primeroActual = lista[0];
      const ultimo = lista[lista.length - 1];
      const activoAhora = document.activeElement;

      // Si el foco se escapo del contenedor (click en el fondo, foco
      // programatico de otro lado), volver a traerlo.
      if (!contenedor.contains(activoAhora)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primeroActual).focus();
        return;
      }
      if (e.shiftKey && activoAhora === primeroActual) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activoAhora === ultimo) {
        e.preventDefault();
        primeroActual.focus();
      }
    };

    // En captura: asi el trap gana aunque un hijo detenga la propagacion.
    document.addEventListener('keydown', onKeyDown, true);

    let overflowPrevio;
    if (bloquearScroll) {
      overflowPrevio = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (bloquearScroll) document.body.style.overflow = overflowPrevio ?? '';
      const disparador = disparadorRef.current;
      // Solo devolver el foco si sigue en el documento y es enfocable.
      if (disparador && document.contains(disparador)) disparador.focus?.();
      disparadorRef.current = null;
    };
  }, [activo, contenedorRef, bloquearScroll]);
}

export default useFocusTrap;
