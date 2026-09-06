/**
 * Los tres controles que no son navegacion: configuracion, tema y salir.
 *
 * DOS FORMAS, UNA FUENTE
 * Vivian sueltos en la barra de arriba y a 375px peleaban por la fila con el
 * saludo y con Dico. Ahora tienen un solo lugar por chasis:
 *
 *   desktop  al PIE del riel. Los tres iconos se ven siempre —esconderlos
 *            dejaba el hueco igual—; al abrirse aparece el rotulo.
 *   mobile   un solo boton en la barra, y los otros dos adentro.
 *
 * Los tres salen del MISMO array (`controlesDeSesion`), asi que agregar uno
 * no puede quedar en la mitad de los chasis.
 *
 * El pie del riel reusa `.ag-sidebar-item`: misma grilla de dos columnas,
 * mismo target de 44 y mismo comportamiento de rotulo que la navegacion. No
 * es una lista nueva con su propio estilo.
 */
import { useEffect, useRef, useState } from 'react';

/* Los iconos, en linea y del mismo trazo que los de la navegacion (22px,
   stroke 2, redondeado). Van aca y no en un modulo de iconos porque son tres
   y solo los usa este archivo. */
const IconoConfig = () => (
  <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconoSol = () => (
  <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const IconoLuna = () => (
  <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

const IconoSalir = () => (
  <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);

/** La lista, en el orden en que se usa: lo de todos los dias primero. */
export function controlesDeSesion({ tema, onTema, onConfig, onSalir, salirTitulo }) {
  const oscuro = tema === 'dark';
  return [
    onConfig && {
      id: 'config',
      label: 'Configuración',
      titulo: 'Configuración del negocio',
      Icono: IconoConfig,
      onClick: onConfig,
    },
    {
      id: 'tema',
      label: oscuro ? 'Tema claro' : 'Tema oscuro',
      titulo: oscuro ? 'Cambiar a claro' : 'Cambiar a oscuro',
      Icono: oscuro ? IconoSol : IconoLuna,
      onClick: onTema,
    },
    {
      id: 'salir',
      label: 'Salir',
      titulo: salirTitulo,
      Icono: IconoSalir,
      onClick: onSalir,
    },
  ].filter(Boolean);
}

/** El pie del riel, en desktop. */
export function PieDeSesion({ controles }) {
  if (!controles.length) return null;
  return (
    <div className="ag-sidebar-pie">
      {controles.map(({ id, label, titulo, Icono, onClick }) => (
        <button
          key={id}
          type="button"
          className="ag-sidebar-item"
          onClick={onClick}
          title={titulo}
          aria-label={label}
        >
          <span className="ag-sidebar-icono"><Icono /></span>
          <span className="ag-sidebar-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * En mobile: un solo boton y los tres adentro.
 *
 * Se cierra tocando afuera y con Escape — las dos salidas que un menu tiene
 * que tener para no ser una trampa en una pantalla de 375px.
 */
export function MenuDeSesion({ controles }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const afuera = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false);
    };
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('pointerdown', afuera, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', afuera, true);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  if (!controles.length) return null;

  return (
    <div className="ag-sesion" ref={raiz}>
      <button
        type="button"
        className="ag-theme-toggle"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Configuración y cuenta"
      >
        <IconoConfig />
      </button>

      {abierto && (
        <div className="ag-sesion-menu" role="menu">
          {controles.map(({ id, label, titulo, Icono, onClick }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className="ag-sesion-item"
              title={titulo}
              onClick={() => { setAbierto(false); onClick(); }}
            >
              <Icono />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
