/**
 * Vitrina — ver UNA pantalla del panel sin base, sin sesion y sin tenant.
 *
 * El panel exige login y un negocio real, asi que las pantallas nuevas se
 * venian dando por buenas con tests de render: nadie las miraba. Esto sirve el
 * componente solo, con datos de mentira, en el navegador.
 *
 * NO reemplaza probar contra la base. Prueba como SE VE algo, no si la base
 * contesta lo que la pantalla cree. Los bugs de las ultimas dos etapas
 * salieron ejecutando SQL, y van a seguir saliendo de ahi.
 */
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { cargarEscena } from './fake-supabase.js';

// El glob deja que agregar una escena sea agregar un archivo, sin registro que
// mantener al dia (y sin que alguien se olvide de anotarla).
const MODULOS = import.meta.glob('./escenas/*.jsx', { eager: true });

const ESCENAS = Object.fromEntries(
  Object.entries(MODULOS).map(([ruta, mod]) => [
    ruta.replace('./escenas/', '').replace('.jsx', ''),
    mod.default,
  ]),
);

const NOMBRES = Object.keys(ESCENAS).sort();

function Vitrina() {
  const inicial = new URLSearchParams(location.search).get('escena');
  const [nombre, setNombre] = useState(
    NOMBRES.includes(inicial) ? inicial : NOMBRES[0],
  );
  const escena = ESCENAS[nombre];

  // Los datos se cargan ANTES de montar la pantalla: si se hiciera despues, el
  // primer fetch del componente encontraria el fake vacio.
  const [listo, setListo] = useState(false);
  useEffect(() => {
    setListo(false);
    cargarEscena(escena?.datos);
    const url = new URL(location.href);
    url.searchParams.set('escena', nombre);
    history.replaceState(null, '', url);
    setListo(true);
  }, [nombre, escena]);

  const Pantalla = escena?.componente;

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.12)',
        background: '#fff', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <strong style={{ fontSize: 13, marginRight: 6 }}>Vitrina</strong>
        {NOMBRES.map(n => (
          <button
            key={n} type="button" onClick={() => setNombre(n)}
            style={{
              padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
              font: 'inherit', fontSize: 13,
              border: n === nombre ? '1px solid #111' : '1px solid rgba(0,0,0,0.18)',
              background: n === nombre ? '#111' : 'transparent',
              color: n === nombre ? '#fff' : 'inherit',
            }}
          >
            {n}
          </button>
        ))}
        <span style={{ fontSize: 12, color: '#777', marginLeft: 'auto' }}>
          {escena?.titulo || ''}
        </span>
      </nav>

      <main style={{ padding: 16 }}>
        {/* La key remonta la pantalla al cambiar de escena: sin eso se queda el
            estado de la anterior y se ven cosas que no pasan en el panel. */}
        {listo && Pantalla && <Pantalla key={nombre} {...(escena.props || {})} />}
      </main>
    </div>
  );
}

// El root se guarda en el nodo y no en una variable del modulo: con HMR este
// archivo se vuelve a ejecutar, y un segundo createRoot sobre el mismo nodo
// llena la consola de errores de React. Justo la consola que se mira para
// saber si la pantalla esta rota.
const nodo = document.getElementById('root');
nodo.__root = nodo.__root || createRoot(nodo);
nodo.__root.render(<Vitrina />);
