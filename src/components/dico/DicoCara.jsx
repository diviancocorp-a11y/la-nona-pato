/**
 * DicoCara — la cara de Dico dentro de la app. Capa 1 del PLAN-DICO.
 *
 * SIN PIERNAS a proposito. La version con piernas y zapatos es para
 * marketing; adentro Dico vive en 26px al lado de un aviso, y a ese tamano
 * las piernas son dos palitos que no se distinguen. Una sola version adentro
 * es lo que hace que cinco estados se sientan el mismo personaje.
 *
 * SVG y no video: los mp4 no tienen canal alfa (el fondo "transparente" sale
 * blanco) y 13 clips pesan mas que toda la app, que se usa desde el telefono
 * de una cocina. Esto pesa kilobytes, escala sin pixelarse y cambia de estado
 * sin cargar nada.
 *
 * El truco para que se vea 3D siendo 2D (ver platform/PLAN-DICO.md):
 *   1. la luz NUNCA se mueve — el degrade, el brillo y la media luna de
 *      sombra quedan clavados aunque el cuerpo se mueva
 *   2. la cara viaja MAS que el cuerpo y se angosta al llegar al borde
 *   3. el canto de la moneda asoma al girar (grosor)
 *   4. squash & stretch conservando volumen
 *   5. la cara llega tarde a lo que hace el cuerpo (follow-through)
 *
 * Respeta `prefers-reduced-motion`: quien pidio menos movimiento ve a Dico
 * quieto, no una animacion mas suave.
 */
import './dico.css';

export const ESTADOS_DICO = ['idle', 'esperando', 'contento', 'preocupado', 'pregunta'];

export default function DicoCara({ estado = 'idle', size = 48, title }) {
  const seguro = ESTADOS_DICO.includes(estado) ? estado : 'idle';

  return (
    <svg
      className={`dico dico--${seguro}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      <defs>
        {/* Los ids llevan el tamano para no chocar si hay dos Dicos en la
            misma pantalla: dos <defs> con el mismo id y gana el primero. */}
        <radialGradient id={`dico-cuerpo-${size}`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffd968" />
          <stop offset="55%" stopColor="#f0b429" />
          <stop offset="100%" stopColor="#b07d0e" />
        </radialGradient>
        <radialGradient id={`dico-brillo-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`dico-clip-${size}`}>
          <circle cx="60" cy="60" r="46" />
        </clipPath>
      </defs>

      {/* Bracitos: van detras del cuerpo */}
      <path className="dico-brazo dico-brazo--izq" d="M17 68 Q 6 74 4 86"
        stroke="#b07d0e" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path className="dico-brazo dico-brazo--der" d="M103 68 Q 114 74 116 86"
        stroke="#b07d0e" strokeWidth="7" strokeLinecap="round" fill="none" />

      <g className="dico-cuerpo">
        {/* Canto: solo se ve al girar. Es lo que le da grosor de moneda. */}
        <ellipse className="dico-canto" cx="106" cy="60" rx="5" ry="45" fill="#8a610a" />
        <circle cx="60" cy="60" r="46" fill={`url(#dico-cuerpo-${size})`} />
        {/* Media luna de sombra, del lado opuesto a la luz. NO se mueve. */}
        <path d="M60 14 a46 46 0 0 1 0 92 a41 41 0 0 0 10 -92 z"
          fill="#8a610a" opacity="0.45" transform="rotate(40 60 60)" />
        <circle cx="60" cy="60" r="38" fill="none" stroke="#c98f12" strokeWidth="2" opacity="0.7" />
        {/* Brillo especular: clavado arriba-izquierda, pase lo que pase. */}
        <ellipse cx="44" cy="36" rx="15" ry="9" fill={`url(#dico-brillo-${size})`}
          transform="rotate(-28 44 36)" />
      </g>

      {/* La cara vive RECORTADA por la moneda: por eso puede viajar mas que
          el cuerpo sin salirse, que es lo que la hace parecer una esfera. */}
      <g clipPath={`url(#dico-clip-${size})`}>
        <g className="dico-cara">
          <path className="dico-ceja dico-ceja--izq" d="M40 42 q6 -5 12 -2"
            stroke="#5c430a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path className="dico-ceja dico-ceja--der" d="M68 40 q6 -3 12 2"
            stroke="#5c430a" strokeWidth="3.5" strokeLinecap="round" fill="none" />

          <ellipse className="dico-ojo dico-ojo--izq" cx="47" cy="56" rx="5" ry="7" fill="#3d2c05" />
          <ellipse className="dico-ojo dico-ojo--der" cx="73" cy="56" rx="5" ry="7" fill="#3d2c05" />
          {/* Brillitos del lado de LA LUZ, no del centro del ojo. */}
          <circle cx="45" cy="53" r="1.6" fill="#fff" opacity="0.9" />
          <circle cx="71" cy="53" r="1.6" fill="#fff" opacity="0.9" />

          <path className="dico-boca" d="M48 76 Q60 84 72 76"
            stroke="#3d2c05" strokeWidth="3.5" strokeLinecap="round" fill="none" />

          <ellipse className="dico-cachete" cx="36" cy="70" rx="5.5" ry="3.5" fill="#e08a1e" opacity="0.5" />
          <ellipse className="dico-cachete" cx="84" cy="70" rx="5.5" ry="3.5" fill="#e08a1e" opacity="0.5" />
        </g>
      </g>
    </svg>
  );
}
