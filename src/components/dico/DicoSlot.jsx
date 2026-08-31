/**
 * DicoSlot — frontera entre Native y Physical.
 *
 * El Slot no abre ni cierra los avisos. Su unica responsabilidad es traer a
 * Dico Physical al plano de la interfaz y devolverlo a la maquina.
 */
import CaraDeTinta from './CaraDeTinta';
import './dico.css';
import physicalBody from './poses/dico-physical-body.webp';
import './dico-slot.css';

export default function DicoSlot({
  estado,
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
            <svg className="dico-physical-cara" viewBox="0 0 120 120" aria-hidden="true">
              <g className="dico--idle">
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
