// src/test/adminCorrectness.test.jsx
//
// Phase 3A: los cuatro defectos bloqueantes, con su contrato.
//
// Cada bloque reproduce primero el estado medido el 30/ago y despues verifica
// el arreglo. Los numeros del "antes" no son inventados: salen de
// .qa-lite/artifacts/phase3a-correctness/baseline/superficies.json.

import { useRef, useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dialog from '../components/ui/Dialog';
import OverlayPortal, { OVERLAY_ROOT_ID, OVERLAY_ROOT_CLASS, obtenerOverlayRoot, sincronizarTema } from '../components/ui/OverlayPortal';
import useFocusTrap, { focusablesDe } from '../hooks/useFocusTrap';
import NavInferior, { PRIMARIAS } from '../components/admin/platform/NavInferior';

// El repo no tiene @testing-library/user-event y este lote no agrega
// dependencias. Estos helpers cubren lo que hace falta:
//
//  - `tab()` dispara el keydown que el trap intercepta. Cuando el trap NO
//    interviene —el paso "natural" entre controles del medio— jsdom no mueve
//    el foco solo, asi que el helper lo adelanta como haria el navegador. Lo
//    que se valida entonces es el WRAP, que es lo que el trap decide.
//  - el recorrido completo con teclado real se verifica en el navegador
//    (ver .qa-lite/artifacts/phase3a-correctness), que es donde tiene sentido.
// `fireEvent.click` no mueve el foco; un click real en un boton SI lo hace, y
// de eso depende a donde vuelve el foco al cerrar un dialogo. El helper enfoca
// primero para que el test refleje el navegador y no una version empobrecida.
const click = (el) => { el.focus?.(); fireEvent.click(el); };
function tab({ shift = false } = {}) {
  const antes = document.activeElement;
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: shift });
  if (document.activeElement !== antes) return;           // el trap lo movio
  const cont = antes?.closest('[role="dialog"], [data-testid="caja"]');
  const lista = cont ? focusablesDe(cont) : [];
  const i = lista.indexOf(antes);
  if (i >= 0) lista[shift ? i - 1 : i + 1]?.focus();
}

/* ─────────────── contraste ─────────────── */

/** WCAG 2.x relative luminance + ratio. Puro, sin DOM. */
function luminancia([r, g, b]) {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [r, g, b].map((v) => lin(v / 255));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
export function contraste(a, b) {
  const la = luminancia(a); const lb = luminancia(b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe('contraste — el calculo', () => {
  it('reproduce pares conocidos', () => {
    expect(contraste([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contraste([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(contraste(hex('#767676'), hex('#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
  });

  it('reproduce el defecto medido: 1.24:1 en el POS oscuro', () => {
    // --ag-ink oscuro sobre el fallback congelado de --ag-surface.
    const r = contraste(hex('#E5E5E5'), hex('#FFFDF7'));
    expect(r).toBe(1.24);
    expect(r).toBeLessThan(4.5);
  });
});

describe('contraste — los valores contractuales de los tokens', () => {
  // Los mismos literales que declara src/styles/admin-tokens.css.
  // Phase 3B: la escala pasa a Zinc/Carbon. Los minimos no cambian.
  const CLARO = { bg: '#FAFAFA', surface: '#FFFFFF', ink: '#09090B', ink2: '#52525B', ink3: '#71717A', ok: '#1B7A3D', bad: '#B3261E', warn: '#8A4B00', accent: '#E8B947', accentBorder: '#8A6100' };
  const OSCURO = { bg: '#09090B', surface: '#18181B', ink: '#F4F4F5', ink2: '#D4D4D8', ink3: '#A1A1AA', ok: '#4ADE80', bad: '#F87171', warn: '#FBBF24', accent: '#E8B947', accentBorder: '#E8B947' };

  it('texto normal sobre la superficie llega a 4.5:1 en los dos temas', () => {
    expect(contraste(hex(CLARO.ink), hex(CLARO.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex(OSCURO.ink), hex(OSCURO.surface))).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto secundario llega a 4.5:1', () => {
    expect(contraste(hex(CLARO.ink2), hex(CLARO.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex(OSCURO.ink2), hex(OSCURO.surface))).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto terciario en oscuro llega a 4.5:1 sobre la superficie', () => {
    // Medido en el POS: con #737373 daba 3.19:1 incluso con el fondo ya
    // corregido. Phase 3B lo lleva a Zinc 400.
    expect(contraste(hex(OSCURO.ink3), hex(OSCURO.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex(OSCURO.ink3), hex(OSCURO.bg))).toBeGreaterThanOrEqual(4.5);
    // El escalon con el secundario se conserva.
    expect(contraste(hex(OSCURO.ink2), hex(OSCURO.surface)))
      .toBeGreaterThan(contraste(hex(OSCURO.ink3), hex(OSCURO.surface)));
  });

  it('los solidos de estado llegan a 3:1 como borde/icono sobre la superficie', () => {
    for (const t of [CLARO, OSCURO]) {
      for (const k of ['ok', 'bad', 'warn', 'accentBorder']) {
        expect(contraste(hex(t[k]), hex(t.surface)),
          `${k} sobre surface`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('el acento conserva su funcion de accion: texto oscuro encima, no amarillo sobre blanco', () => {
    // Gold/Yellow se usa como FONDO de accion con tinta oscura.
    expect(contraste(hex('#1A1A1A'), hex(CLARO.accent))).toBeGreaterThanOrEqual(4.5);
    // Y no al reves: amarillo como texto sobre blanco no llega, por eso no se usa asi.
    expect(contraste(hex(CLARO.accent), hex('#FFFFFF'))).toBeLessThan(4.5);
  });

  it('el texto terciario en CLARO llega a 4.5:1 — la deuda que cerro Phase 3B', () => {
    // Con #9CA3AF daba 2.5:1 sobre la superficie clara. Phase 3A lo dejo
    // anotado a proposito para no parchearlo sobre el lenguaje viejo.
    expect(contraste(hex(CLARO.ink3), hex(CLARO.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex(CLARO.ink3), hex(CLARO.bg))).toBeGreaterThanOrEqual(4.5);
    // Y la jerarquia sobrevive: los tres escalones siguen separados.
    const r = [CLARO.ink, CLARO.ink2, CLARO.ink3].map((c) => contraste(hex(c), hex(CLARO.surface)));
    expect(r[0]).toBeGreaterThan(r[1]);
    expect(r[1]).toBeGreaterThan(r[2]);
  });

  it('los bordes activos llegan a 3:1 — la otra deuda de Phase 3A', () => {
    // EditorDeMesa y MapaDeMesas usaban --ag-accent (1.8:1 en claro) como
    // borde de estado. Ahora usan --ag-accent-border.
    expect(contraste(hex(CLARO.accentBorder), hex(CLARO.surface))).toBeGreaterThanOrEqual(3);
    expect(contraste(hex(OSCURO.accentBorder), hex(OSCURO.surface))).toBeGreaterThanOrEqual(3);
  });

  it('claro y oscuro no se confunden: la superficie cambia entre temas', () => {
    expect(CLARO.surface).not.toBe(OSCURO.surface);
    // Y el par cruzado —tinta oscura sobre superficie clara— es justo el que fallaba.
    expect(contraste(hex(OSCURO.ink), hex(CLARO.surface))).toBeLessThan(4.5);
  });
});

/* ─────────────── overlay / dialogo ─────────────── */

function DialogoDePrueba({ conControles = true, onClose = () => {}, ...resto }) {
  return (
    <Dialog open onClose={onClose} label="Cobro" {...resto}>
      {conControles ? (
        <>
          <button type="button">uno</button>
          <button type="button">dos</button>
          <button type="button">tres</button>
        </>
      ) : (
        <p>sin controles</p>
      )}
    </Dialog>
  );
}

function ConDisparador({ ...resto }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>abrir</button>
      {abierto && <DialogoDePrueba onClose={() => setAbierto(false)} {...resto} />}
    </>
  );
}

describe('primitiva de overlay', () => {
  afterEach(() => {
    document.getElementById(OVERLAY_ROOT_ID)?.remove();
    document.body.style.overflow = '';
  });

  it('monta el dialogo FUERA del shell, como hijo de body', () => {
    const { container } = render(
      <div className="ag-root" style={{ position: 'relative', zIndex: 2 }}>
        <main style={{ position: 'relative', zIndex: 2 }}>
          <DialogoDePrueba />
        </main>
      </div>,
    );
    const dialogo = screen.getByRole('dialog');
    // Ni el contenedor del test ni el <main> lo contienen: salio del stacking
    // context que atrapaba al overlay viejo.
    expect(container.contains(dialogo)).toBe(false);
    expect(container.querySelector('main')?.contains(dialogo)).toBeFalsy();
    const root = document.getElementById(OVERLAY_ROOT_ID);
    expect(root?.parentElement).toBe(document.body);
    expect(root.contains(dialogo)).toBe(true);
  });

  it('usa tokens de capa y no numeros locales arbitrarios', () => {
    render(<DialogoDePrueba />);
    const backdrop = document.querySelector('.ag-dialog-backdrop');
    const panel = screen.getByRole('dialog');
    expect(backdrop).toBeTruthy();
    expect(panel.classList.contains('ag-dialog-panel')).toBe(true);
    // El valor concreto lo pone el CSS con var(--ag-z-*); lo que se prueba aca
    // es que el componente no clave un z-index inline.
    expect(panel.getAttribute('style') || '').not.toMatch(/z-index/i);
    expect(backdrop.getAttribute('style') || '').not.toMatch(/z-index/i);
  });

  it('el root de overlays no crea stacking context propio', () => {
    render(<DialogoDePrueba />);
    const root = document.getElementById(OVERLAY_ROOT_ID);
    expect(root.getAttribute('style')).toBeNull();
  });

  it('engancha los tokens por CLASE y no por id (especificidad)', () => {
    // Con `#dico-overlay-root` en el CSS, ese selector (1,0,0) le gana a
    // `.ag-theme-dark` (0,1,0) y el overlay queda siempre en claro. Se midio
    // en el navegador antes de arreglarlo.
    render(<DialogoDePrueba />);
    const root = document.getElementById(OVERLAY_ROOT_ID);
    expect(root.classList.contains(OVERLAY_ROOT_CLASS)).toBe(true);
  });

  it('copia el tema del panel al root del portal', () => {
    document.body.innerHTML = '<div class="ag-root ag-theme-dark"></div>';
    const root = obtenerOverlayRoot();
    expect(sincronizarTema(root)).toBe('dark');
    expect(root.classList.contains(OVERLAY_ROOT_CLASS)).toBe(true);
    expect(root.classList.contains('ag-theme-dark')).toBe(true);
    document.querySelector('.ag-root').className = 'ag-root ag-theme-light';
    expect(sincronizarTema(root)).toBe('light');
    expect(root.classList.contains('ag-theme-dark')).toBe(false);
    document.body.innerHTML = '';
  });

  it('reutiliza un unico root entre aperturas', () => {
    const a = render(<DialogoDePrueba />);
    const primero = document.getElementById(OVERLAY_ROOT_ID);
    a.unmount();
    render(<DialogoDePrueba />);
    expect(document.getElementById(OVERLAY_ROOT_ID)).toBe(primero);
    expect(document.querySelectorAll(`#${OVERLAY_ROOT_ID}`).length).toBe(1);
  });
});

describe('contrato del dialogo', () => {
  afterEach(() => {
    document.getElementById(OVERLAY_ROOT_ID)?.remove();
    document.body.style.overflow = '';
  });

  it('declara role, aria-modal y nombre accesible', () => {
    render(<DialogoDePrueba />);
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Cobro');
  });

  it('acepta aria-labelledby y aria-describedby', () => {
    render(
      <Dialog open onClose={() => {}} labelledBy="t" describedBy="d">
        <h2 id="t">Cobrar</h2>
        <p id="d">detalle</p>
      </Dialog>,
    );
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('aria-labelledby')).toBe('t');
    expect(d.getAttribute('aria-describedby')).toBe('d');
    expect(d.getAttribute('aria-label')).toBeNull();
  });

  it('el foco entra al primer control util', () => {
    render(<DialogoDePrueba />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'uno' }));
  });

  it('sin controles enfocables el foco cae en el contenedor', () => {
    render(<DialogoDePrueba conControles={false} />);
    const d = screen.getByRole('dialog');
    expect(d.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(d);
  });

  it('Tab queda contenido y da la vuelta', () => {
    render(<DialogoDePrueba />);
    const [uno, dos, tres] = ['uno', 'dos', 'tres'].map((n) => screen.getByRole('button', { name: n }));
    expect(document.activeElement).toBe(uno);
    tab();
    expect(document.activeElement).toBe(dos);
    tab();
    expect(document.activeElement).toBe(tres);
    tab();
    expect(document.activeElement).toBe(uno);
  });

  it('Shift+Tab queda contenido y da la vuelta al reves', () => {
    render(<DialogoDePrueba />);
    const [uno, , tres] = ['uno', 'dos', 'tres'].map((n) => screen.getByRole('button', { name: n }));
    expect(document.activeElement).toBe(uno);
    tab({ shift: true });
    expect(document.activeElement).toBe(tres);
  });

  it('Escape cierra', () => {
    const onClose = vi.fn();
    render(<DialogoDePrueba onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('al cerrar devuelve el foco a quien lo abrio', () => {
    render(<ConDisparador />);
    const abrir = screen.getByRole('button', { name: 'abrir' });
    abrir.focus();
    click(abrir);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'uno' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('bloquea el scroll del body y lo restaura', () => {
    document.body.style.overflow = 'auto';
    const r = render(<DialogoDePrueba />);
    expect(document.body.style.overflow).toBe('hidden');
    r.unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('abrir y cerrar varias veces no acumula efectos', () => {
    render(<ConDisparador />);
    const abrir = screen.getByRole('button', { name: 'abrir' });
    for (let i = 0; i < 3; i += 1) {
      click(abrir);
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
    expect(document.querySelectorAll(`#${OVERLAY_ROOT_ID}`).length).toBe(1);
  });

  it('limpia el listener al desmontar: Escape despues no llama a nadie', () => {
    const onClose = vi.fn();
    const r = render(<DialogoDePrueba onClose={onClose} />);
    r.unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focusablesDe ignora deshabilitados, aria-hidden y tabindex negativo', () => {
    const div = document.createElement('div');
    div.innerHTML = '<button>a</button><button disabled>b</button>'
      + '<button aria-hidden="true">c</button><button tabindex="-1">d</button>';
    document.body.appendChild(div);
    expect(focusablesDe(div).map((b) => b.textContent)).toEqual(['a']);
    div.remove();
  });
});

/* ─────────────── navegacion ─────────────── */

const Icono = () => <svg className="ag-nav-icon" aria-hidden="true" />;
const SECCIONES = [
  { id: 'products', label: 'Productos', Icon: Icono },
  { id: 'orders', label: 'Pedidos', Icon: Icono },
  { id: 'stock', label: 'Stock', Icon: Icono },
  { id: 'finanzas', label: 'Gastos', Icon: Icono },
  { id: 'ventas', label: 'Ventas', Icon: Icono },
  { id: 'caja', label: 'Caja', Icon: Icono },
  { id: 'mesas', label: 'Salón', Icon: Icono },
  { id: 'personal', label: 'Equipo', Icon: Icono },
];
/** Las tres que el baseline midio fuera del viewport a 390 y a 360. */
const ANTES_INALCANZABLES = ['caja', 'mesas', 'personal'];

function Nav({ tab = 'products', onTab = () => {}, tabs = SECCIONES, openCount = 0 }) {
  return <NavInferior tabs={tabs} tab={tab} onTab={onTab} openCount={openCount} />;
}

describe('navegacion inferior', () => {
  afterEach(() => { document.getElementById(OVERLAY_ROOT_ID)?.remove(); document.body.style.overflow = ''; });

  it('las ocho secciones son alcanzables: primarias + Más', () => {
    render(<Nav />);
    const barra = screen.getByRole('navigation');
    const visibles = within(barra).getAllByRole('button')
      .filter((b) => b.dataset.section)
      .map((b) => b.dataset.section);
    expect(visibles).toHaveLength(PRIMARIAS);

    click(screen.getByRole('button', { name: /Más secciones/ }));
    const hoja = screen.getByRole('dialog');
    const enHoja = within(hoja).getAllByRole('button').map((b) => b.dataset.section);
    expect([...visibles, ...enHoja].sort()).toEqual(SECCIONES.map((s) => s.id).sort());
  });

  it('las tres que estaban fuera del viewport ahora viven en Más', () => {
    render(<Nav />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    const hoja = screen.getByRole('dialog');
    for (const id of ANTES_INALCANZABLES) {
      expect(within(hoja).getByText(SECCIONES.find((s) => s.id === id).label)).toBeTruthy();
    }
  });

  it('ninguna seccion aparece dos veces', () => {
    render(<Nav />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    const todos = [...document.querySelectorAll('[data-section]')].map((b) => b.dataset.section);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it('respeta los permisos: lo que no esta en tabs no aparece en el desborde', () => {
    const soloMozo = SECCIONES.filter((s) => ['products', 'orders', 'mesas'].includes(s.id));
    render(<Nav tabs={soloMozo} />);
    // Con 3 secciones no hace falta desborde.
    expect(screen.queryByRole('button', { name: /Más secciones/ })).toBeNull();
    const todos = [...document.querySelectorAll('[data-section]')].map((b) => b.dataset.section);
    expect(todos.sort()).toEqual(['mesas', 'orders', 'products']);
    expect(todos).not.toContain('finanzas');
    click(screen.getByRole('button', { name: 'Productos' }));
  });

  it('comunica el estado activo con clase y aria-current', () => {
    render(<Nav tab="orders" />);
    const activo = document.querySelector('[data-section="orders"]');
    expect(activo.classList.contains('active')).toBe(true);
    expect(activo.getAttribute('aria-current')).toBe('page');
  });

  it('cuando la seccion activa vive en el desborde, el boton Más la muestra', () => {
    render(<Nav tab="caja" />);
    const mas = screen.getByRole('button', { name: /Estás en Caja/ });
    expect(mas.classList.contains('active')).toBe(true);
    expect(mas.getAttribute('aria-current')).toBe('page');
    expect(within(mas).getByText('Caja')).toBeTruthy();
  });

  it('Enter y Space activan una seccion del desborde', () => {
    const onTab = vi.fn();
    render(<Nav onTab={onTab} />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    const caja = document.querySelector('.ag-nav-mas-item[data-section="caja"]');
    caja.focus();
    fireEvent.keyDown(document.activeElement, { key: 'Enter' });
    fireEvent.click(document.activeElement);
    expect(onTab).toHaveBeenCalledWith('caja');

    click(screen.getByRole('button', { name: /Más secciones/ }));
    const mesas = document.querySelector('.ag-nav-mas-item[data-section="mesas"]');
    mesas.focus();
    fireEvent.keyDown(document.activeElement, { key: ' ' });
    fireEvent.click(document.activeElement);
    expect(onTab).toHaveBeenCalledWith('mesas');
  });

  it('elegir una seccion cierra el desborde', () => {
    render(<Nav onTab={() => {}} />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    click(document.querySelector('.ag-nav-mas-item[data-section="caja"]'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape cierra el desborde y devuelve el foco a Más', () => {
    render(<Nav />);
    const mas = screen.getByRole('button', { name: /Más secciones/ });
    click(mas);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(mas);
  });

  it('el foco entra al desborde al abrirlo', () => {
    render(<Nav />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('el boton Más declara su estado', () => {
    render(<Nav />);
    const mas = screen.getByRole('button', { name: /Más secciones/ });
    expect(mas.getAttribute('aria-haspopup')).toBe('dialog');
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    click(mas);
    expect(screen.getByRole('button', { name: /Más secciones/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('todos los controles tienen nombre accesible', () => {
    render(<Nav openCount={3} />);
    click(screen.getByRole('button', { name: /Más secciones/ }));
    for (const b of document.querySelectorAll('[data-section], [data-nav-overflow]')) {
      const nombre = b.getAttribute('aria-label') || b.textContent.trim();
      expect(nombre.length, b.outerHTML.slice(0, 60)).toBeGreaterThan(0);
    }
    expect(screen.getByRole('button', { name: /Pedidos \(3 en curso\)/ })).toBeTruthy();
  });
});

/* ─────────────── focus trap suelto ─────────────── */

function CajaConTrap({ activo, onEscape }) {
  const ref = useRef(null);
  useFocusTrap({ activo, contenedorRef: ref, onEscape, bloquearScroll: false });
  return (
    <div ref={ref} tabIndex={-1} data-testid="caja">
      <button type="button">a</button>
      <button type="button">b</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('inactivo no toca el foco', () => {
    render(<CajaConTrap activo={false} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('activo mueve el foco al primer control', () => {
    render(<CajaConTrap activo />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a' }));
  });

  it('Escape llama al handler una sola vez por pulsacion', () => {
    const onEscape = vi.fn();
    render(<CajaConTrap activo onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
