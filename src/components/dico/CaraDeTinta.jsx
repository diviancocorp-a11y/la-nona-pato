/**
 * CaraDeTinta — la cara de Dico, en tinta plana sobre el render 3D.
 *
 * POR QUE TINTA Y NO 3D
 * Una cara 3D con mejillas y nariz esculpidas se ve "humana": pretende ser real
 * y no llega. Una de tinta no puede caer ahi. Y de paso: la moneda es UN
 * render en vez de seis que calcen entre si, una expresion nueva cuesta dos
 * paths, el parpadeo y las pupilas existen, y a 30px la tinta se lee donde un
 * sombreado 3D se empasta.
 *
 * SIN PESTANIAS. Dico es varon. Tampoco van las rayitas arriba del ojo: leen
 * como pestanias aunque no lo sean.
 *
 * LA GALERA YA NO SE DIBUJA ACA: viene en el render, con el mismo material que
 * la moneda, que se ve mejor que cualquier sombrero plano encima. Lo unico que
 * eso obliga es a mantener la cara por debajo del ala (ver ZONA).
 *
 * IDENTIDAD CANONICA
 * Ojos negros con doble brillo, nariz redonda y bigote blanco son constantes.
 * Los estados cambian cejas, mirada y boca, nunca esos tres rasgos. Asi el Dico
 * de 30px y las escenas grandes siguen siendo el mismo personaje.
 *
 * COORDENADAS
 * viewBox de 120x120. `CAMPO` es el disco liso del render, MEDIDO en pixeles
 * sobre la imagen, no estimado. Radios distintos en x e y porque la moneda del
 * render es una elipse.
 */

/** El disco liso, medido sobre el render y pasado al viewBox de 120. */
export const CAMPO = { cx: 60, cy: 65, rx: 32.8, ry: 36.2 };

/** El ala de la galera tapa la moneda hasta esta altura: la cara va debajo. */
export const ZONA = { arriba: 36, abajo: 101 };

const TINTA = '#241a08';
const PAPEL = '#fdf7ea';

const OJO = { izq: 48.5, der: 71.5, cy: 59, rx: 10.8, ry: 14.2 };

function Ojo({ cx }) {
  return (
    <g className="dico-ojo-tinta">
      <ellipse cx={cx} cy={OJO.cy} rx={OJO.rx} ry={OJO.ry} fill={PAPEL} stroke={TINTA} strokeWidth="2.5" />
      <g className="dico-pupila">
        <ellipse cx={cx} cy="60" rx="7.8" ry="11.2" fill={TINTA} />
        <circle cx={cx - 2.8} cy="54" r="2.9" fill={PAPEL} />
        <circle cx={cx + 2.8} cy="65.7" r="1.35" fill={PAPEL} opacity=".7" />
      </g>
    </g>
  );
}

function BigoteCanonico() {
  return (
    <g className="dico-bigote" fill={PAPEL} stroke={TINTA} strokeWidth="2.5" strokeLinejoin="round">
      <path d="M60 74.5 C55.5 71.5 50.4 71.2 46.5 74.3 C42.4 77.7 38.9 80.1 34.8 77.4 C31.9 75.5 30.3 76.4 31.4 79.5 C33.2 84.7 39.2 86.1 45.3 82.8 C44.6 85.6 42.7 87.2 40.4 88 C47.5 89.9 55.6 86 60 80.3 Z" />
      <path d="M60 74.5 C64.5 71.5 69.6 71.2 73.5 74.3 C77.6 77.7 81.1 80.1 85.2 77.4 C88.1 75.5 89.7 76.4 88.6 79.5 C86.8 84.7 80.8 86.1 74.7 82.8 C75.4 85.6 77.3 87.2 79.6 88 C72.5 89.9 64.4 86 60 80.3 Z" />
      <path d="M42.8 82.8 Q50.6 82 57.6 77.4 M77.2 82.8 Q69.4 82 62.4 77.4"
        fill="none" strokeWidth="1.1" opacity=".18" />
    </g>
  );
}

export default function CaraDeTinta() {
  return (
    <g className="dico-tinta-cara">

      {/* Cejas: en este estilo son la mitad del caracter, asi que estan
          SIEMPRE. Los estados las mueven, no las prenden. */}
      <g className="dico-ceja-base" stroke={TINTA} strokeWidth="3" strokeLinecap="round" fill="none">
        <path className="dico-ceja dico-ceja--izq" d="M36 44 q10 -6 21 -1.5" />
        <path className="dico-ceja dico-ceja--der" d="M63 42.5 q10 -4.5 21 1.5" />
      </g>

      {/* Rubor a rayitas: asi se hacia cuando no habia medios tonos. */}
      <g className="dico-rubor" stroke={TINTA} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M31 72 l4 4 M35 70.5 l4 4 M39 70 l4 4" />
        <path d="M89 72 l-4 4 M85 70.5 l-4 4 M81 70 l-4 4" />
      </g>

      {/* ── Bocas. Una sola visible por estado. ── */}

      <path className="dico-boca dico-boca--neutra" d="M54 89 Q60 94 66 89"
        stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" fill="none" />

      {/* Media sonrisa corrida: la cara de estar mirando otra cosa. */}
      <path className="dico-boca dico-boca--media" d="M54 91 q6 2 12 -1"
        stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" fill="none" />

      {/* Boca abierta, con dientes y lengua. La lengua es la unica pieza que no
          es tinta ni papel, y es a proposito: en estos dibujos siempre canta. */}
      <g className="dico-boca dico-boca--feliz">
        <path d="M48 82 Q60 89 72 82 Q72 98 60 99 Q48 98 48 82 z" fill={TINTA} />
        <path d="M50 83.5 Q60 89 70 83.5 L69 88 Q60 91 51 88 z" fill={PAPEL} />
        <ellipse cx="60" cy="94" rx="7" ry="3.8" fill="#d9694f" />
      </g>

      {/* La mueca de que algo no cierra. */}
      <path className="dico-boca dico-boca--onda" d="M51 92 q4.5 -3.8 9 0 t9 0"
        stroke={TINTA} strokeWidth="2.8" strokeLinecap="round" fill="none" />

      {/* La "o" de la duda. */}
      <ellipse className="dico-boca dico-boca--o" cx="60" cy="91" rx="4.7" ry="6.2" fill={TINTA} />

      <g className="dico-ojo-normal">
        <Ojo cx={OJO.izq} />
        <Ojo cx={OJO.der} />
      </g>

      {/* Ojos de felicidad: conservan el ancho y la posicion de los canonicos. */}
      <g className="dico-ojo-feliz" stroke={TINTA} strokeWidth="3.8" strokeLinecap="round" fill="none">
        <path d="M38 62 q10.5 -12 21 0" />
        <path d="M61 62 q10.5 -12 21 0" />
      </g>

      <BigoteCanonico />
      <circle className="dico-nariz" cx="60" cy="72.5" r="5.4"
        fill={PAPEL} stroke={TINTA} strokeWidth="2.5" />

      {/* ── Adornos: viven FUERA de la moneda a proposito ── */}

      <g className="dico-espera-puntos" fill={TINTA} stroke={PAPEL} strokeWidth="1.1">
        <circle className="dico-espera-punto" cx="48" cy="-1" r="3" />
        <circle className="dico-espera-punto" cx="60" cy="-1" r="3" />
        <circle className="dico-espera-punto" cx="72" cy="-1" r="3" />
      </g>

      <g className="dico-gota">
        <path d="M99 40 c3.6 5.8 5.6 8 5.6 10.6 a5.6 5.6 0 0 1 -11.2 0 c0 -2.6 2 -4.8 5.6 -10.6 z"
          fill="#bfe4f5" stroke={TINTA} strokeWidth="2.2" />
      </g>

      <text className="dico-signo" x="103" y="38" fontSize="30" fontWeight="900"
        textAnchor="middle" fill={TINTA} fontFamily="Georgia, 'Times New Roman', serif">?</text>

    </g>
  );
}
