/**
 * MapaDeMesas — el plano del salon (Etapa 6c).
 *
 * Dos modos sobre el MISMO plano, y esa es la decision de diseño:
 *
 *   servicio  lo que se usa todos los dias. Cada mesa muestra si esta libre,
 *             reservada u ocupada. Se toca y se opera.
 *   editar    se arrastra para acomodar el salon. Se entra a proposito.
 *
 * Tener dos pantallas separadas obligaria a mantener dos dibujos iguales y a
 * que el mozo aprenda dos vistas del mismo salon. Y dejar el arrastre siempre
 * activo haria que cualquier toque torcido en un telefono mueva una mesa en
 * medio del servicio.
 *
 * El plano es OPCIONAL: una mesa sin pos_x/pos_y existe igual y se reserva
 * igual. Aparece en una bandeja abajo para colocarla cuando el negocio quiera.
 * Obligar a dibujar el salon antes de tomar la primera reserva seria absurdo.
 *
 * Coordenadas en PORCENTAJE, no en pixeles: el mismo plano se ve en el monitor
 * del mostrador y en el telefono del mozo.
 *
 * ZONAS: UN PLANO POR ZONA, NO UN PLANO CON ZONAS ADENTRO
 * Los porcentajes son relativos a la zona, no al local. Un salon de cuatro
 * zonas dibujado en un lienzo unico le da un cuarto de pantalla a cada una y
 * en un telefono las mesas quedan del tamanio de una moneda. Con una pestania
 * por zona, cada zona usa el ancho completo.
 *
 * Esto se decidio ANTES de que nadie dibujara su salon a proposito: cambiarlo
 * despues invalida las coordenadas ya guardadas —una mesa al 80% del local no
 * esta al 80% del patio— y obliga al cliente a redibujar todo a mano.
 *
 * Las pestanias aparecen recien con dos zonas. Un bar de ocho mesas no tiene
 * por que enterarse de que las zonas existen.
 */
import { useState, useRef, useCallback, useMemo } from 'react';

// Los estados que puede tener una mesa AHORA. El color es lo que se lee de
// lejos; el texto esta igual porque el color solo no es accesible.
// Las mesas que el negocio no asigno a ninguna zona necesitan un lugar donde
// caer: sin esto desaparecerian del plano en cuanto exista una segunda zona.
const SIN_ZONA = 'Sin zona';

const ESTADOS = {
  libre:     { label: 'Libre',     bg: 'var(--ag-ok-bg, #e8f5e9)',  fg: 'var(--ag-ok, #2e7d32)',  borde: '#4caf50' },
  reservada: { label: 'Reservada', bg: 'var(--ag-warn-bg, #fff8e1)', fg: 'var(--ag-warn, #ef6c00)', borde: '#ffb300' },
  ocupada:   { label: 'Ocupada',   bg: 'var(--ag-bad-bg, #ffebee)',  fg: 'var(--ag-bad, #c62828)',  borde: '#e53935' },
};

/** En que esta esta mesa segun sus reservas de hoy. */
function estadoDe(recurso, reservas) {
  const suyas = reservas.filter(r => r.resource_id === recurso.id);
  if (suyas.some(r => r.status === 'arrived' || r.status === 'in_service')) return 'ocupada';
  if (suyas.some(r => r.status === 'booked' || r.status === 'confirmed')) return 'reservada';
  return 'libre';
}

function Mesa({ recurso, estado, editando, seleccionada, onPointerDown, onClick }) {
  const e = ESTADOS[estado] || ESTADOS.libre;
  const redonda = recurso.shape === 'round';
  return (
    <button
      type="button"
      onPointerDown={editando ? onPointerDown : undefined}
      onClick={onClick}
      aria-label={`${recurso.name}, ${recurso.capacity} lugares, ${e.label}`}
      style={{
        position: 'absolute',
        left: `${recurso.pos_x}%`,
        top: `${recurso.pos_y}%`,
        transform: 'translate(-50%, -50%)',
        width: recurso.width || 74,
        height: recurso.height || (redonda ? 74 : 56),
        borderRadius: redonda ? '50%' : 10,
        background: e.bg,
        color: e.fg,
        border: `2px solid ${seleccionada ? 'var(--ag-ink, #111)' : e.borde}`,
        boxShadow: seleccionada ? '0 0 0 3px rgba(0,0,0,0.12)' : 'none',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 1,
        font: 'inherit', fontWeight: 650, fontSize: 13,
        cursor: editando ? 'grab' : 'pointer',
        // Sin esto, arrastrar en un telefono scrollea la pagina en vez de
        // mover la mesa.
        touchAction: editando ? 'none' : 'auto',
        userSelect: 'none',
      }}
    >
      <span>{recurso.name}</span>
      <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 500 }}>
        {recurso.capacity} {recurso.capacity === 1 ? 'lugar' : 'lugares'}
      </span>
    </button>
  );
}

export default function MapaDeMesas({
  recursos = [],
  reservas = [],
  utilizacion = null,
  onMover,          // (id, {pos_x, pos_y}) -> Promise<boolean>
  onSeleccionar,    // (recurso) -> void
  onNuevo,          // () -> void
  terminologia = { plural: 'Mesas', singular: 'mesa' },
}) {
  const [editando, setEditando] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);
  const [zonaActiva, setZonaActiva] = useState(null);
  const lienzo = useRef(null);
  const arrastre = useRef(null);

  // Las zonas salen de TODOS los recursos, no solo de los que estan en el
  // plano: una mesa recien creada todavia no tiene posicion y su zona tiene
  // que existir igual, o la pestania desaparece mientras se la esta cargando.
  const zonas = useMemo(
    () => [...new Set(recursos.map(r => r.zone).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es')),
    [recursos]);

  const haySinZona = useMemo(() => recursos.some(r => !r.zone), [recursos]);
  // Con una sola zona no hay nada que elegir, y las pestanias solo estorban.
  const pestanias = zonas.length + (haySinZona ? 1 : 0) > 1
    ? [...zonas, ...(haySinZona ? [SIN_ZONA] : [])]
    : [];

  // La zona elegida deja de existir cuando se renombra o se vacia la ultima
  // mesa: sin este ajuste el plano queda en blanco sin explicacion.
  const zonaVigente = pestanias.length
    ? (pestanias.includes(zonaActiva) ? zonaActiva : pestanias[0])
    : null;

  // Sin pestanias no hay zona "abierta", pero eso NO quiere decir que la mesa
  // nueva vaya sin zona: si el local tiene una sola, la hereda. Mandar null
  // ahi le crearia al negocio una pestania "Sin zona" con la mesa que acaba de
  // cargar, que es justo lo que las zonas venian a evitar.
  const zonaParaNueva = zonaVigente === SIN_ZONA ? null
    : (zonaVigente ?? (zonas.length === 1 ? zonas[0] : null));

  const { colocados, sinColocar } = useMemo(() => {
    const deLaZona = zonaVigente === null
      ? recursos
      : recursos.filter(r => (r.zone || SIN_ZONA) === zonaVigente);
    return {
      colocados: deLaZona.filter(r => r.pos_x != null && r.pos_y != null),
      sinColocar: deLaZona.filter(r => r.pos_x == null || r.pos_y == null),
    };
  }, [recursos, zonaVigente]);

  // El arrastre se sigue con pointer events y setPointerCapture: asi el gesto
  // no se pierde si el dedo sale de la mesa, que en un telefono pasa siempre.
  const alTomar = useCallback((recurso) => (ev) => {
    if (!lienzo.current) return;
    ev.preventDefault();
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    arrastre.current = { id: recurso.id, movido: false };
    setSeleccionada(recurso.id);

    const mover = (e) => {
      const caja = lienzo.current.getBoundingClientRect();
      // Se clampea a [2, 98] para que una mesa no quede medio afuera del plano
      // y sin forma de volver a agarrarla.
      const x = Math.min(98, Math.max(2, ((e.clientX - caja.left) / caja.width) * 100));
      const y = Math.min(98, Math.max(2, ((e.clientY - caja.top) / caja.height) * 100));
      arrastre.current.pos = { pos_x: Math.round(x * 10) / 10, pos_y: Math.round(y * 10) / 10 };
      arrastre.current.movido = true;
      const el = lienzo.current.querySelector(`[data-mesa="${recurso.id}"]`);
      if (el) { el.style.left = `${x}%`; el.style.top = `${y}%`; }
    };

    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      const a = arrastre.current;
      arrastre.current = null;
      // Solo se persiste si de verdad se movio: un toque simple no tiene por
      // que escribir en la base.
      if (a?.movido && a.pos) onMover?.(a.id, a.pos);
    };

    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  }, [onMover]);

  // Tocar un lugar vacio del plano crea la mesa AHI. Cargar un salon son veinte
  // mesas: hacer "boton -> formulario -> bandeja -> arrastrar" veinte veces
  // cansa a la tercera, y ademas deja la posicion sin poner.
  const crearAca = useCallback((ev) => {
    if (!editando || !onNuevo || !lienzo.current) return;
    // Solo el lienzo: un toque sobre una mesa es para agarrarla, no para
    // crear otra encima.
    if (ev.target !== lienzo.current) return;
    const caja = lienzo.current.getBoundingClientRect();
    const x = ((ev.clientX - caja.left) / caja.width) * 100;
    const y = ((ev.clientY - caja.top) / caja.height) * 100;
    onNuevo({
      pos_x: Math.round(Math.min(98, Math.max(2, x)) * 10) / 10,
      pos_y: Math.round(Math.min(98, Math.max(2, y)) * 10) / 10,
      // La zona no se pregunta: se hereda de la pestania que esta abierta.
      zone: zonaParaNueva,
    });
  }, [editando, onNuevo, zonaParaNueva]);

  const wrap = { display: 'grid', gap: 14 };

  return (
    <section style={wrap} className="cp-root">
      {/* ── Barra: utilizacion + modo ── */}
      <header style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {utilizacion && (
          <div style={{
            display: 'flex', gap: 14, alignItems: 'baseline',
            padding: '8px 12px', borderRadius: 10,
            background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
          }}>
            <strong style={{ fontSize: 20 }}>{utilizacion.utilizacion_pct ?? 0}%</strong>
            <span style={{ fontSize: 12.5, color: 'var(--ag-ink-3, #666)' }}>
              {/* Lo que importa no es lo vendido: es lo que quedo sin vender. */}
              de tu capacidad usada · {Math.max(0,
                (Number(utilizacion.horas_disponibles) || 0) -
                (Number(utilizacion.horas_vendidas) || 0)).toFixed(0)} h libres
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          // Sin posicion: cae en la bandeja. Es el camino para cargar las mesas
          // sin dibujar el plano, que sigue siendo valido.
          onClick={() => onNuevo?.({ zone: zonaParaNueva })}
          style={{
            padding: '8px 13px', borderRadius: 9, cursor: 'pointer', font: 'inherit',
            border: '1px solid var(--ag-line, rgba(0,0,0,0.15))',
            background: 'transparent', color: 'inherit',
          }}
        >
          + Nueva {terminologia.singular}
        </button>
        <button
          type="button" onClick={() => { setEditando(v => !v); setSeleccionada(null); }}
          aria-pressed={editando}
          style={{
            padding: '8px 13px', borderRadius: 9, cursor: 'pointer', font: 'inherit',
            border: `1px solid ${editando ? 'transparent' : 'var(--ag-line, rgba(0,0,0,0.15))'}`,
            background: editando ? 'var(--ag-accent, #e8b947)' : 'transparent',
            color: editando ? '#1a1a1a' : 'inherit', fontWeight: editando ? 650 : 400,
          }}
        >
          {editando ? 'Listo' : 'Acomodar salón'}
        </button>
      </header>

      {pestanias.length > 0 && (
        <div
          role="tablist" aria-label="Zonas del local"
          style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}
        >
          {pestanias.map(z => {
            const activa = z === zonaVigente;
            return (
              <button
                key={z} type="button" role="tab" aria-selected={activa}
                onClick={() => { setZonaActiva(z); setSeleccionada(null); }}
                style={{
                  padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                  font: 'inherit', fontSize: 13.5, fontWeight: activa ? 650 : 400,
                  border: activa ? '1px solid transparent' : '1px solid var(--ag-line, rgba(0,0,0,0.15))',
                  background: activa ? 'var(--ag-ink, #1a1a1a)' : 'transparent',
                  color: activa ? '#fff' : 'inherit',
                }}
              >
                {z}
              </button>
            );
          })}
        </div>
      )}

      {editando && (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ag-ink-3, #666)' }}>
          Arrastrá las {terminologia.plural.toLowerCase()} para acomodarlas como están en tu local,
          o tocá un lugar vacío para agregar una. Se guarda solo.
        </p>
      )}

      {/* ── El plano ── */}
      <div
        ref={lienzo}
        onClick={crearAca}
        style={{
          position: 'relative',
          width: '100%',
          // Relacion fija para que el plano se vea igual en cualquier pantalla:
          // las posiciones son porcentajes de ESTA caja.
          aspectRatio: '16 / 10',
          minHeight: 260,
          borderRadius: 14,
          background: editando
            ? 'repeating-linear-gradient(0deg, transparent 0 23px, rgba(0,0,0,0.05) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(0,0,0,0.05) 23px 24px)'
            : 'var(--ag-surface-2, rgba(0,0,0,0.03))',
          border: '1px solid var(--ag-line, rgba(0,0,0,0.12))',
          overflow: 'hidden',
        }}
      >
        {colocados.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            textAlign: 'center', padding: 20, color: 'var(--ag-ink-3, #666)', fontSize: 14,
            // Sin esto el cartel se come el toque y no se puede crear la
            // primera mesa justo cuando el plano esta vacio.
            pointerEvents: 'none',
          }}>
            <div>
              <div style={{ fontSize: 30, marginBottom: 6 }}>🗺️</div>
              Todavía no dibujaste tu salón.<br />
              {editando
                ? <>Tocá donde va la primera {terminologia.singular}.</>
                : <>Tocá <strong>Acomodar salón</strong> para empezar.</>}
            </div>
          </div>
        )}

        {colocados.map(r => (
          <div key={r.id} data-mesa={r.id} style={{ position: 'absolute', left: `${r.pos_x}%`, top: `${r.pos_y}%` }}>
            <Mesa
              recurso={{ ...r, pos_x: 0, pos_y: 0 }}
              estado={estadoDe(r, reservas)}
              editando={editando}
              seleccionada={seleccionada === r.id}
              onPointerDown={alTomar(r)}
              onClick={() => { if (!editando) onSeleccionar?.(r); }}
            />
          </div>
        ))}
      </div>

      {/* ── Bandeja: lo que existe pero todavia no esta en el plano ── */}
      {sinColocar.length > 0 && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--ag-ink-3, #666)', marginBottom: 7 }}>
            Sin ubicar en el plano ({sinColocar.length}). Se pueden reservar igual.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {sinColocar.map(r => (
              <button
                key={r.id} type="button" onClick={() => onSeleccionar?.(r)}
                style={{
                  padding: '7px 11px', borderRadius: 9, cursor: 'pointer', font: 'inherit',
                  fontSize: 13, background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
                  border: '1px dashed var(--ag-line, rgba(0,0,0,0.2))', color: 'inherit',
                }}
              >
                {r.name} · {r.capacity}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Referencia de colores ── */}
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ag-ink-3, #666)' }}>
        {Object.entries(ESTADOS).map(([k, v]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3,
              background: v.bg, border: `1.5px solid ${v.borde}`,
            }} />
            {v.label}
          </span>
        ))}
      </div>
    </section>
  );
}
