// Dico: la cara de tinta sobre la moneda, los 5 estados x 3 tamanios, y el
// globo hablando.
//
// Existe porque la unica verificacion registrada del personaje fue "se vio en
// la vitrina" sin decir a que tamanio ni sobre que fondo. A 30px y a 120px son
// dibujos distintos (`size` es nivel de detalle) y el oro cambia de lectura
// segun el fondo. Esta pantalla es lo que hay que mirar antes de mergear
// cualquier cambio al personaje.
import { useState } from 'react';
import DicoCara, { ESTADOS_DICO } from 'app/components/dico/DicoCara.jsx';
import BurbujaDico from 'app/components/dico/BurbujaDico.jsx';
import DicoEscena, { POSES_DICO_ESCENA } from 'app/components/dico/DicoEscena.jsx';
import DicoCoreEscena from 'app/components/dico/DicoCoreEscena.jsx';
import DicoAvisos from 'app/components/admin/platform/DicoAvisos.jsx';

const TAMANIOS = [30, 48, 120];

// Textos reales del tono de `reglas.js`: cortos, concretos y con una accion.
const DIALOGO = [
  { nivel: 'alerta', estado: 'preocupado', accion: 'Ver stock',
    texto: 'Te quedan 3 porciones de muzzarella y hoy vendiste 14. Mañana a las 9 no tenés con qué abrir.' },
  { nivel: 'aviso', estado: 'pregunta', accion: 'Ver el pedido',
    texto: 'Hay un pedido del 20 de agosto que nunca se completó. ¿Lo cobraste por fuera?' },
  { nivel: 'sugerencia', estado: 'esperando', accion: 'Ver receta',
    texto: 'La gaseosa es lo que más vendés y lo que menos deja: 10% contra 60% del resto.' },
];

const PRODUCTO = { id: 'p1', name: 'Milanesa', price: 5000, active: true };
const INSUMO = {
  id: 'i1', name: 'Harina', cost: 100, stock: 10, min_stock: 0, food_category: 'dry',
};
const BASE_AVISOS = {
  vertical: 'gastro',
  productos: [PRODUCTO],
  insumos: [INSUMO],
  recetas: new Map([['p1', [{ ingredient_id: 'i1', qty: 1 }]]]),
  gastos: [{ date: '2026-08-05' }],
  settings: { waste_pct: 0, expense_pct: 0 },
  hoy: new Date('2026-08-16T12:00:00Z'),
  listo: true,
};
const CASOS_AVISOS = {
  alerta: { ...BASE_AVISOS, productos: [{ ...PRODUCTO, price: 0 }], recetas: new Map() },
  espera: { ...BASE_AVISOS, recetas: new Map() },
  limpio: BASE_AVISOS,
};

function Fila({ estado, fondo, tinta }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 18px',
      borderRadius: 12, background: fondo, color: tinta,
    }}>
      <div style={{ flexBasis: '100%', fontSize: 12, fontWeight: 700, opacity: .8 }}>{estado}</div>
      {TAMANIOS.map((s) => (
        <div key={s} style={{ display: 'grid', placeItems: 'center', gap: 6 }}>
          <DicoCara estado={estado} size={s} />
          <span style={{ fontSize: 10, opacity: .5 }}>{s}px</span>
        </div>
      ))}
    </div>
  );
}

function Vitrina() {
  const [pasada, setPasada] = useState(0);
  const [i, setI] = useState(0);
  const [cerrado, setCerrado] = useState(false);
  const [casoAviso, setCasoAviso] = useState('alerta');
  const [salidaAviso, setSalidaAviso] = useState('');
  const d = DIALOGO[i];

  return (
    <div style={{ display: 'grid', gap: 26, fontFamily: 'system-ui, sans-serif' }}>

      <section style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 26, padding: 26,
        borderRadius: 16, background: 'linear-gradient(140deg,#1a1712,#0d0b08)',
        color: '#f5f1ea',
      }}>
        <DicoCara key={pasada} estado="idle" size={190} entrada title="Dico" />
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>Entrada</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, opacity: .7, maxWidth: 330 }}>
            Dico aparece de espaldas y se da vuelta para recibirte. Es el único
            momento caro que se permite: la primera vez que lo ves, en el alta.
          </p>
          <button
            type="button" onClick={() => setPasada((p) => p + 1)}
            style={{
              padding: '9px 18px', borderRadius: 999, cursor: 'pointer', border: 'none',
              background: '#f2b830', color: '#2b1d02', font: 'inherit', fontSize: 13, fontWeight: 700,
            }}
          >
            Verla de nuevo
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Estado vacío real — Dico Core</h3>
        <div style={{ padding: 18, borderRadius: 14, background: '#f4f1ea' }}>
          <DicoCoreEscena
            estado="pregunta"
            lookY={0.65}
            texto="Empecemos por tu primer producto. Cargalo y queda publicado en tu catálogo."
            accion="+ Agregar producto"
            onAccion={() => {}}
          />
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Aviso real del panel</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {Object.keys(CASOS_AVISOS).map(caso => (
            <button
              key={caso}
              type="button"
              onClick={() => { setCasoAviso(caso); setSalidaAviso(''); }}
              style={{
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                fontSize: 12, fontWeight: 700,
                border: casoAviso === caso ? '2px solid #2b1d02' : '1px solid rgba(0,0,0,.18)',
                background: casoAviso === caso ? '#f2b830' : '#fff', color: '#2b1d02',
              }}
            >
              {caso === 'alerta' ? 'Alerta + siguiente' : caso === 'espera' ? 'Sólo espera' : 'Sin avisos'}
            </button>
          ))}
        </div>
        <div style={{ minHeight: 138, borderRadius: 14, background: '#f4f1ea', overflow: 'hidden' }}>
          <DicoAvisos
            key={casoAviso}
            {...CASOS_AVISOS[casoAviso]}
            onIr={tab => setSalidaAviso(`Ir a ${tab}`)}
          />
          {casoAviso === 'limpio' && (
            <p style={{ margin: 0, padding: 22, fontSize: 13, opacity: .6 }}>
              Sin avisos: Dico no ocupa espacio ni interrumpe.
            </p>
          )}
          {salidaAviso && (
            <p style={{ margin: '0 20px 14px', fontSize: 12, fontWeight: 700 }}>{salidaAviso}</p>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Poses grandes heredadas — todavía no migradas</h3>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
          gap: 10, padding: 14, borderRadius: 14, background: '#141210', color: '#f5f1ea',
        }}>
          {POSES_DICO_ESCENA.map((pose) => (
            <div key={pose} style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
              <DicoEscena pose={pose} size={132} />
              <span style={{ fontSize: 11, opacity: .65 }}>{pose}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Mirada paramétrica</h3>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'end', justifyContent: 'center', gap: 24,
          padding: 18, borderRadius: 14, background: '#f4f1ea',
        }}>
          {[-.8, 0, .8].map(lookX => (
            <div key={lookX} style={{ display: 'grid', justifyItems: 'center', gap: 5 }}>
              <DicoCara estado="pregunta" size={96} lookX={lookX} />
              <span style={{ fontSize: 10, opacity: .55 }}>lookX {lookX}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Hablando</h3>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4, padding: 22,
          borderRadius: 12, background: '#f4f1ea',
        }}>
          <DicoCara estado={d.estado} size={96} />
          {!cerrado && (
            <BurbujaDico
              key={i}
              texto={d.texto}
              nivel={d.nivel}
              accion={d.accion}
              restantes={DIALOGO.length - 1 - i}
              onSiguiente={() => setI((n) => Math.min(n + 1, DIALOGO.length - 1))}
              onCerrar={() => setCerrado(true)}
            />
          )}
          {cerrado && (
            <button
              type="button" onClick={() => { setCerrado(false); setI(0); }}
              style={{ marginLeft: 20, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid rgba(0,0,0,.2)', background: 'transparent', font: 'inherit', fontSize: 13 }}
            >
              Volver a empezar
            </button>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Sobre claro</h3>
        {ESTADOS_DICO.map((e) => <Fila key={e} estado={e} fondo="#faf7f1" tinta="#2b1d02" />)}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, opacity: .6 }}>Sobre oscuro</h3>
        {ESTADOS_DICO.map((e) => <Fila key={e} estado={e} fondo="#141210" tinta="#f5f1ea" />)}
      </section>

    </div>
  );
}

export default {
  titulo: 'Dico Core — anatomía modular, estados y globo',
  componente: Vitrina,
};
