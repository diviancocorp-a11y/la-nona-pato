/**
 * ToggleSwitch — control boolean.
 *
 * Dos formas de usarlo, y la diferencia la hace `hint`:
 *
 *   1. SIN hint  -> devuelve el interruptor pelado. Para cuando el que llama
 *      ya dibuja su propia etiqueta al lado (ej: ProductEditor, que arma una
 *      fila con space-between). `label` va solo a aria-label.
 *
 *   2. CON hint  -> devuelve la fila completa: etiqueta, explicacion e
 *      interruptor.
 *
 * Por que existe el punto 2: antes `label` iba SIEMPRE a `aria-label` y `hint`
 * ni siquiera era una prop — se descartaba en silencio. Los dos lugares que
 * pasaban las dos cosas esperando verlas (el "Tengo local fisico" de la marca
 * y el "Este proveedor factura") mostraban un interruptor pelado, sin una
 * palabra de que prendia o apagaba. Con lector de pantalla se entendia;
 * mirando la pantalla, no.
 */
import { memo } from 'react'

function ToggleSwitch({ checked = false, onChange, label, hint }) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`ag-toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange?.(!checked)}
    />
  )

  if (!hint) return control

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && (
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ag-ink)' }}>{label}</div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--ag-ink-3)', marginTop: 2, lineHeight: 1.35 }}>{hint}</div>
      </div>
      {control}
    </div>
  )
}

export default memo(ToggleSwitch)
