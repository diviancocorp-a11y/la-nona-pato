// src/components/admin/platform/NavLateral.jsx
//
// La navegacion lateral del edificio, solo para el shell desktop.
//
// ── NO ES UN SEGUNDO REGISTRY ──
// Recibe el MISMO array `tabs` que `NavInferior`, armado en `PlatformAdmin`
// cruzando rubro (`modulosDe`), modulos implementados y permisos (`puedeVer`).
// Una seccion que el rol no puede ver no existe en ese array, asi que tampoco
// existe aca. No hay lista de modulos, ni de rotulos, ni de rutas propia: si
// aparece una, es un bug.
//
// ── POR QUE SE SUPERPONE AL EXPANDIRSE ──
// Colapsada ocupa un riel de 64px y el workspace se corre esos 64px. Al
// expandirse NO empuja: crece por encima del contenido. Empujar significaria
// re-maquetar la pantalla de trabajo entera cada vez que el mouse roza el
// borde izquierdo, que es exactamente el "respirar" que hay que evitar.
//
// ── POR QUE LOS ICONOS NO SE MUEVEN ──
// Cada item es una grilla de dos columnas: la primera mide 64px SIEMPRE —el
// ancho del riel— y contiene el icono; la segunda es el rotulo y solo existe
// visualmente al expandir. El icono queda clavado en la misma X y la misma Y
// en los dos estados. Si el rotulo estuviera en el flujo del mismo bloque,
// aparecer lo empujaria.

import { useId } from 'react';

/**
 * @param {object} props
 * @param {Array<{id:string,label:string,Icon:Function}>} props.tabs  fuente unica
 * @param {string} props.tab      seccion activa
 * @param {(id:string)=>void} props.onTab
 * @param {number} [props.openCount]  badge de pedidos en curso
 * @param {import('react').ReactNode} [props.presencia]  el bloque de Dico
 */
export default function NavLateral({ tabs, tab, onTab, openCount = 0, presencia = null }) {
  const tituloId = useId();

  // `ms-trace` (PASS 2): la MISMA trama diagonal de la topbar y del bottom
  // nav. El riel y la barra son el mismo chasis y tenian acabados distintos;
  // la textura es lo que los hace leer como una sola pieza. Vale para el
  // colapsado y para el expandido: es la misma superficie.
  return (
    <aside className="ag-sidebar ms-trace" aria-label="Navegación lateral">
      {/* Bloque de marca. En colapsado se ve solo Dico; al expandir aparece el
          wordmark A SU DERECHA. Dico no se reemplaza ni se mueve: sigue siendo
          el mismo control en el mismo lugar, que es lo que lo hace invocable
          sin que el usuario tenga que volver a buscarlo. */}
      <div className="ag-sidebar-marca">
        <div className="ag-sidebar-presencia">{presencia}</div>
        <span className="ag-sidebar-wordmark" aria-hidden="true">DICO</span>
      </div>

      <nav className="ag-sidebar-nav" aria-labelledby={tituloId}>
        <h2 id={tituloId} className="ag-sr-only">Secciones</h2>
        <ul className="ag-sidebar-lista">
          {tabs.map(({ id, label, Icon }) => {
            const activo = tab === id;
            const badge = id === 'orders' ? openCount : 0;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`ag-sidebar-item ${activo ? 'active' : ''}`}
                  data-section={id}
                  onClick={() => onTab(id)}
                  aria-current={activo ? 'page' : undefined}
                  // El nombre accesible NO depende de que el rotulo se vea:
                  // colapsada la sidebar sigue siendo navegable con lector.
                  aria-label={`${label}${badge ? ` (${badge} en curso)` : ''}`}
                >
                  <span className="ag-sidebar-icono">
                    <Icon />
                    {badge > 0 && (
                      <span className="ag-sidebar-badge" aria-hidden="true">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </span>
                  <span className="ag-sidebar-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
