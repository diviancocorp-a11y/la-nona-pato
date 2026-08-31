// src/components/ui/Dialog.jsx
//
// La primitiva de dialogo del admin: portal + backdrop + focus trap + Escape,
// en un solo lugar.
//
// Antes cada pantalla armaba su propio overlay a mano —`position: fixed` con
// un z-index elegido a ojo, sin trap, sin Escape, sin devolver el foco—. El de
// cobro fallaba las cuatro cosas a la vez. Poner el contrato en un componente
// hace que la proxima pantalla lo herede en vez de repetir el error.
//
// No usa una libreria: el contrato completo son este archivo y useFocusTrap.

import { useCallback, useEffect, useId, useRef } from 'react';
import OverlayPortal from './OverlayPortal';
import useFocusTrap from '../../hooks/useFocusTrap';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.label]            nombre accesible directo
 * @param {string} [props.labelledBy]       id del titulo, si el contenido lo trae
 * @param {string} [props.describedBy]      id de la descripcion, si corresponde
 * @param {boolean} [props.cerrarConBackdrop=true]
 * @param {'sheet'|'center'} [props.variante='sheet']
 * @param {string} [props.className]
 * @param {object} [props.panelStyle]
 */
export default function Dialog({
  open,
  onClose,
  label,
  labelledBy,
  describedBy,
  cerrarConBackdrop = true,
  variante = 'sheet',
  className = '',
  panelStyle,
  children,
}) {
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const idBase = useId();

  // Estable: sin esto el efecto del trap se re-armaria en cada render del
  // padre y volveria a mover el foco al primer control.
  const cerrar = useCallback(() => { onClose?.(); }, [onClose]);

  useFocusTrap({ activo: open, contenedorRef: panelRef, onEscape: cerrar });

  // El backdrop cierra solo si el click empezo Y termino en el, para que
  // arrastrar desde adentro del panel hacia afuera no cierre por accidente.
  const abajoEnBackdrop = useRef(false);
  useEffect(() => { if (!open) abajoEnBackdrop.current = false; }, [open]);

  if (!open) return null;

  const etiqueta = labelledBy
    ? { 'aria-labelledby': labelledBy }
    : { 'aria-label': label || 'Diálogo' };

  return (
    <OverlayPortal>
      {/* El backdrop es el que cubre el viewport y lleva la capa. El panel va
          encima con su propia capa: separarlos permite animar el velo sin
          tocar el contenido, y evita que el panel herede opacidad. */}
      <div
        ref={backdropRef}
        className="ag-dialog-backdrop"
        onMouseDown={(e) => { abajoEnBackdrop.current = e.target === backdropRef.current; }}
        onMouseUp={(e) => {
          if (!cerrarConBackdrop) return;
          if (abajoEnBackdrop.current && e.target === backdropRef.current) cerrar();
          abajoEnBackdrop.current = false;
        }}
      >
        <div
          ref={panelRef}
          id={`${idBase}-panel`}
          role="dialog"
          aria-modal="true"
          {...etiqueta}
          {...(describedBy ? { 'aria-describedby': describedBy } : {})}
          // tabindex -1: destino del foco cuando el contenido todavia no tiene
          // ningun control enfocable (paso de carga, lista vacia).
          tabIndex={-1}
          className={`ag-dialog-panel ag-dialog-panel--${variante} ${className}`.trim()}
          style={panelStyle}
        >
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}
