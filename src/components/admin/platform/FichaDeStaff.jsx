/**
 * El legajo de una persona, visto por el dueño.
 *
 * POR QUE EXISTE
 * La 0054 dejó al dueño poder LEER los legajos y ahí terminó. Sin pantalla que
 * los lea, el edificio junta fotos de documentos y CBUs que nadie puede
 * consultar: peor que no juntarlos, porque el riesgo de guardarlos está y el
 * beneficio no.
 *
 * ES SOLO LECTURA, Y ES A PROPOSITO
 * El dueño mira, no edita. Un CBU que puede cambiar alguien que no es su
 * titular es un sueldo que se puede desviar sin que la persona se entere; y un
 * documento que otro puede reemplazar deja de servir como prueba de nada. Si
 * hay un dato mal, lo corrige quien lo cargó.
 *
 * LAS FOTOS
 * URL firmada que dura cinco minutos, pedida al abrir. Nunca se guarda: si se
 * pudiera, la imagen de un documento quedaría alcanzable con un link suelto.
 */
import { useState, useEffect } from 'react';
import { fetchLegajoDe, urlDeArchivo } from '../../../services/platformStaff';
import { nombreDePais, etiquetaFiscal, camposDeCobro } from '../../../modules/documentacionPorPais';
import { campoDeCobro, MODALIDADES } from '../../../modules/legajo';

const C = {
  card: '#1a1a1c', line: '#2a2a2e',
  tx: '#f5f5f4', t2: '#a1a1aa', t3: '#71717a', ac: '#e8b947',
  ok: '#4ade80', warn: '#fbbf24',
};

function Dato({ etiqueta, children }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 11.5, color: C.t3 }}>{etiqueta}</span>
      <span style={{ fontSize: 13.5, color: C.tx }}>{children || '—'}</span>
    </div>
  );
}

function Grupo({ titulo, children }) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 style={{
        fontSize: 12, margin: 0, color: C.t2, textTransform: 'uppercase',
        letterSpacing: '0.05em', fontWeight: 700,
      }}>
        {titulo}
      </h3>
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        {children}
      </div>
    </section>
  );
}

/** Una imagen del legajo, con su URL firmada pedida al vuelo. */
function Imagen({ path, alto = 150, redonda = false }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let vivo = true;
    if (!path) { setUrl(null); return undefined; }
    urlDeArchivo(path).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [path]);

  if (!path) return null;
  if (!url) {
    return (
      <span style={{ fontSize: 12, color: C.t3 }}>Cargando imagen…</span>
    );
  }
  return (
    <img
      src={url} alt=""
      style={{
        maxWidth: '100%', maxHeight: alto, borderRadius: redonda ? '50%' : 8,
        width: redonda ? alto : 'auto', height: redonda ? alto : 'auto',
        objectFit: 'cover', border: `1px solid ${C.line}`,
      }}
    />
  );
}

export default function FichaDeStaff({ ficha, onCerrar }) {
  const [l, setL] = useState(undefined); // undefined = cargando, null = sin legajo

  useEffect(() => {
    let vivo = true;
    fetchLegajoDe(ficha.user_id).then((r) => { if (vivo) setL(r); });
    return () => { vivo = false; };
  }, [ficha.user_id]);

  const nombre = [l?.nombre, l?.apellido].filter(Boolean).join(' ') || ficha.email;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
      padding: 16, display: 'grid', gap: 16,
    }}>
      <header style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {l?.foto_perfil_path
          ? <Imagen path={l.foto_perfil_path} alto={56} redonda />
          : (
            <span style={{
              width: 56, height: 56, borderRadius: '50%', background: '#111113',
              border: `1px solid ${C.line}`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: C.t3,
            }}>
              {(nombre[0] || '?').toUpperCase()}
            </span>
          )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 15 }}>{nombre}</strong>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 3 }}>
            {ficha.email}
          </div>
        </div>
        <button
          type="button" onClick={onCerrar}
          style={{
            border: `1px solid ${C.line}`, background: 'transparent', color: C.t2,
            borderRadius: 7, padding: '5px 11px', font: 'inherit', fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cerrar
        </button>
      </header>

      {l === undefined && (
        <span style={{ fontSize: 13, color: C.t3 }}>Cargando…</span>
      )}

      {l === null && (
        <div style={{
          fontSize: 12.5, padding: '10px 12px', borderRadius: 8, lineHeight: 1.5,
          background: 'rgba(251,191,36,0.10)', color: C.warn,
        }}>
          Todavía no cargó ningún dato. Los completa la persona al entrar por
          primera vez: no se pueden cargar desde acá, porque un documento que
          sube otro deja de servir como prueba de nada.
        </div>
      )}

      {l && (
        <>
          {!l.completado_at && (
            <div style={{
              fontSize: 12.5, padding: '9px 11px', borderRadius: 8,
              background: 'rgba(251,191,36,0.10)', color: C.warn,
            }}>
              Legajo incompleto. No puede entrar a la consola hasta terminarlo.
            </div>
          )}

          <Grupo titulo="Identidad">
            <Dato etiqueta="País">{nombreDePais(l.pais)}</Dato>
            <Dato etiqueta="Fecha de nacimiento">{l.fecha_nacimiento}</Dato>
            <Dato etiqueta="Documento">
              {l.numero_documento && `${l.tipo_documento?.toUpperCase()} ${l.numero_documento}`}
            </Dato>
            <Dato etiqueta={etiquetaFiscal(l.pais)}>{l.identificacion_fiscal}</Dato>
          </Grupo>

          {(l.doc_frente_path || l.doc_dorso_path) && (
            <Grupo titulo="Documentación">
              <Imagen path={l.doc_frente_path} />
              <Imagen path={l.doc_dorso_path} />
            </Grupo>
          )}

          {/* El domicilio sólo existe en relación de dependencia: a quien
              factura no se le pide. Mostrar la sección vacía haría parecer que
              falta un dato que nadie tiene que cargar. */}
          {ficha.modalidad !== 'contratista' && (
            <Grupo titulo="Domicilio">
              <Dato etiqueta="Calle y altura">
                {[l.calle, l.altura, l.piso_depto].filter(Boolean).join(' ')}
              </Dato>
              <Dato etiqueta="Localidad">{l.localidad}</Dato>
              <Dato etiqueta="Provincia">{l.provincia}</Dato>
              <Dato etiqueta="Código postal">{l.codigo_postal}</Dato>
            </Grupo>
          )}

          <Grupo titulo="Contacto">
            <Dato etiqueta="Teléfono">{l.telefono}</Dato>
            <Dato etiqueta="Emergencia">
              {[l.emergencia_nombre, l.emergencia_telefono].filter(Boolean).join(' · ')}
            </Dato>
          </Grupo>

          <Grupo titulo="Cobro">
            {camposDeCobro(l.pais).map((c) => (
              <Dato key={c.id} etiqueta={c.label}>{l[campoDeCobro(c.id)]}</Dato>
            ))}
            <Dato etiqueta="Titular">
              {l.titular_cuenta}
              {l.titular_es_empresa && (
                <span style={{ color: C.t3, fontSize: 11.5 }}> · empresa</span>
              )}
            </Dato>
          </Grupo>

          <Grupo titulo="Vínculo">
            <Dato etiqueta="Modalidad">
              {MODALIDADES[ficha.modalidad]?.label || ficha.modalidad}
            </Dato>
            <Dato etiqueta="Legajo completo">
              {l.completado_at
                ? <span style={{ color: C.ok }}>{l.completado_at.slice(0, 10)}</span>
                : <span style={{ color: C.warn }}>pendiente</span>}
            </Dato>
          </Grupo>
        </>
      )}
    </div>
  );
}
