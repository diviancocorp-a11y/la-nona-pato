/**
 * CaraDeTinta — anatomia facial unica y modular de Dico Core.
 *
 * El cuerpo sigue siendo un render. El rostro es un solo SVG cuyas piezas se
 * transforman por estado: cejas, ojos, pupilas, parpados y boca. No hay un
 * dibujo completo por emocion.
 *
 * Dico se reconoce sin accesorios: no tiene mejillas, pecas, nariz, bigote ni
 * sombrero dentro de esta capa. La cara vive un poco por encima del centro y
 * deja mucha moneda visible para que primero se lea MONEDA y despues rostro.
 */

/** Disco liso medido sobre el cuerpo Core sin galera, en viewBox 120x120. */
export const CAMPO = { cx: 60, cy: 56, rx: 35.8, ry: 32.4 };

/** Limites utiles para composiciones que recorten a Dico desde un Slot. */
export const ZONA = { arriba: 17, abajo: 90 };

const TINTA = '#1b170f';
const PAPEL = '#fff9ed';
const ORO_PARAPADO = '#fdce18';
const OJO = { izq: 49, der: 71, cy: 51.5, rx: 9.1, ry: 13.2 };

function limitar(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(-1, Math.min(1, numero));
}

function Ojo({ lado, cx, lookX, lookY }) {
  // Las dos pupilas comparten orientacion: espejarlas hace que Dico parezca bizco.
  const espejo = 1;
  const mirada = {
    '--dico-look-x': `${limitar(lookX) * 2.6}px`,
    '--dico-look-y': `${limitar(lookY) * 1.8}px`,
  };

  return (
    <g className={`dico-ojo dico-ojo--${lado}`}>
      <g className="dico-ojo-dibujo">
        <ellipse
          className="dico-esclera"
          cx={cx}
          cy={OJO.cy}
          rx={OJO.rx}
          ry={OJO.ry}
          fill={PAPEL}
          stroke={TINTA}
          strokeWidth="2.25"
        />

        <g className="dico-pupila-estado">
          <g className="dico-pupila-param" style={mirada}>
            <g className="dico-pupila-micro">
              <path
                className="dico-pupila-forma"
                d={`M${cx - 1.4 * espejo} ${OJO.cy - 8.3}
                  C${cx - 6.2 * espejo} ${OJO.cy - 7.5}, ${cx - 6.6 * espejo} ${OJO.cy - 1.2}, ${cx - 5.2 * espejo} ${OJO.cy + 3.7}
                  C${cx - 3.8 * espejo} ${OJO.cy + 8.4}, ${cx + 1.3 * espejo} ${OJO.cy + 9.1}, ${cx + 4.9 * espejo} ${OJO.cy + 5.4}
                  C${cx + 2.7 * espejo} ${OJO.cy + 3.2}, ${cx + 1.2 * espejo} ${OJO.cy + .9}, ${cx + .4 * espejo} ${OJO.cy - 1.2}
                  C${cx + 1.5 * espejo} ${OJO.cy - 3.6}, ${cx + 3.1 * espejo} ${OJO.cy - 5.2}, ${cx + 4.7 * espejo} ${OJO.cy - 6.2}
                  C${cx + 2.8 * espejo} ${OJO.cy - 7.8}, ${cx + .6 * espejo} ${OJO.cy - 8.5}, ${cx - 1.4 * espejo} ${OJO.cy - 8.3}Z`}
                fill={TINTA}
              />

              {/* Recorte crema angosto: firma retro sin desviar la mirada. */}
              <path
                className="dico-recorte-pupila"
                d={`M${cx + 5 * espejo} ${OJO.cy - 5.7}
                  C${cx + 3.4 * espejo} ${OJO.cy - 4.3}, ${cx + 2.2 * espejo} ${OJO.cy - 1.5}, ${cx + 2 * espejo} ${OJO.cy + .1}
                  C${cx + 2.8 * espejo} ${OJO.cy + 1.1}, ${cx + 3.8 * espejo} ${OJO.cy + 3}, ${cx + 5 * espejo} ${OJO.cy + 4.4}Z`}
                fill={PAPEL}
              />
            </g>
          </g>
        </g>

        <g className="dico-parpado">
          <path
            d={`M${cx - 8.8} ${OJO.cy - 1.2}
              C${cx - 8.1} ${OJO.cy - 9}, ${cx - 4.5} ${OJO.cy - 13}, ${cx} ${OJO.cy - 13}
              C${cx + 4.5} ${OJO.cy - 13}, ${cx + 8.1} ${OJO.cy - 9}, ${cx + 8.8} ${OJO.cy - 1.2}
              Q${cx} ${OJO.cy - 6.5} ${cx - 8.8} ${OJO.cy - 1.2}Z`}
            fill={ORO_PARAPADO}
          />
          <path
            className="dico-parpado-borde"
            d={`M${cx - 8.8} ${OJO.cy - 1.2} Q${cx} ${OJO.cy - 6.5} ${cx + 8.8} ${OJO.cy - 1.2}`}
            fill="none"
            stroke={TINTA}
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </g>
      </g>
    </g>
  );
}

export default function CaraDeTinta({ lookX = 0, lookY = 0 }) {
  return (
    <g className="dico-tinta-cara">
      <g className="dico-cejas" stroke={TINTA} strokeWidth="3" strokeLinecap="round" fill="none">
        <path className="dico-ceja dico-ceja--izq" d="M39.5 36.2 Q47.8 31.8 56.3 36.2" />
        <path className="dico-ceja dico-ceja--der" d="M63.7 36.2 Q72.2 31.8 80.5 36.2" />
      </g>

      <g className="dico-ojos">
        <Ojo lado="izq" cx={OJO.izq} lookX={lookX} lookY={lookY} />
        <Ojo lado="der" cx={OJO.der} lookX={lookX} lookY={lookY} />
      </g>

      <path className="dico-boca dico-boca--neutra" d="M53.8 71.5 Q59.7 76.8 66.5 70.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <path className="dico-boca dico-boca--pensando" d="M55 72.2 Q60 76.2 65.4 71.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <g className="dico-boca dico-boca--contenta">
        <path d="M51.5 69.5 Q59.7 76.2 68.7 69 Q68.2 82.8 60.4 84 Q52.2 82.7 51.5 69.5Z" fill={TINTA} />
        <path d="M53.2 71.2 Q60 75.6 67 70.6 L66.4 74.4 Q60 77.4 53.8 74.7Z" fill={PAPEL} />
      </g>

      <path className="dico-boca dico-boca--tensa" d="M54 74.8 Q60 75.4 66 74.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <path className="dico-boca dico-boca--pregunta" d="M54.4 73.2 Q60.8 77.5 66.7 71.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <g className="dico-signo-pregunta" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M88.8 18.5 C88.8 12.7 98.1 10.8 100.7 16.4 C103.2 21.8 96.5 24.8 93.8 28.5 L93.8 31"
          stroke={PAPEL} strokeWidth="5.8" />
        <circle cx="93.8" cy="36.2" r="2.6" fill={PAPEL} stroke="none" />
        <path d="M88.8 18.5 C88.8 12.7 98.1 10.8 100.7 16.4 C103.2 21.8 96.5 24.8 93.8 28.5 L93.8 31"
          stroke={TINTA} strokeWidth="2.8" />
        <circle cx="93.8" cy="36.2" r="1.1" fill={TINTA} stroke="none" />
      </g>

      {/* Tres frames simples para una futura sensacion de habla. */}
      <path className="dico-boca dico-boca--habla-cerrada" d="M55 74 Q60 75.4 65 74"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />
      <ellipse className="dico-boca dico-boca--habla-media" cx="60" cy="75" rx="4.8" ry="2.8" fill={TINTA} />
      <ellipse className="dico-boca dico-boca--habla-abierta" cx="60" cy="75" rx="4.8" ry="5.4" fill={TINTA} />

      {/* Los puntos son feedback de proceso, no anatomia. */}
      <g className="dico-espera-puntos" fill={TINTA} stroke={PAPEL} strokeWidth="1">
        <circle className="dico-espera-punto" cx="48" cy="7" r="2.7" />
        <circle className="dico-espera-punto" cx="60" cy="7" r="2.7" />
        <circle className="dico-espera-punto" cx="72" cy="7" r="2.7" />
      </g>
    </g>
  );
}
