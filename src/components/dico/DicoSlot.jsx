/**
 * DicoSlot — frontera entre Native y Physical.
 *
 * El Slot no abre ni cierra los avisos. Su unica responsabilidad es traer a
 * Dico Physical al plano de la interfaz y devolverlo a la maquina.
 */
import CaraDeTinta from './CaraDeTinta';
import { ESTADOS_DICO } from './DicoCara';
import './dico.css';
import physicalBody from './poses/dico-physical-body.webp';
import './dico-slot.css';

const FRAMES_HABLA = ['closed', 'mid', 'open'];

export default function DicoSlot({
  estado,
  cara = 'idle',
  habla,
  onAbrir,
  onAperturaCompleta,
  onCerrar,
  onCierreCompleto,
}) {
  const abriendo = estado === 'physical_opening';
  const abierto = estado === 'physical_open';
  const cerrando = estado === 'physical_closing';
  const visible = abriendo || abierto || cerrando;

  function alternar() {
    if (abriendo || cerrando) return;
    if (!visible) {
      onAbrir?.();
      return;
    }
    onCerrar?.();
  }

  function terminarMovimiento(event) {
    if (event.currentTarget !== event.target) return;
    if (abriendo) onAperturaCompleta?.();
    if (cerrando) onCierreCompleto?.();
  }

  const caraSegura = ESTADOS_DICO.includes(cara) ? cara : 'idle';
  const hablaSegura = FRAMES_HABLA.includes(habla) ? habla : '';
  const claseDeCara = [
    `dico--${caraSegura}`,
    hablaSegura ? `dico--habla-${hablaSegura}` : '',
  ].filter(Boolean).join(' ');

  const clases = [
    'dico-slot',
    visible ? 'dico-slot--visible' : '',
    abriendo ? 'dico-slot--abriendo' : '',
    abierto ? 'dico-slot--abierto' : '',
    cerrando ? 'dico-slot--cerrando' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={clases} data-dico-presence-state={estado}>
      <div className="dico-slot-stage" aria-live="polite">
        {visible && (
          <div
            className="dico-physical"
            role="img"
            aria-label="Dico Physical"
            onAnimationEnd={terminarMovimiento}
          >
            <img
              className="dico-physical-cuerpo"
              src={physicalBody}
              alt=""
              draggable="false"
            />
            {/* Physical habla el MISMO vocabulario facial que Native: las
                clases de estado son las de `dico.css` y la anatomia es la misma
                `CaraDeTinta`. Antes esto estaba clavado en `dico--idle` y
                Physical no podia expresar nada. */}
            <svg className="dico-physical-cara" viewBox="0 0 120 120" aria-hidden="true">
              <g className={claseDeCara}>
                <CaraDeTinta />
              </g>
            </svg>
          </div>
        )}
      </div>

      <button
        type="button"
        className="dico-slot-control"
        onClick={alternar}
        disabled={abriendo || cerrando}
        aria-expanded={visible}
        aria-label={abriendo
          ? 'Abriendo Dico Physical'
          : cerrando
            ? 'Guardando Dico Physical'
            : abierto
              ? 'Guardar Dico Physical'
              : 'Abrir Dico Physical'}
      >
        <span className="dico-slot-ranura" aria-hidden="true">
          <span className="dico-slot-luz" />
        </span>
      </button>
    </div>
  );
}
