/**
 * AdminBackdrop — fondo del admin (jun 2026, v3).
 * Diseno adaptado del patron "background snippets" (grilla + radial)
 * al stack propio: CSS plano, tokens por tema.
 *
 *   · Grilla de lineas finas (estatica — costo cero).
 *   · UN resplandor radial que deriva lento por transform: animacion
 *     compositor-friendly, no repinta nada (la v2 animaba el dash de 48
 *     trazos SVG y saturaba el render).
 *
 * PASS 1 de Phase 4 saco el segundo resplandor y bajo el primero al 6-7%.
 * Con los dos al 34-45% de alfa sobre 70vmax el lienzo entero era una
 * degrade ambar y el contenido operativo flotaba encima como si fuera lo
 * secundario. El oro es accion, seleccion, foco y presencia — no fondo.
 *
 * Se monta UNA vez como child del contenedor con .ag-root, detras de
 * todo el contenido. El login NO usa esta capa.
 */
import { memo } from 'react'

function AdminBackdrop() {
  return (
    <div className="ag-bg-layer" aria-hidden="true">
      <div className="ag-bg-grid" />
      <div className="ag-bg-glow g1" />
    </div>
  )
}

export default memo(AdminBackdrop)
