// src/components/ui/OverlayPortal.jsx
//
// Saca un overlay del arbol del Admin Shell y lo monta en un root propio,
// hijo directo de <body>.
//
// ── QUE ARREGLA ──
// `PlatformAdmin` renderiza `<main style={{ position: 'relative', zIndex: 2 }}>`.
// Eso crea un stacking context: todo lo que vive adentro queda encerrado, y su
// z-index —por alto que sea— se compara contra el 2 de `main`, no contra el
// resto del shell.
//
// Medido el 30/ago: el dialogo de cobro declaraba `z-index: 60` y la bottom nav
// `z-index: 5`, y aun asi `elementsFromPoint` en el centro de cada item de nav
// devolvia el item, no el dialogo. Playwright confirmaba que los botones de
// navegacion eran clickeables con el modal abierto. La pila era:
//
//   0. svg.ag-nav-icon      1. button.ag-nav-item     2. nav.ag-bottom-nav  (z 5)
//   3. button   4. section  5. div[role=dialog]  (z 60)   6. main  (z 2)
//
// El 60 estaba atrapado dentro del 2. Subir el numero no lo arregla: hay que
// salir del stacking context. Por eso portal, y no un z-index mas grande.
//
// El repo ya tenia una pista de este mismo problema: `admin-shared.css` explica
// que `.ag-page-over` tiene que ocultar topbar y nav con `display: none`
// justamente porque `main` lo atrapa. Ese workaround funciona para pantallas
// full-screen, no para un dialogo que se superpone.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Id del contenedor unico. Uno solo para todos los overlays. */
export const OVERLAY_ROOT_ID = 'dico-overlay-root';
/** La clase que engancha los tokens `--ag-*`. Ver el comentario de abajo. */
export const OVERLAY_ROOT_CLASS = 'ag-overlay-root';

/**
 * Devuelve el root de overlays, creandolo si hace falta.
 * Vive como hijo directo de <body>: sin ancestros con transform, filter,
 * opacity, isolation, contain ni z-index, o sea sin stacking context que lo
 * atrape.
 */
export function obtenerOverlayRoot(doc = document) {
  let root = doc.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = doc.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    // La clase —y no el id— es la que engancha los tokens en CSS. Un selector
    // de id tiene especificidad (1,0,0) y le ganaria a `.ag-theme-dark`
    // (0,1,0): el overlay se quedaria SIEMPRE en claro. Medido: con el id, el
    // dialogo de cobro salia con la paleta clara dentro de un panel oscuro.
    root.className = OVERLAY_ROOT_CLASS;
    // Sin estilos propios: el root no pinta ni ocupa. Cada overlay se
    // posiciona solo. Si el root tuviera position/z-index volveria a crear
    // el problema que este archivo existe para evitar.
    doc.body.appendChild(root);
  }
  return root;
}

/**
 * Copia la clase de tema del panel al root de overlays.
 *
 * Los tokens `--ag-*` viven en `.ag-root` y el override oscuro es la clase
 * `.ag-theme-dark` sobre ese mismo nodo. Un portal colgado de <body> no es
 * descendiente suyo, asi que sin esto un dialogo saldria SIEMPRE en claro,
 * aunque el panel este en oscuro. Seria exactamente el defecto que este lote
 * arregla, reintroducido por la solucion.
 */
export function sincronizarTema(root, doc = document) {
  const panel = doc.querySelector('.ag-root');
  const oscuro = !!panel && panel.classList.contains('ag-theme-dark');
  root.classList.add(OVERLAY_ROOT_CLASS);
  root.classList.toggle('ag-theme-dark', oscuro);
  root.classList.toggle('ag-theme-light', !oscuro);
  return oscuro ? 'dark' : 'light';
}

/**
 * Monta `children` fuera del shell. No renderiza nada mientras no haya DOM
 * (SSR o primer render), asi que es seguro usarlo en cualquier arbol.
 */
export default function OverlayPortal({ children }) {
  // Inicializador perezoso y NO un efecto: el contenido tiene que existir en el
  // PRIMER commit. Si el portal devolviera null en el primer render, el ref del
  // panel llegaria vacio al efecto de useFocusTrap y el trap no se armaria
  // nunca — el foco se quedaria donde estaba, que es exactamente el defecto
  // que este componente ayuda a arreglar.
  const [root] = useState(() => (typeof document === 'undefined' ? null : obtenerOverlayRoot()));

  useEffect(() => {
    if (root) sincronizarTema(root);
    // A proposito NO se borra el root al desmontar: es compartido por todos
    // los overlays y removerlo desde uno romperia a otro que este abierto.
    // Es un div vacio; su costo es cero.
  }, [root]);

  if (!root) return null;
  return createPortal(children, root);
}
