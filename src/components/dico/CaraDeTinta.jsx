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
const OJO = { izq: 49, der: 71, cy: 52, rx: 8.4, ry: 12.2 };

function limitar(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(-1, Math.min(1, numero));
}

function Ojo({ lado, cx, lookX, lookY }) {
  const mirada = {
    '--dico-look-x': `${limitar(lookX) * 2.6}px`,
    '--dico-look-y': `${limitar(lookY) * 1.8}px`,
  };

  return (
    <g className={`dico-ojo dico-ojo--${lado}`}>
      <ellipse
        className="dico-esclera"
        cx={cx}
        cy={OJO.cy}
        rx={OJO.rx}
        ry={OJO.ry}
        fill={PAPEL}
        stroke={TINTA}
        strokeWidth="2.4"
      />

      <g className="dico-pupila-estado">
        <g className="dico-pupila-param" style={mirada}>
          <g className="dico-pupila-micro">
            <ellipse className="dico-pupila-forma" cx={cx} cy={OJO.cy + 1} rx="4.9" ry="8.2" fill={TINTA} />
            <ellipse className="dico-brillo-principal" cx={cx - 1.8} cy={OJO.cy - 3.4} rx="1.55" ry="2.35" fill={PAPEL} />
            <circle className="dico-brillo-secundario" cx={cx + 1.7} cy={OJO.cy + 4.2} r=".9" fill={PAPEL} opacity=".82" />
          </g>
        </g>
      </g>

      <path
        className="dico-parpado"
        d={`M${cx - 6.8} ${OJO.cy - 1} Q${cx} ${OJO.cy - 5.8} ${cx + 6.8} ${OJO.cy - 1}`}
        fill="none"
        stroke={TINTA}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  );
}

export default function CaraDeTinta({ lookX = 0, lookY = 0 }) {
  return (
    <g className="dico-tinta-cara">
      <g className="dico-cejas" stroke={TINTA} strokeWidth="3" strokeLinecap="round" fill="none">
        <path className="dico-ceja dico-ceja--izq" d="M40 37.5 Q48 33.7 56 37.2" />
        <path className="dico-ceja dico-ceja--der" d="M64 37.2 Q72 33.7 80 37.5" />
      </g>

      <g className="dico-ojos">
        <Ojo lado="izq" cx={OJO.izq} lookX={lookX} lookY={lookY} />
        <Ojo lado="der" cx={OJO.der} lookX={lookX} lookY={lookY} />
      </g>

      <path className="dico-boca dico-boca--neutra" d="M55 72.5 Q60 75.2 65 72.5"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <path className="dico-boca dico-boca--pensando" d="M56 74 Q60 72.8 64 74"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <g className="dico-boca dico-boca--contenta">
        <path d="M52 70.5 Q60 76.5 68 70.5 Q67.5 82.5 60 83.5 Q52.5 82.5 52 70.5Z" fill={TINTA} />
        <path d="M53.7 72 Q60 76 66.3 72 L65.8 75.3 Q60 77.8 54.2 75.3Z" fill={PAPEL} />
      </g>

      <path className="dico-boca dico-boca--tensa" d="M54 74.8 Q60 75.4 66 74.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

      <path className="dico-boca dico-boca--pregunta" d="M55 74.5 Q61 77 66 72.8"
        stroke={TINTA} strokeWidth="2.7" strokeLinecap="round" fill="none" />

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
