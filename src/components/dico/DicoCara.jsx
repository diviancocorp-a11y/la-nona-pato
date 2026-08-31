/**
 * DicoCara — el personaje dentro de la app. Capa 1 del PLAN-DICO.
 *
 * CAPAS: MONEDA, BRAZOS Y TINTA
 * La moneda conserva el render 3D. Los brazos usan un sprite alfa limpio
 * como dos capas articuladas y la cara sigue siendo un SVG modular.
 * Esa division es la decision de fondo y no es solo estetica: dos sprites
 * reusables reemplazan renders por estado, una expresion nueva cuesta CSS y
 * paths, el parpadeo y las pupilas existen, y a 30px la tinta se lee donde un
 * sombreado 3D se empasta.
 *
 * SIN PIERNAS a proposito. La version con piernas y zapatos es para marketing;
 * adentro Dico vive a 30px al lado de un aviso.
 *
 * SI FALTA EL RENDER se dibuja una moneda provisoria. No es cortesia: un
 * `import` de un archivo que no existe rompe el build, y el dia que alguien
 * borre el .webp la app tiene que seguir andando. Es deliberadamente pobre —
 * un disco con bisel — porque su unico trabajo es que la cara se apoye en algo.
 *
 * Respeta `prefers-reduced-motion` en los dos modos.
 */
import { useId } from 'react';
import CaraDeTinta, { CAMPO } from './CaraDeTinta';
import './dico.css';

export const ESTADOS_DICO = ['idle', 'esperando', 'contento', 'preocupado', 'pregunta'];
const FRAMES_HABLA = ['closed', 'mid', 'open'];

// Glob y no import directo: asi el build no se rompe si el archivo no esta.
const BASES = import.meta.glob('./poses/moneda-sin-brazos.{png,webp,avif}', { eager: true, import: 'default' });
const BRAZOS = import.meta.glob('./poses/brazos.{png,webp,avif}', { eager: true, import: 'default' });
const MONEDA_BASE = Object.values(BASES)[0] || null;
const MONEDA_BRAZOS = Object.values(BRAZOS)[0] || null;

/** La cara vive en su propio grupo para transformarla sin mover el cuerpo. */
function CapaDeTinta({ lookX, lookY }) {
  return <g className="dico-cara"><CaraDeTinta lookX={lookX} lookY={lookY} /></g>;
}

export default function DicoCara({
  estado = 'idle',
  size = 48,
  title,
  entrada = false,
  lookX = 0,
  lookY = 0,
  speakingFrame,
  className = '',
  style,
}) {
  const seguro = ESTADOS_DICO.includes(estado) ? estado : 'idle';
  const habla = FRAMES_HABLA.includes(speakingFrame) ? speakingFrame : '';
  const miradaDirigida = Math.abs(Number(lookX) || 0) > .001 || Math.abs(Number(lookY) || 0) > .001;
  const clases = [
    'dico', `dico--${seguro}`,
    MONEDA_BASE && MONEDA_BRAZOS ? 'dico--render' : 'dico--provisoria',
    Number(size) <= 40 ? 'dico--pequena' : '',
    miradaDirigida ? 'dico--mirada-dirigida' : '',
    habla ? `dico--habla-${habla}` : '',
    entrada ? 'dico--entrada' : '',
    className,
  ].filter(Boolean).join(' ');

  const accesible = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': 'true' };

  if (MONEDA_BASE && MONEDA_BRAZOS) {
    return (
      <span className={clases} style={{ ...style, width: size, height: size }} data-dico-core="" {...accesible}>
        <span className="dico-escena">
          <span className="dico-piso" />
          <span className="dico-boya">
            <span className="dico-bamboleo">
              <img className="dico-cuerpo-render dico-cuerpo-render--moneda"
                src={MONEDA_BASE} alt="" draggable="false" />
              <img className="dico-cuerpo-render dico-brazo dico-brazo--izq"
                src={MONEDA_BRAZOS} alt="" draggable="false" />
              <img className="dico-cuerpo-render dico-brazo dico-brazo--der"
                src={MONEDA_BRAZOS} alt="" draggable="false" />
              <svg className="dico-capa-tinta" viewBox="0 0 120 120" aria-hidden="true">
                <CapaDeTinta lookX={lookX} lookY={lookY} />
              </svg>
            </span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <DicoProvisoria
      clases={clases}
      size={size}
      accesible={accesible}
      lookX={lookX}
      lookY={lookY}
      style={style}
    />
  );
}

function DicoProvisoria({ clases, size, accesible, lookX, lookY, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n) => `dico-${n}-${uid}`;

  return (
    <svg className={clases} style={style} width={size} height={size} viewBox="0 0 120 120"
      data-dico-core="" {...accesible}>
      <defs>
        <radialGradient id={g('oro')} cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#ffe89a" />
          <stop offset="46%" stopColor="#f2b830" />
          <stop offset="84%" stopColor="#c9880f" />
          <stop offset="100%" stopColor="#a06f0d" />
        </radialGradient>
      </defs>

      <g className="dico-escena">
        <ellipse className="dico-piso" cx="60" cy="114" rx="24" ry="3.8" fill="#2b1d02" opacity=".26" />
        <g className="dico-boya">
          <g className="dico-bamboleo">
            <circle cx={CAMPO.cx} cy={CAMPO.cy} r="38" fill={`url(#${g('oro')})`} />
            <ellipse cx={CAMPO.cx} cy={CAMPO.cy} rx={CAMPO.rx} ry={CAMPO.ry}
              fill="none" stroke="#c9880f" strokeWidth="2" opacity=".6" />
            <CapaDeTinta lookX={lookX} lookY={lookY} />
          </g>
        </g>
      </g>
    </svg>
  );
}
