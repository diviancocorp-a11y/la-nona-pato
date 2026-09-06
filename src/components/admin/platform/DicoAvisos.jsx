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
import { oportunidadesDe } from '../../../modules/dico/oportunidades';
import DicoNative from '../../dico/DicoNative';
import MensajeDico from '../../dico/MensajeDico';

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
  onIr,
  /**
   * Si este rol puede ver los numeros del negocio. Las oportunidades hablan
   * de plata; a un mozo no le sirve saber que hay stock parado.
   */
  conOportunidades = false,
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
  /* PASS 2 — LAS DOS CAPAS ENTRAN POR EL MISMO CANAL.
   *
   * Las oportunidades vivian en su propia tarjeta dentro de Productos, con su
   * propio rotulo y su propia X: un segundo emisor de mensajes a diez pixeles
   * de Dico. Ahora son mensajes de Dico y se leen donde el usuario ya va a
   * buscar lo que Dico tiene para decir.
   *
   * NO es un sistema nuevo: `oportunidadesDe` es la misma funcion de siempre y
   * su forma se adapta aca —`porque` + `hacer` son el cuerpo del mensaje—.
   * Van DESPUES de los avisos y siempre como `sugerencia`: la higiene es lo
   * que esta roto, esto es lo que se puede mejorar, y esa jerarquia es la que
   * ordena la cola.
   */
  const avisos = [
    ...avisosDe(datos),
    ...(conOportunidades ? oportunidadesDe(datos).map(o => ({
      id: `oportunidad:${o.id}`,
      nivel: 'sugerencia',
      titulo: o.titulo,
      detalle: `${o.porque} ${o.hacer}`,
      ir: o.ir,
    })) : []),
  ].filter(aviso => !idsOmitidos.has(aviso.id));
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
      {/* DICO 2D HABLA EN TARJETA, NO EN GLOBO.
          El globo dibujado quedo para Physical, que es un personaje presente
          en la escena y tiene a donde apuntar con la cola. Aca el que habla es
          un avatar de 60px clavado en el riel: la cola peleaba con su posicion
          y el papel crema no pertenecia a ninguna superficie del panel. Lo que
          se conserva es la VOZ —la letra y el tipeo—, que es lo que hace que
          se sienta Dico. Ver `MensajeDico`.
          `anclaje` ya no cambia el componente: la capa la ubica el CSS del
          chasis, que es quien sabe donde vive Dico. */}
      {abierto && actual && (
        <div className={`dico-avisos-mensaje dico-avisos-mensaje--${anclaje}`}>
          <MensajeDico
            key={`${firma}:${indice}`}
            texto={`${actual.titulo}. ${actual.detalle}`}
            nivel={actual.nivel}
            accion={actual.ir?.texto}
            onAccion={actual.ir ? () => onIr?.(actual.ir.tab) : undefined}
            indice={indice}
            total={avisos.length}
            restantes={avisos.length - indice - 1}
            onSiguiente={() => setPagina({ firma, indice: indice + 1 })}
            onCerrar={onCerrar}
          />
        </div>
      )}

      <div className="dico-avisos-presencia">
        {/* PASS 2 — CAMBIO CONTRACTUAL: tocar a Dico 2D abre SU MENSAJE.
            Antes traia a Physical al plano ("Traer a Dico"). Dico 2D es
            presencia persistente e indicador de lo que tiene para decir, no el
            llamador de Physical; el boton de invocar volvera cuando exista el
            chat real. Con esto el personaje y el contador hacen LO MISMO, que
            es lo correcto: son la misma intencion. */}
        {/* PASS 4 — EL CONTADOR VUELVE ENCIMA DEL PERSONAJE.
         *
         * Hasta acá eran dos controles pegados: el personaje y, al lado, una
         * pastilla roja con su propia caja de 44. Se habían separado cuando
         * Dico medía 36-40px y el badge le comía 13-15px del aro; y tenían
         * nombres accesibles distintos porque hacían cosas distintas —uno
         * abría el aviso, el otro traía a Physical—.
         *
         * Las dos razones se cayeron. PASS 2 dejó al personaje y al contador
         * haciendo LO MISMO, y PASS 3 llevó a Dico a 60/88 en el riel: a ese
         * tamaño el badge entra en la esquina sin tapar la cara. Separados
         * leían como una notificación ajena flotando al lado de un dibujo, y
         * no como que Dico tiene algo para decir.
         *
         * Ahora es UN control: el personaje, con su contador encima. Sigue
         * teniendo su hit target de 44 como mínimo (`burbuja.css`) y el
         * número entra en el nombre accesible, que es donde tiene que estar
         * para quien no lo ve. */}
        {tieneAvisos ? (
          <button
            type="button"
            className="dico-avisos-idle dico-avisos-trigger"
            onClick={abierto ? onCerrar : onAbrir}
            aria-expanded={abierto}
            aria-label={abierto
              ? 'Cerrar el mensaje de Dico'
              : `Ver lo que dice Dico (${avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`})`}
          >
            {personaje}
            <span className="dico-avisos-badge" aria-hidden="true">{avisos.length}</span>
          </button>
        ) : (
          <span className="dico-avisos-idle">{personaje}</span>
        )}
      </div>
    </div>
  );
}
