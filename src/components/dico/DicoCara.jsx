/**
 * DicoCara — el personaje dentro de la app. Capa 1 del PLAN-DICO.
 *
 * DOS CAPAS: EL CUERPO ES UN RENDER, LA CARA ES TINTA
 * El cuerpo —moneda, galera, brazos y guantes— es un render 3D. Lo unico que
 * actua es la cara, y esa es SVG plano, estilo cartoon de los 30.
 * Esa division es la decision de fondo y no es solo estetica: hace falta UN
 * render en vez de seis que calcen entre si, una expresion nueva cuesta dos
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

// Glob y no import directo: asi el build no se rompe si el archivo no esta.
const RENDERS = import.meta.glob('./poses/moneda.{png,webp,avif}', { eager: true, import: 'default' });
const MONEDA = Object.values(RENDERS)[0] || null;

/** La cara, en su grupo de parallax. La galera NO esta aca: viene en el
    render, con el mismo material que la moneda. */
function CapaDeTinta() {
  return <g className="dico-cara"><CaraDeTinta /></g>;
}

export default function DicoCara({ estado = 'idle', size = 48, title, entrada = false }) {
  const seguro = ESTADOS_DICO.includes(estado) ? estado : 'idle';
  const clases = [
    'dico', `dico--${seguro}`,
    MONEDA ? 'dico--render' : 'dico--provisoria',
    entrada ? 'dico--entrada' : '',
  ].filter(Boolean).join(' ');

  const accesible = title
    ? { role: 'img', 'aria-label': title }
    : { 'aria-hidden': 'true' };

  if (MONEDA) {
    return (
      <span className={clases} style={{ width: size, height: size }} {...accesible}>
        <span className="dico-escena">
          <span className="dico-piso" />
          <span className="dico-boya">
            <span className="dico-bamboleo">
              <img className="dico-cuerpo-render" src={MONEDA} alt="" draggable="false" />
              <svg className="dico-capa-tinta" viewBox="0 0 120 120" aria-hidden="true">
                <CapaDeTinta />
              </svg>
            </span>
          </span>
        </span>
      </span>
    );
  }

  return <DicoProvisoria clases={clases} size={size} accesible={accesible} />;
}

function DicoProvisoria({ clases, size, accesible }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = (n) => `dico-${n}-${uid}`;

  return (
    <svg className={clases} width={size} height={size} viewBox="0 0 120 120" {...accesible}>
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
            <ellipse cx={CAMPO.cx} cy={CAMPO.cy} rx="34.4" ry="37.8" fill={`url(#${g('oro')})`} />
            <ellipse cx={CAMPO.cx} cy={CAMPO.cy} rx={CAMPO.rx} ry={CAMPO.ry}
              fill="none" stroke="#c9880f" strokeWidth="2" opacity=".6" />
            <CapaDeTinta />
          </g>
        </g>
      </g>
    </svg>
  );
}
