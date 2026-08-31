// src/components/admin/platform/NavInferior.jsx
//
// La navegacion inferior del edificio, con desborde accesible.
//
// ── QUE ARREGLA ──
// Medido el 30/ago a 390x844: la pildora media 364px de ancho util y su
// contenido 515px. Los items son `flex-shrink: 0` con `white-space: nowrap` y
// la barra no tiene scroll, asi que las tres ultimas secciones —Caja, Salon y
// Equipo— terminaban en x=415, 471 y 527 con un viewport de 390. Inalcanzables
// por touch y por teclado. A 360x800 el desborde era de 181px.
//
// La barra tampoco cumplia el minimo de 44x44: cada item medía 42px de alto.
//
// ── EL PATRON ──
// Se conservan las acciones primarias visibles y el resto entra en un "Mas"
// que abre una hoja. Cuando la seccion activa vive en el desborde, el propio
// boton "Mas" toma el estado activo y muestra su nombre: el usuario siempre ve
// donde esta sin que los items se reordenen debajo del dedo.
//
// La lista de secciones NO se duplica: entra por props desde el mismo `tabs`
// de PlatformAdmin, que ya cruza rubro, modulos implementados y permisos. Una
// seccion que el rol no puede ver no existe en ese array, asi que tampoco
// aparece en el desborde.

import { useMemo, useRef, useState, useId } from 'react';
import Dialog from '../../ui/Dialog';

/** Cuantas secciones quedan a la vista. El resto va al desborde.
 *  4 + "Mas" entran en 360px con targets de 44: 110 + 3x44 + 44 + 4x4 = 302. */
export const PRIMARIAS = 4;

function MasIcon() {
  return (
    <svg className="ag-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {Array<{id:string,label:string,Icon:Function}>} props.tabs  fuente unica
 * @param {string} props.tab      seccion activa
 * @param {(id:string)=>void} props.onTab
 * @param {number} [props.openCount]  badge de pedidos en curso
 */
export default function NavInferior({ tabs, tab, onTab, openCount = 0 }) {
  const [masAbierto, setMasAbierto] = useState(false);
  const masRef = useRef(null);
  const tituloId = useId();

  const { primarias, desborde } = useMemo(() => {
    if (tabs.length <= PRIMARIAS + 1) return { primarias: tabs, desborde: [] };
    return { primarias: tabs.slice(0, PRIMARIAS), desborde: tabs.slice(PRIMARIAS) };
  }, [tabs]);

  const activaEnDesborde = desborde.find((t) => t.id === tab) || null;

  const irA = (id) => {
    setMasAbierto(false);
    onTab(id);
  };

  const badgeDe = (id) => (id === 'orders' ? openCount : 0);

  return (
    <>
      <nav className="ag-bottom-nav" aria-label="Navegación principal">
        {primarias.map(({ id, label, Icon }) => {
          const activo = tab === id;
          const badge = badgeDe(id);
          return (
            <button
              key={id}
              type="button"
              className={`ag-nav-item ${activo ? 'active' : ''}`}
              data-section={id}
              onClick={() => onTab(id)}
              aria-current={activo ? 'page' : undefined}
              aria-label={`${label}${badge ? ` (${badge} en curso)` : ''}`}
            >
              {badge > 0 && <span className="ag-nav-badge">{badge > 99 ? '99+' : badge}</span>}
              <Icon />
              <span className="ag-nav-label">{label}</span>
            </button>
          );
        })}

        {desborde.length > 0 && (
          <button
            ref={masRef}
            type="button"
            data-nav-overflow=""
            className={`ag-nav-item ag-nav-item--mas ${activaEnDesborde ? 'active' : ''}`}
            onClick={() => setMasAbierto(true)}
            aria-haspopup="dialog"
            aria-expanded={masAbierto}
            // Cuando la seccion actual esta adentro, el nombre accesible lo
            // dice: si no, el usuario no tendria forma de saber donde esta.
            aria-label={activaEnDesborde
              ? `Más secciones. Estás en ${activaEnDesborde.label}`
              : `Más secciones (${desborde.length})`}
            aria-current={activaEnDesborde ? 'page' : undefined}
          >
            <MasIcon />
            <span className="ag-nav-label">{activaEnDesborde ? activaEnDesborde.label : 'Más'}</span>
          </button>
        )}
      </nav>

      <Dialog
        open={masAbierto}
        onClose={() => setMasAbierto(false)}
        labelledBy={tituloId}
        variante="sheet"
        className="ag-nav-mas"
      >
        <h2 id={tituloId} className="ag-h3 ag-nav-mas-titulo">Más secciones</h2>
        <ul className="ag-nav-mas-lista">
          {desborde.map(({ id, label, Icon }) => {
            const activo = tab === id;
            const badge = badgeDe(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`ag-nav-mas-item ${activo ? 'active' : ''}`}
                  data-section={id}
                  onClick={() => irA(id)}
                  aria-current={activo ? 'page' : undefined}
                  aria-label={`${label}${badge ? ` (${badge} en curso)` : ''}`}
                >
                  <Icon />
                  <span>{label}</span>
                  {badge > 0 && <span className="ag-nav-badge ag-nav-mas-badge">{badge > 99 ? '99+' : badge}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
