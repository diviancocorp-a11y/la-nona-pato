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

  /* ── El bloque de marca: DIC + Dico = DICO ─────────────────────────────
   * SUPERSEDED: hasta el 6/9/2026 esto exigia un `DICO` de TEXTO a la derecha
   * del personaje. Con el logo aprobado eso daria «ODIC» —la palabra ya
   * termina en O y el personaje ES la O—, asi que el bloque se dio vuelta.
   */
  it('el logo DIC esta, y el placeholder de texto no', () => {
    const { container } = montar({
      presencia: React.createElement('span', { 'data-presencia': '' }),
    });
    const marca = container.querySelector('.ag-sidebar-marca');
    expect(marca.querySelector('.ag-sidebar-wordmark'), 'quedo el placeholder DICO').toBeNull();
    // Sin la palabra escrita: la marca la dicen el logo y el personaje.
    expect(marca.textContent, 'quedo el texto DICO en el bloque de marca').not.toMatch(/DICO?/i);

    const dic = [...marca.querySelectorAll('.ag-sidebar-dic')];
    expect(dic).toHaveLength(2);
    expect(dic.map(i => i.getAttribute('src'))).toEqual([
      '/brand/dico/logo/dic-claro.png',
      '/brand/dico/logo/dic-oscuro.png',
    ]);
  });

  it('DIC va antes que Dico: leido de izquierda a derecha dice DIC + O', () => {
    const { container } = montar({
      presencia: React.createElement('span', { 'data-presencia': '' }),
    });
    const hijos = [...container.querySelector('.ag-sidebar-marca').children];
    expect(hijos[0]).toHaveClass('ag-sidebar-dic');
    expect(hijos[hijos.length - 1]).toHaveClass('ag-sidebar-presencia');
    expect(hijos[hijos.length - 1].querySelector('[data-presencia]')).toBeInTheDocument();
  });

  it('el logo es MUDO: quien tiene nombre es el control de Dico', () => {
    const { container } = montar({
      presencia: React.createElement('button', { 'aria-label': 'Ver lo que dice Dico' }),
    });
    for (const img of container.querySelectorAll('.ag-sidebar-dic')) {
      expect(img.getAttribute('alt'), 'el logo no puede tener texto alternativo').toBe('');
      expect(img.getAttribute('aria-hidden')).toBe('true');
      // Dimensiones declaradas: sin ellas la fila salta cuando carga el PNG.
      expect(img.getAttribute('width')).toBe('240');
      expect(img.getAttribute('height')).toBe('104');
    }
    expect(screen.getByRole('button', { name: 'Ver lo que dice Dico' })).toBeInTheDocument();
  });

  it('UN SOLO Dico: el logo no monta un segundo personaje', () => {
    const { container } = montar({
      presencia: React.createElement('span', { 'data-presencia': '' }),
    });
    expect(container.querySelectorAll('[data-presencia]')).toHaveLength(1);
    const fuentes = [...container.querySelectorAll('img')].map(i => i.getAttribute('src'));
    expect(fuentes.filter(src => src && src.includes('dico-2d'))).toHaveLength(0);
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

    // El bloque de marca es la EXCEPCION declarada, y esta es su razon: el
    // logo entra por una columna nueva a la IZQUIERDA, asi que ahi el
    // personaje SI se corre —es lo que hace que DIC + O lean DICO—. Lo que
    // sigue valiendo es que la columna del personaje mida el riel, que es lo
    // que lo deja centrado cuando esta cerrado.
    const marca = sidebarCss.match(/\.ag-sidebar-marca \{([^}]*)\}/)[1];
    expect(marca).toContain('grid-template-columns: var(--ag-dic-col) var(--ag-sidebar-riel)');
    // El cero por defecto va en la SIDEBAR: declarado en el bloque de marca
    // le gana a lo que hereda y las reglas de hover/foco no pueden abrirlo.
    const base = sidebarCss.match(/\.ag-sidebar \{([^}]*)\}/g).join('');
    expect(base, 'la columna del logo no arranca en cero').toContain('--ag-dic-col: 0px');
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

  it('se expande por hover Y por foco de TECLADO, no por click', () => {
    expect(sidebarCss).toContain('.ag-sidebar:hover');
    // `:focus-visible` y no el foco a secas: con el foco a secas, clickear un
    // item con el mouse lo dejaba adentro y la sidebar se quedaba abierta
    // aunque el mouse ya estuviera en el workspace.
    expect(sidebarCss).toContain('.ag-sidebar:has(:focus-visible)');
    const reglas = sidebarCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(reglas, 'una regla expande con el foco a secas: se abre al clickear')
      .not.toContain(':focus-within');
  });

  it('el DIC tiene una pieza por tema: negra en claro, blanca en oscuro', () => {
    // No es el mismo PNG recoloreado con un filtro: son dos originales
    // aprobados, cada uno con su filete azul. El tema elige cual se dibuja.
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    expect(desktop).toContain('.ag-sidebar-dic--oscuro { display: none; }');
    expect(desktop).toContain('.ag-theme-dark .ag-sidebar-dic--claro { display: none; }');
    expect(desktop).toContain('.ag-theme-dark .ag-sidebar-dic--oscuro { display: block; }');
  });

  it('el logo solo existe con el riel abierto, y no deforma el dibujo', () => {
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    const cuerpoDe = (selector) => {
      const abre = desktop.indexOf(selector + ' {');
      return abre < 0 ? null : desktop.slice(abre, desktop.indexOf('}', abre));
    };
    const marca = cuerpoDe('.ag-sidebar-marca');
    expect(marca).toContain('grid-template-columns: var(--ag-dic-col) var(--ag-sidebar-riel)');
    // Colapsado la columna del logo mide 0: Dico queda centrado en el riel.
    expect(cuerpoDe('.ag-sidebar')).toContain('--ag-dic-col: 0px');
    // Y el alto del bloque sale del tamanio del personaje, no de un literal.
    expect(marca).toContain('height: calc(var(--ag-dico-riel) + 12px)');

    const logo = cuerpoDe('.ag-sidebar-dic');
    expect(logo, 'el logo no declara alto propio').toContain('height: var(--ag-dic-alto)');
    expect(logo, 'el logo se puede deformar').toContain('object-fit: contain');
    expect(logo, 'el logo arranca visible y se ve recortado por el riel')
      .toContain('opacity: 0');
    // Se abre por hover Y por teclado, igual que los rotulos.
    expect(desktop).toContain('.ag-sidebar:has(:focus-visible) .ag-sidebar-dic { opacity: 1; }');
    expect(desktop).toContain('.ag-sidebar:hover .ag-sidebar-dic { opacity: 1; }');
  });

  it('reduced motion apaga tambien el movimiento del bloque de marca', () => {
    const bloque = sidebarCss.slice(sidebarCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloque).toContain('.ag-sidebar-marca');
    expect(bloque).toContain('.ag-sidebar-dic');
    expect(bloque).toContain('transition: none');
  });

  it('mientras Dico habla, el riel se queda QUIETO y colapsado', () => {
    // SUPERSEDED — hasta el 6/9/2026 esto exigia lo contrario: que ninguna
    // regla condicionada al estado de Dico tocara el ancho de la sidebar ni
    // la opacidad de sus rotulos ("Dico nunca le saca capacidades a la
    // navegacion"). La regla nacio contra una version donde la sidebar se
    // apagaba mientras Physical estaba afuera.
    //
    // Lo que la tiro abajo se ve usando el panel: tocar a Dico deja el
    // puntero sobre la sidebar, asi que se expande; ir hacia el mensaje saca
    // el puntero y la colapsa, y con ella se corre el mensaje, que cuelga de
    // su ancho. Volver a rozarla lo empuja de nuevo. El texto se mueve
    // mientras lo estas leyendo.
    //
    // La decision de Ricardo es que con el mensaje abierto el riel quede
    // quieto hasta que el usuario toque la accion o lo cierre. Lo que se
    // sigue exigiendo es lo que aquella regla protegia de verdad: que la
    // navegacion NO desaparezca. El riel se queda en su ancho —nunca en 0 ni
    // oculto— y sus items siguen recibiendo el click.
    const bloques = sidebarCss.split('}');
    const porDico = bloques.filter(b => (b.split('{')[0] || '').includes('.dico-avisos--abierto'));
    expect(porDico.length, 'no existe la regla que congela el riel').toBeGreaterThan(0);

    for (const bloque of porDico) {
      const selector = bloque.split('{')[0] || '';
      const cuerpo = bloque.split('{')[1] || '';
      // Nunca se apaga ni se esconde el riel entero.
      expect(cuerpo, `${selector} esconde la sidebar`).not.toMatch(/display:\s*none/);
      expect(cuerpo, `${selector} deja la sidebar sin ancho`).not.toMatch(/width:\s*0/);
      // Si toca el ancho, es para dejarlo en el RIEL, que es el estado
      // navegable de siempre.
      if (/--ag-sidebar-ancho\s*:/.test(cuerpo)) {
        expect(cuerpo, `${selector} congela la sidebar en un ancho que no es el riel`)
          .toContain('--ag-sidebar-ancho: var(--ag-sidebar-riel)');
      }
      // Y lo que se apaga son rotulos, nunca los items que se clickean.
      if (/pointer-events\s*:\s*none/.test(cuerpo)) {
        expect(selector, `${selector} apaga el click de la navegacion`)
          .not.toMatch(/\.ag-sidebar-item(\s|,|$)/);
      }
    }
  });

  it('la posicion de Dico deriva del ancho REAL de la sidebar', () => {
    // Un solo numero: `--ag-sidebar-ancho`. Si el aviso y Physical repitieran
    // 64 y 224 por su cuenta, cambiar el riel los dejaria desalineados y la
    // unica forma de notarlo seria mirando.
    const desktop = sidebarCss.slice(sidebarCss.indexOf('@media (min-width: 769px)'));
    // Sin regex: se busca el selector y se lee el cuerpo hasta la llave.
    const cuerpoDe = (selector) => {
      const abre = desktop.indexOf(selector + ' {');
      if (abre < 0) return null;
      return desktop.slice(abre, desktop.indexOf('}', abre));
    };
    for (const parte of ['.ag-sidebar .dico-avisos-mensaje', '.ag-sidebar .dico-slot']) {
      const cuerpo = cuerpoDe(parte);
      expect(cuerpo, 'no hay regla de posicion para ' + parte).not.toBeNull();
      expect(cuerpo, parte + ' no deriva del ancho de la sidebar').toContain('var(--ag-sidebar-ancho)');
      // Solo se mueve en X: transicionar el eje vertical seria un salto.
      expect(cuerpo, parte + ' transiciona el eje vertical').not.toContain('top .');
      expect(cuerpo, parte + ' no acompania la expansion').toContain('transition: left');
    }
    // El ancho sale de las dos medidas declaradas, no de literales sueltos.
    expect(sidebarCss).toContain('--ag-sidebar-ancho: var(--ag-sidebar-riel)');
    expect(sidebarCss).toContain('--ag-sidebar-ancho: var(--ag-sidebar-abierta)');
  });

  it('el hover va detras de un puntero fino; el foco de teclado no', () => {
    // En touch el `:hover` queda pegado despues del tap y la sidebar se
    // quedaria abierta sola. Pero `focus-within` tiene que funcionar en
    // cualquier dispositivo: si viviera adentro de la misma media query,
    // quien navega con teclado en una tablet no veria un solo rotulo.
    const conPuntero = sidebarCss.split('@media (hover: hover) and (pointer: fine)').slice(1).join('');
    expect(conPuntero, 'el hover no esta acotado a puntero fino').toContain('.ag-sidebar:hover');

    const sinMediaQuery = sidebarCss.split('@media (hover: hover)')[0];
    expect(sinMediaQuery, 'el foco de teclado quedo adentro de la media query de hover')
      .toContain('.ag-sidebar:has(:focus-visible)');
  });

  it('reduced motion apaga la transicion, no el estado', () => {
    const bloque = sidebarCss.slice(sidebarCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloque).toContain('transition: none');
    // El ancho expandido sigue existiendo: se llega igual, sin animacion.
    expect(bloque).not.toContain('width:');
  });
});
