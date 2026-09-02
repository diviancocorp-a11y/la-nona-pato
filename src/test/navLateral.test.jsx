import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NavLateral from '../components/admin/platform/NavLateral';
import NavInferior from '../components/admin/platform/NavInferior';

const RAIZ = process.cwd();
const sidebarCss = readFileSync(join(RAIZ, 'src/styles/admin-sidebar.css'), 'utf8');
const fuente = readFileSync(join(RAIZ, 'src/components/admin/platform/NavLateral.jsx'), 'utf8');

const Icono = () => React.createElement('svg', { className: 'ag-nav-icon' });
const TABS = [
  { id: 'products', label: 'Productos', Icon: Icono },
  { id: 'orders', label: 'Pedidos', Icon: Icono },
  { id: 'ventas', label: 'Ventas', Icon: Icono },
];

const montar = (props = {}) => render(React.createElement(NavLateral, {
  tabs: TABS, tab: 'orders', onTab: () => {}, ...props,
}));

describe('NavLateral', () => {
  it('no tiene un registry propio: todo lo que muestra entra por props', () => {
    // El riesgo real de agregar una segunda navegacion es que duplique la
    // lista de modulos y se desincronice de los permisos.
    //
    // Se mira el CODIGO, no los comentarios: el encabezado del componente
    // explica de donde sale `tabs` y nombra `modulosDe` y `puedeVer` a
    // proposito. Prohibir la palabra castigaria justo la documentacion que
    // hace falta; lo que no puede haber es la dependencia.
    const codigo = fuente
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

    for (const modulo of ['modules/registry', 'modules/roles', 'modulosDe', 'puedeVer', 'terminologia']) {
      expect(codigo, `NavLateral depende de ${modulo}`).not.toContain(modulo);
    }
    // Ni rotulos clavados: los ids de seccion no pueden aparecer en el codigo,
    // salvo `orders`, que es el unico acoplamiento real y esta declarado: el
    // badge de pedidos en curso. NavInferior tiene exactamente el mismo.
    for (const id of ['products', 'ventas', 'stock', 'finanzas', 'crm', 'config']) {
      expect(codigo, `NavLateral clava la seccion ${id}`).not.toContain(`'${id}'`);
    }
    expect(codigo, 'el badge de pedidos dejo de ser el unico acoplamiento').toContain("'orders'");
  });

  it('muestra exactamente las secciones que recibe, ni una mas', () => {
    const { container } = montar();
    const items = [...container.querySelectorAll('.ag-sidebar-item')];
    expect(items.map((b) => b.dataset.section)).toEqual(['products', 'orders', 'ventas']);
  });

  it('un rol con menos permisos ve menos secciones, sin tocar el componente', () => {
    // Es la misma prueba que protege a NavInferior: el filtro vive aguas
    // arriba, asi que recortar `tabs` recorta la sidebar.
    const { container } = montar({ tabs: TABS.slice(0, 1) });
    expect(container.querySelectorAll('.ag-sidebar-item')).toHaveLength(1);
  });

  it('las dos navegaciones coinciden en secciones y en estado activo', () => {
    // Dos chasis, una fuente: si divergieran, el usuario veria una seccion en
    // el telefono que no existe en la compu.
    const lateral = montar({ tab: 'ventas' });
    const inferior = render(React.createElement(NavInferior, {
      tabs: TABS, tab: 'ventas', onTab: () => {},
    }));
    const secciones = (raiz, sel) => [...raiz.querySelectorAll(sel)].map((b) => b.dataset.section);
    expect(secciones(lateral.container, '.ag-sidebar-item'))
      .toEqual(secciones(inferior.container, '.ag-nav-item[data-section]'));

    const activa = (raiz, sel) => [...raiz.querySelectorAll(sel)]
      .filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.dataset.section);
    expect(activa(lateral.container, '.ag-sidebar-item')).toEqual(['ventas']);
    expect(activa(lateral.container, '.ag-sidebar-item'))
      .toEqual(activa(inferior.container, '.ag-nav-item[data-section]'));
  });

  it('navega por el mismo callback', () => {
    const onTab = vi.fn();
    montar({ onTab });
    fireEvent.click(screen.getByRole('button', { name: 'Ventas' }));
    expect(onTab).toHaveBeenCalledWith('ventas');
  });

  it('el nombre accesible no depende de que el rotulo se vea', () => {
    // Colapsada los rotulos tienen opacidad 0. Si el nombre accesible saliera
    // de ese texto, la sidebar seria innavegable con lector de pantalla.
    const { container } = montar({ openCount: 4 });
    const pedidos = container.querySelector('[data-section="orders"]');
    expect(pedidos.getAttribute('aria-label')).toBe('Pedidos (4 en curso)');
    expect(container.querySelector('.ag-sidebar-badge').getAttribute('aria-hidden')).toBe('true');
  });

  it('el bloque de marca revela el wordmark AL LADO de la presencia', () => {
    const { container } = montar({
      presencia: React.createElement('span', { 'data-presencia': '' }),
    });
    const marca = container.querySelector('.ag-sidebar-marca');
    // Los dos conviven: el wordmark no reemplaza a Dico.
    expect(marca.querySelector('[data-presencia]')).toBeInTheDocument();
    expect(marca.querySelector('.ag-sidebar-wordmark')).toHaveTextContent('DICO');
    // Y el wordmark es decorativo: el nombre del control lo pone Dico.
    expect(marca.querySelector('.ag-sidebar-wordmark').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('NavLateral — contrato de layout', () => {
  it('solo existe arriba de la frontera desktop, y reusa la que ya habia', () => {
    expect(sidebarCss).toContain('@media (min-width: 769px)');
    // La sidebar arranca oculta: si el media query no aplica, no hay riel.
    expect(sidebarCss).toMatch(/\.ag-sidebar \{\s*display: none;\s*\}/);
  });

  it('la nav inferior se OCULTA donde la sidebar la sustituye, no se elimina', () => {
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    expect(desktop).toContain('.ag-root--con-sidebar .ag-bottom-nav { display: none; }');
  });

  it('no le toca el layout a los roots que NO montan sidebar', () => {
    // `.ag-root` lo comparten el admin legacy y el POS. Una regla suelta sobre
    // el les corria el contenido 64px y les escondia la nav inferior: se
    // quedaban sin navegacion por una hoja que no les corresponde.
    //
    // Sin regex a proposito: alcanza con mirar la parte de selector de cada
    // regla, que es lo que hay antes de la llave.
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    const sueltas = desktop
      .split('{')
      .map((tramo) => tramo.split('}').pop().split(';').pop().trim())
      .filter((selector) => selector.split(',').some((parte) => {
        const limpio = parte.trim();
        if (!limpio.startsWith('.ag-root')) return false;
        // `.ag-root--con-sidebar` si; `.ag-root` pelado o con descendientes no.
        const resto = limpio.slice('.ag-root'.length);
        return !resto.startsWith('--');
      }));
    expect(sueltas, `reglas sobre .ag-root sin acotar: ${sueltas.join(' | ')}`).toEqual([]);
  });

  it('la columna del icono mide lo mismo que el riel: por eso no se mueve', () => {
    // Es la propiedad estructural que hace que expandir no desplace iconos.
    // Si alguien cambia una de las dos medidas sin la otra, se rompe.
    const item = sidebarCss.match(/\.ag-sidebar-item \{([^}]*)\}/)[1];
    expect(item).toContain('grid-template-columns: var(--ag-sidebar-riel) 1fr');
    const marca = sidebarCss.match(/\.ag-sidebar-marca \{([^}]*)\}/)[1];
    expect(marca).toContain('grid-template-columns: var(--ag-sidebar-riel) 1fr');
  });

  it('el workspace se corre el RIEL, nunca el ancho expandido', () => {
    // Si el padding usara el ancho abierto, la pantalla de trabajo perderia
    // 224px para siempre; si la sidebar empujara al expandirse, saltaria.
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    // El padding sale del RIEL, no del ancho abierto, y va sobre la clase que
    // marca a los roots que si montan sidebar.
    const padding = desktop.match(/\.ag-root--con-sidebar\s*\{([^}]*)\}/);
    expect(padding, 'no hay regla de padding para el root con sidebar').not.toBeNull();
    expect(padding[1]).toContain('padding-left: var(--ag-sidebar-riel)');
    expect(padding[1]).not.toContain('--ag-sidebar-abierta');
    expect(desktop).toContain('position: fixed');
  });

  it('se expande por hover Y por foco de teclado', () => {
    expect(sidebarCss).toContain('.ag-sidebar:hover,');
    expect(sidebarCss).toContain('.ag-sidebar:focus-within');
  });

  it('reduced motion apaga la transicion, no el estado', () => {
    const bloque = sidebarCss.slice(sidebarCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloque).toContain('transition: none');
    // El ancho expandido sigue existiendo: se llega igual, sin animacion.
    expect(bloque).not.toContain('width:');
  });
});
