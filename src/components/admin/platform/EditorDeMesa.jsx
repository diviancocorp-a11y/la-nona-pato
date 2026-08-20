/**
 * EditorDeMesa — alta y edicion de un recurso del plano (Etapa 6c).
 *
 * CARGAR UN SALON ES CARGAR VEINTE, NO UNA
 * Ese es el criterio que ordena todo el formulario. Por eso el nombre viene
 * autoincrementado y la forma, la capacidad y la zona se heredan de la ultima
 * mesa cargada: sentar veinte mesas de cuatro tiene que ser tocar el plano y
 * confirmar, no completar veinte formularios iguales.
 *
 * LA ZONA SE ELIGE, NO SE ESCRIBE
 * Mientras exista al menos una, la zona sale de una lista. Escribirla libre
 * cada vez produce "Patio", "patio" y "PATIO" como tres zonas distintas, y eso
 * despues no lo limpia nadie: quedan tres pestañas con una mesa cada una.
 * Crear una zona nueva sigue estando a un toque, pero es un acto deliberado.
 *
 * LO DE ADENTRO Y LO DE ABAJO
 * Nombre, lugares y forma son lo que se toca siempre y estan a la vista. Los
 * limites de grupo y el combinable son de un local que ya afino su operacion:
 * van plegados, porque un formulario con seis campos para cargar una mesa
 * hace que el salon no se cargue nunca.
 *
 * BORRAR ES DESACTIVAR
 * `archiveResource` da de baja logica: las reservas viejas apuntan a la mesa y
 * borrarla de verdad dejaria el historial sin poder decir donde se sento nadie.
 */
import { useState, useEffect, useMemo } from 'react';

const FORMAS = [
  { id: 'round', label: 'Redonda' },
  { id: 'square', label: 'Cuadrada' },
  { id: 'rect', label: 'Rectangular' },
];

const NUEVA = '__nueva__';

// La miniatura de la forma. Un nombre sin dibujo obliga a imaginarse la mesa.
function Figura({ forma, activa }) {
  const redonda = forma === 'round';
  const ancha = forma === 'rect';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width: ancha ? 40 : 26, height: 26,
        borderRadius: redonda ? '50%' : 5,
        border: `2px solid ${activa ? 'var(--ag-ink, #111)' : 'var(--ag-ink-3, #999)'}`,
        background: activa ? 'var(--ag-accent-soft, rgba(232,185,71,0.22))' : 'transparent',
        margin: '0 auto 6px',
      }}
    />
  );
}

export default function EditorDeMesa({
  recurso,                 // el que se edita, o el borrador con pos y zona
  zonas = [],              // las que ya existen en este local
  terminologia = { singular: 'mesa' },
  onGuardar,               // (datos) -> Promise<{ok} | {__error}>
  onArchivar,              // (id) -> Promise<boolean>
  onCerrar,
}) {
  const esNueva = !recurso?.id;
  const [nombre, setNombre] = useState('');
  const [capacidad, setCapacidad] = useState(4);
  const [forma, setForma] = useState('round');
  const [zona, setZona] = useState('');
  const [zonaNueva, setZonaNueva] = useState('');
  const [minParty, setMinParty] = useState('');
  const [maxParty, setMaxParty] = useState('');
  const [combinable, setCombinable] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  useEffect(() => {
    if (!recurso) return;
    setNombre(recurso.name || '');
    setCapacidad(Number(recurso.capacity) || 4);
    setForma(recurso.shape || 'round');
    setZona(recurso.zone || '');
    setZonaNueva('');
    setMinParty(recurso.min_party ?? '');
    setMaxParty(recurso.max_party ?? '');
    setCombinable(!!recurso.combinable);
    setError(null);
    setConfirmandoBaja(false);
  }, [recurso]);

  const zonaFinal = zona === NUEVA ? zonaNueva.trim() : zona;

  const opcionesZona = useMemo(() => {
    const set = [...new Set([...zonas, recurso?.zone].filter(Boolean))];
    return set.sort((a, b) => a.localeCompare(b, 'es'));
  }, [zonas, recurso?.zone]);

  const puedeGuardar = !!String(nombre).trim() && !guardando
    && (zona !== NUEVA || !!zonaNueva.trim());

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const r = await onGuardar?.({
      ...recurso,
      name: String(nombre).trim(),
      capacity: Number(capacidad) || 1,
      shape: forma,
      zone: zonaFinal || null,
      min_party: minParty === '' ? null : Number(minParty),
      max_party: maxParty === '' ? null : Number(maxParty),
      combinable,
    });
    setGuardando(false);
    if (r?.__error) { setError(r.message); return; }
    onCerrar?.();
  };

  if (!recurso) return null;

  const campo = {
    width: '100%', padding: '11px 13px', borderRadius: 9, fontSize: 16,
    background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
    border: '1px solid var(--ag-line, rgba(0,0,0,0.15))',
    color: 'inherit', boxSizing: 'border-box', font: 'inherit',
  };
  const etiqueta = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 };

  return (
    <div
      className="cp-root"
      role="dialog"
      aria-modal="true"
      aria-label={esNueva ? `Nueva ${terminologia.singular}` : `Editar ${recurso.name}`}
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--ag-surface, #fffdf7)', color: 'var(--ag-ink, #1a1a1a)',
          borderRadius: '16px 16px 0 0', padding: '18px 18px 24px',
          display: 'grid', gap: 14, boxSizing: 'border-box',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 16 }}>
            {esNueva ? `Nueva ${terminologia.singular}` : `${terminologia.singular} ${recurso.name}`}
          </strong>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            style={{
              border: 'none', background: 'transparent', font: 'inherit',
              fontSize: 22, cursor: 'pointer', color: 'inherit', lineHeight: 1,
            }}
          >
            {'×'}
          </button>
        </header>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: '1 1 45%' }}>
            <span style={etiqueta}>Número o nombre</span>
            <input
              style={campo} value={nombre} autoFocus={esNueva}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="12"
            />
          </label>

          <label style={{ flex: '1 1 55%' }}>
            <span style={etiqueta}>Lugares</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <button
                type="button" aria-label="Menos lugares"
                onClick={() => setCapacidad(c => Math.max(1, Number(c) - 1))}
                style={{ ...campo, width: 44, cursor: 'pointer', fontSize: 19, padding: 0 }}
              >
                −
              </button>
              <input
                style={{ ...campo, textAlign: 'center' }} inputMode="numeric" value={capacidad}
                onChange={(e) => setCapacidad(e.target.value.replace(/\D/g, '') || 1)}
                aria-label="Cantidad de lugares"
              />
              <button
                type="button" aria-label="Más lugares"
                onClick={() => setCapacidad(c => Number(c) + 1)}
                style={{ ...campo, width: 44, cursor: 'pointer', fontSize: 19, padding: 0 }}
              >
                +
              </button>
            </div>
          </label>
        </div>

        <div>
          <span style={etiqueta}>Forma</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {FORMAS.map(f => (
              <button
                key={f.id} type="button" onClick={() => setForma(f.id)}
                aria-pressed={forma === f.id}
                style={{
                  flex: 1, padding: '12px 6px', borderRadius: 11, cursor: 'pointer',
                  font: 'inherit', fontSize: 13,
                  fontWeight: forma === f.id ? 700 : 500,
                  border: forma === f.id
                    ? '2px solid var(--ag-accent, #e8b947)'
                    : '1px solid var(--ag-line, rgba(0,0,0,0.15))',
                  background: 'transparent', color: 'inherit',
                }}
              >
                <Figura forma={f.id} activa={forma === f.id} />
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span style={etiqueta}>Zona</span>
          {opcionesZona.length === 0 ? (
            <input
              style={campo} value={zonaNueva || zona}
              onChange={(e) => { setZona(e.target.value); setZonaNueva(''); }}
              placeholder="Adentro, patio, terraza... (opcional)"
            />
          ) : (
            <select
              style={campo} value={zona}
              onChange={(e) => setZona(e.target.value)}
            >
              <option value="">Sin zona</option>
              {opcionesZona.map(z => <option key={z} value={z}>{z}</option>)}
              <option value={NUEVA}>+ Zona nueva…</option>
            </select>
          )}
          {zona === NUEVA && (
            <input
              style={{ ...campo, marginTop: 8 }} value={zonaNueva} autoFocus
              onChange={(e) => setZonaNueva(e.target.value)}
              placeholder="Nombre de la zona"
              aria-label="Nombre de la zona nueva"
            />
          )}
        </div>

        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ag-ink-3, #666)' }}>
            Límites de grupo
          </summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ag-ink-3, #666)' }}>
              Sirven para que la asignación automática no siente a dos personas
              en una mesa de seis un viernes a la noche.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1 }}>
                <span style={etiqueta}>Mínimo</span>
                <input
                  style={campo} inputMode="numeric" value={minParty}
                  onChange={(e) => setMinParty(e.target.value.replace(/\D/g, ''))}
                  placeholder="—"
                />
              </label>
              <label style={{ flex: 1 }}>
                <span style={etiqueta}>Máximo</span>
                <input
                  style={campo} inputMode="numeric" value={maxParty}
                  onChange={(e) => setMaxParty(e.target.value.replace(/\D/g, ''))}
                  placeholder="—"
                />
              </label>
            </div>
            <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5 }}>
              <input
                type="checkbox" checked={combinable} style={{ marginTop: 3 }}
                onChange={(e) => setCombinable(e.target.checked)}
              />
              <span>
                Se puede combinar con otra
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ag-ink-3, #666)' }}>
                  Dos de cuatro que se juntan para ocho.
                </span>
              </span>
            </label>
          </div>
        </details>

        {error && <div style={{ fontSize: 13, color: 'var(--ag-bad, #c62828)' }}>{error}</div>}

        <button
          type="button" onClick={guardar} disabled={!puedeGuardar}
          style={{
            padding: '14px', borderRadius: 11, font: 'inherit', fontSize: 15.5,
            fontWeight: 700, border: 'none',
            cursor: puedeGuardar ? 'pointer' : 'not-allowed',
            opacity: puedeGuardar ? 1 : 0.5,
            background: 'var(--ag-accent, #e8b947)', color: '#1a1a1a',
          }}
        >
          {guardando ? 'Guardando…' : esNueva ? 'Agregar al plano' : 'Guardar'}
        </button>

        {!esNueva && onArchivar && (
          <button
            type="button"
            onClick={async () => {
              // Dos pasos: la baja no se deshace desde esta pantalla.
              if (!confirmandoBaja) { setConfirmandoBaja(true); return; }
              const ok = await onArchivar(recurso.id);
              if (ok) onCerrar?.();
              else setError('No se pudo dar de baja.');
            }}
            style={{
              padding: '11px', borderRadius: 10, font: 'inherit', fontSize: 14,
              cursor: 'pointer', background: 'transparent',
              border: `1px solid ${confirmandoBaja ? 'var(--ag-bad, #c62828)' : 'var(--ag-line, rgba(0,0,0,0.15))'}`,
              color: confirmandoBaja ? 'var(--ag-bad, #c62828)' : 'var(--ag-ink-3, #666)',
            }}
          >
            {confirmandoBaja
              ? '¿Seguro? Tocá de nuevo para darla de baja'
              : `Dar de baja esta ${terminologia.singular}`}
          </button>
        )}
      </section>
    </div>
  );
}
