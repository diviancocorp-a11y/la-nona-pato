/**
 * ImagePicker — elegir una foto, no pegar una URL.
 *
 * Antes de esto el alta de producto tenia un input `type="url"` con
 * placeholder "https://...". Para poner la foto de una empanada habia que
 * subirla antes a algun servicio ajeno y copiar el link: la mitad de los
 * catalogos nuevos iban a quedar sin imagenes, que es justo lo que hace que
 * un catalogo se vea muerto.
 *
 * El camino principal es sacar la foto (en el telefono el input abre camara
 * o galeria). Pegar un enlace sigue existiendo, escondido detras de un
 * "o pegar un enlace": lo necesitan los tenants portados, cuyas imagenes
 * viven en el storage de los proyectos viejos.
 */
import { useState } from 'react';

export default function ImagePicker({
  value, onChange, onSubir, label = 'Foto', ayuda,
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [modoUrl, setModoUrl] = useState(false);

  // Sin uploader inyectado (admin legacy) se cae al input de URL de siempre,
  // en vez de mostrar un boton que no hace nada.
  const puedeSubir = typeof onSubir === 'function';

  const elegir = async (e) => {
    const file = e.target.files?.[0];
    // El value se limpia para que elegir DOS VECES el mismo archivo (tras un
    // error, por ejemplo) vuelva a disparar el change.
    e.target.value = '';
    if (!file) return;

    setSubiendo(true);
    setError(null);
    const r = await onSubir(file);
    setSubiendo(false);

    if (r?.__error) { setError(r.__error); return; }
    if (typeof r === 'string' && r) onChange(r);
  };

  return (
    <div>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--ag-ink-3)', marginBottom: 5 }}>
        {label}
      </span>

      {value ? (
        <div style={{
          position: 'relative', borderRadius: 12, overflow: 'hidden',
          background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)',
        }}>
          <img
            src={value}
            alt=""
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <button
            type="button"
            onClick={() => { onChange(''); setError(null); }}
            aria-label="Quitar la foto"
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 30, height: 30, borderRadius: 999,
              background: 'rgba(20,18,16,0.7)', color: '#fff',
              border: 0, cursor: 'pointer', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : (puedeSubir && !modoUrl) ? (
        <label
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '20px 12px', textAlign: 'center',
            borderRadius: 12, border: '1.5px dashed var(--ag-line)',
            background: 'var(--ag-bg-card)', color: 'var(--ag-ink-2)',
            cursor: subiendo ? 'wait' : 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span>{subiendo ? 'Subiendo…' : 'Sacar una foto o elegir del teléfono'}</span>
          {ayuda && !subiendo && (
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ag-ink-3)' }}>{ayuda}</span>
          )}
          {/* Sin `capture`: asi el navegador ofrece camara Y galeria. */}
          <input
            type="file" accept="image/*" style={{ display: 'none' }}
            onChange={elegir} disabled={subiendo}
          />
        </label>
      ) : (
        <input
          type="url" value={value || ''} placeholder="https://..."
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit',
            color: 'var(--ag-ink)', background: 'var(--ag-bg-card)',
            border: '1px solid var(--ag-line)', borderRadius: 'var(--ag-r-md, 10px)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--ag-c-orders)', marginTop: 6 }}>{error}</div>
      )}

      {puedeSubir && !value && (
        <button
          type="button"
          onClick={() => { setModoUrl(m => !m); setError(null); }}
          style={{
            background: 'none', border: 0, padding: '6px 0 0',
            color: 'var(--ag-ink-3)', fontSize: 11.5, fontFamily: 'inherit',
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          {modoUrl ? 'Mejor subir una foto' : 'o pegar un enlace'}
        </button>
      )}
    </div>
  );
}
