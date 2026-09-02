/**
 * DicoAvisos — presencia Native persistente + avisos bajo demanda.
 *
 * Dico ya no desaparece cuando se cierra la burbuja. El personaje vive como
 * presencia estable del sistema y el mensaje se abre solo cuando el usuario
 * decide mirarlo. Presence y Message son estados distintos.
 *
 * ───────────────────────── LOS TRES EJES, ACA ─────────────────────────
 *
 * Esta capa es la que DECIDE, y decide por separado:
 *
 *   nativeState   sale del NIVEL del aviso mas grave     -> que cara pone
 *   activity      sale de que esta haciendo el sistema   -> que hace el pulso
 *
 * Antes los dos salian de la misma tabla y por eso `esperando` —que es el
 * sistema cargando, no una emocion— terminaba siendo una "cara". Ahora una
 * alerta con el panel todavia cargando es `alert` + `processing`, dos hechos
 * distintos expresados por dos medios distintos.
 *
 * ────────────────────── UN SOLO TARGET, DOS GESTOS ──────────────────────
 *
 * Sobre Dico 2D conviven dos acciones y se resuelven por estado:
 *
 *   sin avisos           -> invoca a Physical (antes no hacia nada)
 *   con avisos, cerrado  -> abre el aviso
 *   con avisos, abierto  -> lo cierra
 *
 * Es la unica forma de que el personaje sea invocable sin robarle el click al
 * aviso ni inventar un segundo target de 44px pegado al primero. Si Physical
 * tiene que ser invocable SIEMPRE, hace falta ese segundo target y eso es una
 * decision de disenio, no de implementacion.
 */
import { useEffect, useRef, useState } from 'react';
import { avisosDe } from '../../../modules/dico/reglas';
import DicoNative from '../../dico/DicoNative';
import BurbujaDico from '../../dico/BurbujaDico';

/**
 * Los tres niveles son una escala de gravedad (alerta > aviso > sugerencia) y
 * el vocabulario tiene tres caras que forman la misma escala. No hay que
 * traducir nada: se corresponden una a una.
 */
const CARA_POR_NIVEL = {
  alerta: 'alert',        // atencion seria / critico
  aviso: 'concerned',     // problema suave / pendiente
  sugerencia: 'curious',  // curiosidad / observacion
};

const CLAVE_PRIMERA_ENTRADA = 'dico:primera-entrada:v1';

function esPrimeraEntrada() {
  try {
    return localStorage.getItem(CLAVE_PRIMERA_ENTRADA) !== '1';
  } catch {
    return false;
  }
}

export default function DicoAvisos({
  abierto = false,
  onAbrir,
  onCerrar,
  onInvocar,
  onIr,
  omitir = [],
  ...datos
}) {
  const idsOmitidos = new Set(omitir);
  const avisos = avisosDe(datos).filter(aviso => !idsOmitidos.has(aviso.id));
  const firma = avisos.map(a => a.id).join('|');
  const [pagina, setPagina] = useState({ firma: '', indice: 0 });
  const [entrada] = useState(esPrimeraEntrada);
  const firmaAnterior = useRef(firma);

  const indice = pagina.firma === firma
    ? Math.min(pagina.indice, Math.max(avisos.length - 1, 0))
    : 0;
  const actual = avisos[indice];
  const tieneAvisos = avisos.length > 0;

  // EJE 1 — la cara. Solo la dicta el aviso; si no hay, Dico esta neutral
  // aunque el sistema este trabajando.
  const cara = actual ? (CARA_POR_NIVEL[actual.nivel] || 'neutral') : 'neutral';

  // EJE 2 — la actividad. Solo la dicta el sistema; nunca la cara.
  // `attention` es finito por disenio: llama una vez y se queda quieto.
  const actividad = datos.listo === false
    ? 'processing'
    : abierto
      ? 'active'
      : tieneAvisos
        ? 'attention'
        : 'idle';

  useEffect(() => {
    if (!entrada) return;
    try { localStorage.setItem(CLAVE_PRIMERA_ENTRADA, '1'); } catch { /* sin storage */ }
  }, [entrada]);

  useEffect(() => {
    if (firmaAnterior.current === firma) return;
    firmaAnterior.current = firma;
    setPagina({ firma, indice: 0 });
    onCerrar?.();
  }, [firma, onCerrar]);

  const personaje = (
    <DicoNative
      size={40}
      state={cara}
      activity={actividad}
      className={entrada ? 'dico-native--entrada' : ''}
      title={tieneAvisos
        ? `Dico: ${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}`
        : 'Dico'}
    />
  );

  return (
    <div className={`dico-avisos${abierto ? ' dico-avisos--abierto' : ''}`}>
      {abierto && actual && (
        <div className="dico-avisos-mensaje">
          <BurbujaDico
            key={`${firma}:${indice}`}
            texto={`${actual.titulo}. ${actual.detalle}`}
            nivel={actual.nivel}
            cola="centro"
            accion={actual.ir?.texto}
            onAccion={actual.ir ? () => onIr?.(actual.ir.tab) : undefined}
            restantes={avisos.length - indice - 1}
            onSiguiente={() => setPagina({ firma, indice: indice + 1 })}
            onCerrar={onCerrar}
          />
        </div>
      )}

      <div className="dico-avisos-presencia">
        {tieneAvisos ? (
          <button
            type="button"
            className="dico-avisos-trigger"
            onClick={abierto ? onCerrar : onAbrir}
            aria-expanded={abierto}
            aria-label={abierto
              ? 'Cerrar avisos de Dico'
              : `Abrir ${avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`} de Dico`}
          >
            {personaje}
            <span className="dico-avisos-badge" aria-hidden="true">{avisos.length}</span>
          </button>
        ) : onInvocar ? (
          <button
            type="button"
            className="dico-avisos-idle"
            onClick={onInvocar}
            aria-label="Traer a Dico"
          >
            {personaje}
          </button>
        ) : (
          <span className="dico-avisos-idle">{personaje}</span>
        )}
      </div>
    </div>
  );
}
