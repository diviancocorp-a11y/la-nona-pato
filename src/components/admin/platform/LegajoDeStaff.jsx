/**
 * El legajo del empleado de Dico.
 *
 * CUANDO APARECE
 * Apenas la persona fija su contraseña y entra por primera vez. Bloquea la
 * consola hasta que esté completo — no por burocracia: sin CUIL ni CBU no se
 * le puede liquidar el sueldo, y el momento en que alguien completa esos datos
 * es el único en que los tiene a mano.
 *
 * QUIEN LO VE
 * La persona y el dueño de la plataforma. Ni siquiera un administrador: un
 * administrador administra la plataforma, no el legajo de sus compañeros. Eso
 * está en RLS (migración 0054), no acá.
 *
 * LAS FOTOS DEL DOCUMENTO
 * Van a un bucket PRIVADO. Se guarda el PATH, no la URL — una URL firmada
 * vence, y guardar una vencida es guardar basura que parece un dato. Para
 * mostrarla se pide una URL nueva que dura cinco minutos.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchMiLegajo, guardarMiLegajo, subirArchivoDeLegajo, urlDeArchivo,
  validarArchivoDeLegajo,
} from '../../../services/platformStaff';
import { faltantesDelLegajo, legajoCompleto } from '../../../modules/legajo';

const C = {
  bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e',
  tx: '#f5f5f4', t2: '#a1a1aa', t3: '#71717a', ac: '#e8b947',
  ok: '#4ade80', warn: '#fbbf24', bad: '#f87171',
};

const input = {
  width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 14,
  background: '#111113', border: `1px solid ${C.line}`, color: C.tx,
  font: 'inherit', boxSizing: 'border-box',
};

function Campo({ etiqueta, ayuda, obligatorio, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12.5, color: C.t2 }}>
        {etiqueta}
        {obligatorio && <span style={{ color: C.ac }}> *</span>}
      </span>
      {children}
      {ayuda && <span style={{ fontSize: 11.5, color: C.t3, lineHeight: 1.4 }}>{ayuda}</span>}
    </label>
  );
}

function Seccion({ titulo, children, columnas = 2 }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.line}`,
      borderRadius: 12, padding: 16, display: 'grid', gap: 12,
    }}>
      <h2 style={{ fontSize: 14, margin: 0, letterSpacing: '-0.01em' }}>{titulo}</h2>
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: `repeat(auto-fit, minmax(${columnas === 1 ? 260 : 200}px, 1fr))`,
      }}>
        {children}
      </div>
    </section>
  );
}

/** Subir una foto del documento y verla. */
function Documento({ etiqueta, path, onSubir }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null);

  // La URL se pide cada vez y dura cinco minutos: guardarla sería dejar una
  // foto de un DNI alcanzable con un link suelto.
  useEffect(() => {
    let vivo = true;
    if (!path) { setVista(null); return undefined; }
    urlDeArchivo(path).then((u) => { if (vivo) setVista(u); });
    return () => { vivo = false; };
  }, [path]);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12.5, color: C.t2 }}>
        {etiqueta}<span style={{ color: C.ac }}> *</span>
      </span>

      <div style={{
        border: `1px dashed ${path ? C.ok : C.line}`, borderRadius: 10,
        padding: 10, display: 'grid', gap: 8, justifyItems: 'center',
      }}>
        {vista
          ? <img src={vista} alt={etiqueta} style={{ maxWidth: '100%', maxHeight: 130, borderRadius: 6 }} />
          : (
            <span style={{ fontSize: 12, color: path ? C.ok : C.t3, padding: '14px 0' }}>
              {path ? 'Cargado' : 'Sin cargar'}
            </span>
          )}

        <label style={{
          fontSize: 12, color: C.t2, cursor: subiendo ? 'wait' : 'pointer',
          border: `1px solid ${C.line}`, borderRadius: 7, padding: '5px 11px',
        }}>
          {subiendo ? 'Subiendo…' : path ? 'Cambiar' : 'Elegir archivo'}
          <input
            type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            disabled={subiendo}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              // El input se limpia SIEMPRE: si no, elegir el mismo archivo dos
              // veces seguidas no dispara el evento y parece que se colgó.
              e.target.value = '';
              if (!file) return;
              const problema = validarArchivoDeLegajo(file);
              if (problema) { setError(problema); return; }
              setError(null);
              setSubiendo(true);
              const r = await subirArchivoDeLegajo(file, etiqueta.toLowerCase().includes('dorso') ? 'dorso' : 'frente');
              setSubiendo(false);
              if (r.__error) { setError(r.__error); return; }
              onSubir(r.path);
            }}
          />
        </label>
      </div>

      {error && <span style={{ fontSize: 11.5, color: C.bad, lineHeight: 1.4 }}>{error}</span>}
    </div>
  );
}

export default function LegajoDeStaff({ email, puesto, onListo, onSalir }) {
  const [b, setB] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    const l = await fetchMiLegajo();
    setB(l || {});
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setB((x) => ({ ...x, [campo]: e.target.value }));

  if (b === null) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg, color: C.t2, padding: 40 }}>
        Cargando…
      </main>
    );
  }

  const faltan = faltantesDelLegajo(b);
  const completo = legajoCompleto(b);

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.tx,
      fontFamily: "'DM Sans', system-ui, sans-serif", padding: '20px 16px 60px',
    }}>
      <div style={{ maxWidth: 780, margin: '0 auto', display: 'grid', gap: 14 }}>
        <header>
          <h1 style={{ fontSize: 20, margin: 0, letterSpacing: '-0.01em' }}>Tu legajo</h1>
          <p style={{ fontSize: 13, color: C.t3, margin: '6px 0 0', lineHeight: 1.5 }}>
            {email}{puesto && ` · ${puesto}`}. Estos datos son los que hacen falta
            para liquidarte el sueldo. Los ve el dueño y nadie más del equipo.
          </p>
        </header>

        {!completo && (
          <div style={{
            fontSize: 12.5, padding: '10px 12px', borderRadius: 8, lineHeight: 1.5,
            background: 'rgba(251,191,36,0.10)', color: C.warn,
          }}>
            Faltan {faltan.length} {faltan.length === 1 ? 'dato' : 'datos'}: {faltan.join(', ')}.
          </div>
        )}

        {aviso && (
          <div style={{
            fontSize: 13, padding: '9px 12px', borderRadius: 8,
            background: 'rgba(232,185,71,0.10)', color: C.ac,
          }}>
            {aviso}
          </div>
        )}

        <Seccion titulo="Quién sos">
          <Campo etiqueta="Nombre y apellido" obligatorio>
            <input style={input} value={b.nombre_completo || ''} onChange={set('nombre_completo')} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" obligatorio>
            <input style={input} type="date" value={b.fecha_nacimiento || ''} onChange={set('fecha_nacimiento')} />
          </Campo>
          <Campo etiqueta="Tipo de documento" obligatorio>
            <select style={input} value={b.tipo_documento || ''} onChange={set('tipo_documento')}>
              <option value="">Elegir…</option>
              <option value="dni">DNI</option>
              <option value="le">Libreta de enrolamiento</option>
              <option value="lc">Libreta cívica</option>
              <option value="pasaporte">Pasaporte</option>
            </select>
          </Campo>
          <Campo etiqueta="Número de documento" obligatorio>
            <input style={input} inputMode="numeric" value={b.numero_documento || ''} onChange={set('numero_documento')} />
          </Campo>
          <Campo etiqueta="CUIL" obligatorio ayuda="Sin guiones o con guiones, da igual.">
            <input style={input} inputMode="numeric" value={b.cuil || ''} onChange={set('cuil')} />
          </Campo>
        </Seccion>

        <Seccion titulo="El documento">
          <Documento
            etiqueta="Frente" path={b.doc_frente_path}
            onSubir={(p) => setB((x) => ({ ...x, doc_frente_path: p }))}
          />
          <Documento
            etiqueta="Dorso" path={b.doc_dorso_path}
            onSubir={(p) => setB((x) => ({ ...x, doc_dorso_path: p }))}
          />
        </Seccion>

        <Seccion titulo="Dónde vivís">
          <Campo etiqueta="Calle" obligatorio>
            <input style={input} value={b.calle || ''} onChange={set('calle')} />
          </Campo>
          <Campo etiqueta="Altura" obligatorio>
            <input style={input} value={b.altura || ''} onChange={set('altura')} />
          </Campo>
          <Campo etiqueta="Piso / depto">
            <input style={input} value={b.piso_depto || ''} onChange={set('piso_depto')} />
          </Campo>
          <Campo etiqueta="Localidad" obligatorio>
            <input style={input} value={b.localidad || ''} onChange={set('localidad')} />
          </Campo>
          <Campo etiqueta="Provincia" obligatorio>
            <input style={input} value={b.provincia || ''} onChange={set('provincia')} />
          </Campo>
          <Campo etiqueta="Código postal" obligatorio>
            <input style={input} value={b.codigo_postal || ''} onChange={set('codigo_postal')} />
          </Campo>
        </Seccion>

        <Seccion titulo="Cómo ubicarte">
          <Campo etiqueta="Teléfono" obligatorio>
            <input style={input} inputMode="tel" value={b.telefono || ''} onChange={set('telefono')} />
          </Campo>
          <Campo etiqueta="Contacto de emergencia" obligatorio ayuda="A quién llamar si te pasa algo.">
            <input style={input} value={b.emergencia_nombre || ''} onChange={set('emergencia_nombre')} />
          </Campo>
          <Campo etiqueta="Teléfono de esa persona" obligatorio>
            <input style={input} inputMode="tel" value={b.emergencia_telefono || ''} onChange={set('emergencia_telefono')} />
          </Campo>
        </Seccion>

        <Seccion titulo="Dónde cobrás">
          <Campo etiqueta="CBU o CVU" obligatorio ayuda="22 dígitos.">
            <input style={input} inputMode="numeric" value={b.cbu || ''} onChange={set('cbu')} />
          </Campo>
          <Campo etiqueta="Alias">
            <input style={input} value={b.alias_bancario || ''} onChange={set('alias_bancario')} />
          </Campo>
          <Campo etiqueta="Banco">
            <input style={input} value={b.banco || ''} onChange={set('banco')} />
          </Campo>
          <Campo
            etiqueta="Titular de la cuenta" obligatorio
            ayuda="Si la cuenta no está a tu nombre, aclaralo acá."
          >
            <input style={input} value={b.titular_cuenta || ''} onChange={set('titular_cuenta')} />
          </Campo>
        </Seccion>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button" disabled={guardando}
            onClick={async () => {
              setGuardando(true);
              const r = await guardarMiLegajo(b);
              setGuardando(false);
              if (r.__error) { setAviso(r.message); return; }
              setB(r.legajo || b);
              // Sólo se sale cuando el SERVIDOR dice que está completo. Que el
              // navegador lo decidiera sería dejar entrar con el legajo a medias.
              if (r.legajo?.completado_at) onListo();
              else setAviso('Guardado. Todavía faltan datos para poder entrar.');
            }}
            style={{
              padding: '11px 22px', borderRadius: 9, border: 'none', font: 'inherit',
              fontSize: 14, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer',
              background: C.ac, color: '#111',
            }}
          >
            {guardando ? 'Guardando…' : completo ? 'Guardar y entrar' : 'Guardar'}
          </button>

          {/* Se puede guardar a medias y volver: los datos del legajo no
              siempre los tenés todos a mano en el mismo momento. Lo que no se
              puede es ENTRAR a medias. */}
          <span style={{ fontSize: 12, color: C.t3 }}>
            Podés guardar incompleto y seguir después.
          </span>

          {onSalir && (
            <button
              type="button" onClick={onSalir}
              style={{
                marginLeft: 'auto', border: `1px solid ${C.line}`, background: 'transparent',
                color: C.t3, borderRadius: 8, padding: '8px 14px',
                font: 'inherit', fontSize: 12.5, cursor: 'pointer',
              }}
            >
              Salir
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
