/**
 * El legajo de quien se incorpora al equipo de Dico.
 *
 * CUANDO APARECE
 * Apenas la persona fija su contraseña y entra por primera vez. Bloquea la
 * consola hasta que esté completo — no por burocracia: sin identificación
 * fiscal ni cuenta no se le puede pagar, y el momento en que alguien tiene
 * esos datos a mano es este.
 *
 * NO SE LE PIDE AL DUEÑO. Si el legajo lo bloqueara a él y algo fallara
 * subiendo el documento, el único que puede administrar accesos quedaría
 * afuera y no habría quien lo destrabe. Mismo criterio que 0053 con "al dueño
 * no se lo puede quitar".
 *
 * SE ADAPTA AL PAIS Y A LA MODALIDAD
 * El país decide el documento, cómo se llama la identificación fiscal y qué
 * datos de cobro existen. El tipo de documento decide si hay dorso. La
 * modalidad decide si hace falta el domicilio. Todo eso vive en
 * `src/modules/documentacionPorPais.js` y `src/modules/legajo.js`; acá sólo
 * se dibuja.
 *
 * QUIEN LO VE
 * La persona y el dueño de la plataforma. Ni siquiera un administrador. Eso
 * está en RLS (migración 0054), no acá.
 *
 * LAS FOTOS DEL DOCUMENTO
 * Bucket privado. Se guarda el PATH, no la URL — una URL firmada vence, y
 * guardar una vencida es guardar basura que parece un dato.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchMiLegajo, guardarMiLegajo, subirArchivoDeLegajo, urlDeArchivo,
  validarArchivoDeLegajo,
} from '../../../services/platformStaff';
import {
  faltantesDelLegajo, legajoCompleto, titularSugerido, campoDeCobro,
  MODALIDAD_POR_DEFECTO,
} from '../../../modules/legajo';
import {
  PAIS_POR_DEFECTO, paisesParaLegajo, documentosDe, tieneDorso,
  etiquetaFiscal, camposDeCobro, erroresDeFormato,
} from '../../../modules/documentacionPorPais';

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

/**
 * Un campo.
 *
 * `alignSelf: end` es lo que mantiene todas las casillas de una fila a la
 * misma altura: sin eso, una etiqueta que ocupa dos renglones empuja su input
 * hacia abajo y la grilla queda escalonada.
 */
function Campo({ etiqueta, ayuda, obligatorio, error, children }) {
  return (
    <label style={{
      display: 'grid', gap: 5, alignContent: 'end', gridTemplateRows: 'auto auto auto',
    }}>
      <span style={{ fontSize: 12.5, color: C.t2 }}>
        {etiqueta}
        {obligatorio && <span style={{ color: C.ac }}> *</span>}
      </span>
      {children}
      <span style={{ fontSize: 11.5, color: error ? C.bad : C.t3, lineHeight: 1.4, minHeight: 1 }}>
        {error || ayuda || ''}
      </span>
    </label>
  );
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.line}`,
      borderRadius: 12, padding: 16, display: 'grid', gap: 12,
    }}>
      <div>
        <h2 style={{ fontSize: 14, margin: 0, letterSpacing: '-0.01em' }}>{titulo}</h2>
        {descripcion && (
          <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0', lineHeight: 1.45 }}>
            {descripcion}
          </p>
        )}
      </div>
      <div style={{
        display: 'grid', gap: 12, alignItems: 'end',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      }}>
        {children}
      </div>
    </section>
  );
}

/**
 * La foto de perfil. Opcional.
 *
 * Es una cara, no un documento: sirve para que en una lista de ocho personas se
 * sepa quien es quien de un vistazo. Nada depende de ella, y por eso no entra
 * en "esta completo" — trabar una incorporacion por una foto de perfil seria
 * trabarla por lo unico que no importa.
 *
 * Va igual al bucket privado que el documento. Podria ser publica, pero un
 * segundo bucket con otras policies es una segunda superficie donde
 * equivocarse.
 */
function Burbuja({ path, onSubir }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!path) { setVista(null); return undefined; }
    urlDeArchivo(path).then((u) => { if (vivo) setVista(u); });
    return () => { vivo = false; };
  }, [path]);

  return (
    <label style={{
      display: 'grid', justifyItems: 'center', gap: 6,
      cursor: subiendo ? 'wait' : 'pointer',
    }}>
      <span style={{
        width: 76, height: 76, borderRadius: '50%', overflow: 'hidden',
        border: `1px solid ${vista ? C.line : 'transparent'}`,
        outline: vista ? 'none' : `1px dashed ${C.line}`,
        background: '#111113', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {vista
          ? <img src={vista} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22, color: C.t3 }}>+</span>}
      </span>
      <span style={{ fontSize: 11.5, color: C.t3, textAlign: 'center' }}>
        {subiendo ? 'Subiendo…' : vista ? 'Cambiar foto' : 'Foto (opcional)'}
      </span>
      {error && (
        <span style={{ fontSize: 11, color: C.bad, maxWidth: 130, textAlign: 'center' }}>
          {error}
        </span>
      )}
      <input
        type="file" accept="image/*" style={{ display: 'none' }} disabled={subiendo}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const problema = validarArchivoDeLegajo(file);
          if (problema) { setError(problema); return; }
          setError(null);
          setSubiendo(true);
          const r = await subirArchivoDeLegajo(file, 'perfil');
          setSubiendo(false);
          if (r.__error) { setError(r.__error); return; }
          onSubir(r.path);
        }}
      />
    </label>
  );
}

/**
 * La foto de una cara del documento.
 *
 * `capture="environment"` abre la cámara trasera directamente en el teléfono,
 * en vez del explorador de archivos. Es donde se completa esto: nadie tiene
 * una foto del dorso de su documento guardada esperando a que se la pidan.
 * En una computadora el navegador lo ignora y cae en el selector de archivos,
 * que ahí es lo correcto.
 */
function Documento({ etiqueta, path, obligatorio, onSubir }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null);

  // La URL se pide cada vez y dura cinco minutos: guardarla dejaría la imagen
  // de un documento alcanzable con un link suelto.
  useEffect(() => {
    let vivo = true;
    if (!path) { setVista(null); return undefined; }
    urlDeArchivo(path).then((u) => { if (vivo) setVista(u); });
    return () => { vivo = false; };
  }, [path]);

  return (
    <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
      <span style={{ fontSize: 12.5, color: C.t2 }}>
        {etiqueta}{obligatorio && <span style={{ color: C.ac }}> *</span>}
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
          {subiendo ? 'Subiendo…' : path ? 'Tomar otra foto' : 'Tomar foto'}
          <input
            type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} disabled={subiendo}
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
              const r = await subirArchivoDeLegajo(
                file, etiqueta.toLowerCase().includes('dorso') ? 'dorso' : 'frente');
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

export default function LegajoDeStaff({
  email, puesto, modalidad = MODALIDAD_POR_DEFECTO, onListo, onSalir,
}) {
  const [b, setB] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(async () => {
    const l = await fetchMiLegajo();
    setB(l || { pais: PAIS_POR_DEFECTO });
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

  const pais = b.pais || PAIS_POR_DEFECTO;
  const documentos = documentosDe(pais);
  const conDorso = tieneDorso(pais, b.tipo_documento);
  const errores = erroresDeFormato(b);
  const faltan = faltantesDelLegajo(b, modalidad);
  const completo = legajoCompleto(b, modalidad) && Object.keys(errores).length === 0;
  const esEmpleado = modalidad === 'empleado';

  // El titular tiene que ser la persona: depositar un pago en la cuenta de un
  // tercero es la forma más silenciosa de que ese pago no llegue. La excepción
  // real es quien factura como empresa, y se destraba con un tilde.
  const titular = b.titular_es_empresa ? (b.titular_cuenta || '') : titularSugerido(b);

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.tx,
      fontFamily: "'DM Sans', system-ui, sans-serif", padding: '24px 16px 60px',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gap: 14 }}>
        <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <Burbuja
            path={b.foto_perfil_path}
            onSubir={(p) => setB((x) => ({ ...x, foto_perfil_path: p }))}
          />
          <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 21, margin: 0, letterSpacing: '-0.01em' }}>
            Datos de incorporación
          </h1>
          <p style={{ fontSize: 13, color: C.t3, margin: '7px 0 0', lineHeight: 1.5 }}>
            {email}{puesto && ` · ${puesto}`}
            <br />
            {esEmpleado
              ? 'Completá tu legajo para finalizar la incorporación. Son los datos '
                + 'requeridos para tu liquidación de haberes.'
              : 'Completá tus datos fiscales y de cobro para finalizar el alta. '
                + 'Son los datos requeridos para procesar tus facturas.'}
            {' '}El acceso a esta información está restringido a la dirección de la empresa.
          </p>
          </div>
        </header>

        {!completo && (
          <div style={{
            fontSize: 12.5, padding: '10px 12px', borderRadius: 8, lineHeight: 1.5,
            background: 'rgba(251,191,36,0.10)', color: C.warn,
          }}>
            {faltan.length > 0
              ? <>Pendiente de completar: {faltan.join(', ')}.</>
              : <>Revisá los datos marcados en rojo.</>}
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

        <Seccion
          titulo="Datos personales"
          descripcion="El país determina la documentación que corresponde presentar."
        >
          <Campo etiqueta="Nombre" obligatorio>
            <input style={input} value={b.nombre || ''} onChange={set('nombre')} />
          </Campo>
          <Campo etiqueta="Apellido" obligatorio>
            <input style={input} value={b.apellido || ''} onChange={set('apellido')} />
          </Campo>
          <Campo etiqueta="País de residencia" obligatorio>
            <select
              style={input} value={pais}
              onChange={(e) => {
                // Al cambiar de país el documento elegido puede no existir allá.
                // Dejarlo puesto haría que se pida el dorso de algo que no
                // corresponde, o que se guarde un tipo inválido.
                const nuevo = e.target.value;
                const sigueValiendo = documentosDe(nuevo).some((d) => d.id === b.tipo_documento);
                setB((x) => ({
                  ...x, pais: nuevo,
                  tipo_documento: sigueValiendo ? x.tipo_documento : '',
                }));
              }}
            >
              {paisesParaLegajo().map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" obligatorio>
            <input style={input} type="date" value={b.fecha_nacimiento || ''} onChange={set('fecha_nacimiento')} />
          </Campo>
          <Campo etiqueta="Tipo de documento" obligatorio>
            <select style={input} value={b.tipo_documento || ''} onChange={set('tipo_documento')}>
              <option value="">Seleccionar…</option>
              {documentos.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Número de documento" obligatorio>
            <input style={input} inputMode="numeric" value={b.numero_documento || ''} onChange={set('numero_documento')} />
          </Campo>
          <Campo
            etiqueta={etiquetaFiscal(pais)} obligatorio
            error={errores.identificacion_fiscal}
          >
            <input
              style={input} inputMode="numeric"
              value={b.identificacion_fiscal || ''} onChange={set('identificacion_fiscal')}
            />
          </Campo>
        </Seccion>

        <Seccion
          titulo="Documentación"
          descripcion={conDorso
            ? 'Fotografiá ambas caras del documento seleccionado.'
            : 'Fotografiá la página principal del documento seleccionado.'}
        >
          <Documento
            etiqueta={conDorso ? 'Frente' : 'Documento'} path={b.doc_frente_path} obligatorio
            onSubir={(p) => setB((x) => ({ ...x, doc_frente_path: p }))}
          />
          {/* El dorso sólo cuando el documento lo tiene. Un pasaporte no tiene
              reverso, y pedirlo deja a la persona sin manera de continuar. */}
          {conDorso && (
            <Documento
              etiqueta="Dorso" path={b.doc_dorso_path} obligatorio
              onSubir={(p) => setB((x) => ({ ...x, doc_dorso_path: p }))}
            />
          )}
        </Seccion>

        {esEmpleado && (
          <Seccion titulo="Domicilio">
            <Campo etiqueta="Calle" obligatorio>
              <input style={input} value={b.calle || ''} onChange={set('calle')} />
            </Campo>
            <Campo etiqueta="Altura" obligatorio>
              <input style={input} value={b.altura || ''} onChange={set('altura')} />
            </Campo>
            <Campo etiqueta="Piso / departamento">
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
        )}

        <Seccion titulo="Contacto">
          {esEmpleado && (
            <Campo etiqueta="Teléfono" obligatorio>
              <input style={input} inputMode="tel" value={b.telefono || ''} onChange={set('telefono')} />
            </Campo>
          )}
          {/* Opcionales: son datos de un TERCERO que no dio su consentimiento.
              Frenar una incorporación por eso es frenarla por algo que la
              persona no siempre puede resolver en el momento. */}
          <Campo etiqueta="Nombre de contacto de emergencia">
            <input style={input} value={b.emergencia_nombre || ''} onChange={set('emergencia_nombre')} />
          </Campo>
          <Campo etiqueta="Número de contacto de emergencia">
            <input style={input} inputMode="tel" value={b.emergencia_telefono || ''} onChange={set('emergencia_telefono')} />
          </Campo>
        </Seccion>

        <Seccion
          titulo="Datos de cobro"
          descripcion="La cuenta debe estar a nombre del titular de este legajo."
        >
          {camposDeCobro(pais).map((c) => {
            const columna = campoDeCobro(c.id);
            return (
              <Campo
                key={c.id} etiqueta={c.label} obligatorio={c.requerido}
                error={errores[columna]}
              >
                <input
                  style={input} inputMode={c.digitos ? 'numeric' : 'text'}
                  value={b[columna] || ''} onChange={set(columna)}
                />
              </Campo>
            );
          })}

          <Campo
            etiqueta="Titular de la cuenta" obligatorio
            ayuda={b.titular_es_empresa ? 'Razón social de la empresa.' : 'Se completa con tus datos.'}
          >
            <input
              style={{ ...input, opacity: b.titular_es_empresa ? 1 : 0.7 }}
              value={titular}
              readOnly={!b.titular_es_empresa}
              onChange={set('titular_cuenta')}
            />
          </Campo>

          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
            color: C.t2, alignSelf: 'center',
          }}>
            <input
              type="checkbox" checked={!!b.titular_es_empresa}
              onChange={(e) => setB((x) => ({
                ...x,
                titular_es_empresa: e.target.checked,
                // Al destildar vuelve al nombre de la persona: si quedara la
                // razón social, el legajo diría que la cuenta es de un tercero.
                titular_cuenta: e.target.checked ? '' : titularSugerido(x),
              }))}
            />
            La cuenta es de una empresa
          </label>
        </Seccion>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button" disabled={guardando || !completo}
            onClick={async () => {
              setGuardando(true);
              const r = await guardarMiLegajo({ ...b, titular_cuenta: titular });
              setGuardando(false);
              if (r.__error) { setAviso(r.message); return; }
              setB(r.legajo || b);
              // Sólo se avanza cuando el SERVIDOR dice que está completo. Que
              // el navegador lo decidiera sería dejar entrar con el legajo a
              // medias mandando un request a mano.
              if (r.legajo?.completado_at) onListo();
              else setAviso('Los datos se guardaron pero el registro sigue incompleto.');
            }}
            style={{
              padding: '11px 24px', borderRadius: 9, border: 'none', font: 'inherit',
              fontSize: 14, fontWeight: 700,
              cursor: guardando ? 'wait' : completo ? 'pointer' : 'not-allowed',
              opacity: completo ? 1 : 0.45,
              background: C.ac, color: '#111',
            }}
          >
            {guardando ? 'Enviando…' : 'Finalizar incorporación'}
          </button>

          {onSalir && (
            <button
              type="button" onClick={onSalir}
              style={{
                marginLeft: 'auto', border: `1px solid ${C.line}`, background: 'transparent',
                color: C.t3, borderRadius: 8, padding: '8px 14px',
                font: 'inherit', fontSize: 12.5, cursor: 'pointer',
              }}
            >
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
