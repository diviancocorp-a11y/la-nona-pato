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
 * ─────────────────── DOS GESTOS, DOS TARGETS ───────────────────
 *
 * Dico 2D es SIEMPRE la invocacion de Physical: se lo toca y el personaje
 * viene al plano, haya avisos o no. Que el mismo pixel hiciera una cosa u
 * otra segun cuantos avisos hubiera obligaba al usuario a saber el estado del
 * sistema antes de tocar.
 *
 * El aviso tiene su propio control: el contador. Deja de ser una calcomania
 * decorativa sobre el personaje y pasa a ser un boton con su area propia, que
 * es lo que permite que las dos acciones convivan sin robarse el click.
 *
 * Cuando Physical entra, el aviso se cierra solo: no puede quedar un globo
 * flotando de un personaje que ya no esta. Eso lo resuelve la maquina, no
 * este componente.
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
  /**
   * Donde vive Dico, que decide para donde sale la cola del globo.
   * `arriba`  el aviso se abre ENCIMA del personaje (composicion mobile)
   * `lateral` se abre A SU DERECHA (Dico en la sidebar desktop)
   * No se deduce del ancho de pantalla: lo sabe el shell, que es quien lo
   * monta en un lugar o en el otro.
   */
  anclaje = 'arriba',
  omitir = [],
  ...datos
}) {
  const idsOmitidos = new Set(omitir);
  const avisos = avisosDe(datos).filter(aviso => !idsOmitidos.has(aviso.id));
  const firma = avisos.map(a => a.id).join('|');
  const [pagina, setPagina] = useState({ firma: '', indice: 0 });
  const [entrada] = useState(esPrimeraEntrada);
  const firmaAnterior = useRef(firma);
  const raiz = useRef(null);

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

  /* PASS 1 — el globo se cierra tocando afuera.
   *
   * Depender solo de la X obliga a apuntarle a un target de 22px para salir de
   * algo que se abrio con un toque. `pointerdown` y no `click`: cierra al
   * apoyar el dedo, sin esperar el `mouseup`, y el `capture` hace que se
   * evalue antes de que el elemento de abajo se lo coma.
   *
   * La X SE CONSERVA: es la salida visible y la unica con nombre accesible.
   * Esto es un camino ademas, no en reemplazo. */
  useEffect(() => {
    if (!abierto) return undefined;
    const afuera = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) onCerrar?.();
    };
    document.addEventListener('pointerdown', afuera, true);
    return () => document.removeEventListener('pointerdown', afuera, true);
  }, [abierto, onCerrar]);

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
    <div ref={raiz} className={`dico-avisos${abierto ? ' dico-avisos--abierto' : ''}`}>
      {abierto && actual && (
        <div className="dico-avisos-mensaje">
          <BurbujaDico
            key={`${firma}:${indice}`}
            texto={`${actual.titulo}. ${actual.detalle}`}
            nivel={actual.nivel}
            cola={anclaje === 'lateral' ? 'lateral' : 'centro'}
            accion={actual.ir?.texto}
            onAccion={actual.ir ? () => onIr?.(actual.ir.tab) : undefined}
            restantes={avisos.length - indice - 1}
            onSiguiente={() => setPagina({ firma, indice: indice + 1 })}
            onCerrar={onCerrar}
          />
        </div>
      )}

      <div className="dico-avisos-presencia">
        {onInvocar ? (
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

        {/* El contador es un CONTROL, no una calcomania. Tiene su propia area
            de 44 y su propio nombre accesible: es la unica forma de que abrir
            el aviso y traer a Dico sean dos gestos distintos. */}
        {tieneAvisos && (
          <button
            type="button"
            className="dico-avisos-trigger"
            onClick={abierto ? onCerrar : onAbrir}
            aria-expanded={abierto}
            aria-label={abierto
              ? 'Cerrar avisos de Dico'
              : `Abrir ${avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`} de Dico`}
          >
            <span className="dico-avisos-badge">{avisos.length}</span>
          </button>
        )}
      </div>
    </div>
  );
}
