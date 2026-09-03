/**
 * DicoSlot — frontera entre Native y Physical.
 *
 * El Slot no abre ni cierra los avisos. Su unica responsabilidad es traer a
 * Dico Physical al plano de la interfaz y devolverlo a la maquina.
 */
import DicoPhysical from './DicoPhysical';
import { physicalPoseCanonica } from './vocabulario';
import './dico.css';
import './dico-slot.css';

export default function DicoSlot({
  estado,
  /**
   * Que pose muestra Dico 3D. Antes esto era `cara` + `habla`, porque el
   * personaje se componia de un cuerpo sin cara mas una capa de tinta encima.
   * El pack oficial ya trae la cara renderizada: no hay una capa que dirigir,
   * hay una pose que elegir.
   */
  pose = 'idle',
  onAbrir,
  onAperturaCompleta,
  onCerrar,
  onCierreCompleto,
  /** Lo que Dico dice mientras esta en escena. Va ADENTRO del Slot porque es
   *  quien establece el contexto de posicionamiento en los dos anclajes. */
  children,
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

  const poseSegura = physicalPoseCanonica(pose);

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
            onAnimationEnd={terminarMovimiento}
          >
            {/* El pack oficial: ocho renders completos, con la cara adentro.
                Ya no hay cuerpo-sin-cara + capa de tinta que dirigir, y por eso
                tampoco hay una cara canonica que montar encima: seria una cara
                sobre otra cara. */}
            <DicoPhysical pose={poseSegura} title="Dico Physical" />
          </div>
        )}
      </div>

      {visible && children}

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
