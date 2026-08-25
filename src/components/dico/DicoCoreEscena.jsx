/**
 * DicoCoreEscena — composicion grande del Core sin cargar renders narrativos.
 *
 * Mantiene el contrato de burbuja + personaje + CTA de DicoEscena, pero usa
 * la anatomia modular de DicoCara. Es la variante correcta dentro del flujo
 * operativo; las poses completas quedan para storytelling y Retro Moments.
 */
import BurbujaDico from './BurbujaDico';
import DicoCara from './DicoCara';
import './escena.css';

export default function DicoCoreEscena({
  estado = 'idle',
  lookX = 0,
  lookY = 0,
  texto,
  accion,
  onAccion,
  nivel = 'sugerencia',
  size = 170,
  title = 'Dico',
}) {
  return (
    <section className={`dico-cuadro dico-cuadro--core dico-cuadro--${estado}`}>
      {texto && <BurbujaDico texto={texto} nivel={nivel} cola="centro" />}

      <div className="dico-cuadro-personaje" style={{ '--dico-cuadro-size': `${size}px` }}>
        <DicoCara estado={estado} lookX={lookX} lookY={lookY} size={size} title={title} />
      </div>

      {accion && (
        <button type="button" className="ag-cta dico-cuadro-accion" onClick={onAccion}>
          {accion}
        </button>
      )}
    </section>
  );
}
