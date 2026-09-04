import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DicoPresence from '../components/dico/DicoPresence';
import {
  DICO_PRESENCE_STATES,
  visibilidadDico,
} from '../components/dico/dicoPresenceMachine';

const prod = (over = {}) => ({
  id: 'p1', name: 'Milanesa', price: 5000, active: true, ...over,
});

const datos = {
  vertical: 'gastro',
  productos: [prod({ price: 0 })],
  insumos: [],
  recetas: new Map(),
  gastos: [],
  settings: { waste_pct: 0, expense_pct: 0 },
  hoy: new Date('2026-08-16T12:00:00Z'),
  listo: true,
};

const estadoDe = container => container.querySelector('[data-dico-presence-state]')
  ?.getAttribute('data-dico-presence-state');
const nativeDe = container => container.querySelector('[data-dico-native]');
const physicalDe = container => container.querySelector('.dico-physical');

function esperarMovimiento(physical) {
  fireEvent(physical, new Event('webkitAnimationEnd', { bubbles: true }));
}

function abrirPhysical() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Dico Physical' }));
}

function abrirHastaPhysical(container) {
  abrirPhysical();
  esperarMovimiento(physicalDe(container));
}

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

/** Mismo panel pero sin nada que avisar: ahi Dico 2D es el invocador. */
const sinAvisos = { ...datos, productos: [prod()], recetas: new Map([['p1', [{ ingredient_id: 'i1', qty: 1 }]]]),
  insumos: [{ id: 'i1', name: 'Harina', cost: 100, stock: 10, min_stock: 0, food_category: 'dry' }],
  gastos: [{ date: '2026-08-05' }] };

describe('DicoPresence', () => {
  /**
   * SUPERSEDED POR PHASE 4 · PASS 2 — cambio contractual explicito.
   *
   * Los dos casos originales invocaban a Physical desde el personaje ("Traer
   * a Dico"). Dico 2D dejo de ser el llamador manual: ahora es presencia e
   * indicador, y al tocarlo abre su mensaje. El unico disparador que queda es
   * la INTERVENCION, que la manda el productor.
   *
   * Lo que esos contratos protegian de verdad sigue medido aca, con el
   * disparador nuevo: que Native y Physical NUNCA coexistan, que el globo no
   * sobreviva a la entrada de Physical, y que el sistema vuelva a
   * `native_idle` con Native de nuevo en pantalla.
   */
  const intervencion = {
    id: 'nada-visible',
    mensaje: 'Apagaste el ultimo visible.',
    anclaje: 'presence',
  };

  it('la intervencion trae a Physical y devolverla deja el sistema donde empezo', () => {
    const { container, rerender } = render(React.createElement(DicoPresence, sinAvisos));
    expect(nativeDe(container)).toBeInTheDocument();

    rerender(React.createElement(DicoPresence, { ...sinAvisos, intervencion }));
    expect(estadoDe(container)).toBe('physical_opening');
    expect(nativeDe(container)).not.toBeInTheDocument();   // Dico 2D se va

    esperarMovimiento(physicalDe(container));
    expect(estadoDe(container)).toBe('physical_open');

    // Guardarlo AVISA al productor, que es el dueño de la carga; mientras la
    // intervencion siga puesta, la reconciliacion vuelve a abrir Physical —y
    // esta bien que lo haga—. Aca se simula al productor retirandola, que es
    // lo que hace `onIntervencionCerrada` en el panel real.
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    rerender(React.createElement(DicoPresence, { ...sinAvisos, intervencion: null }));
    esperarMovimiento(physicalDe(container));
    expect(estadoDe(container)).toBe('native_idle');
    expect(nativeDe(container)).toBeInTheDocument();        // y vuelve
    expect(physicalDe(container)).not.toBeInTheDocument();
  });

  it('B1 completo: Physical entra y el aviso abierto no sobrevive', () => {
    // La secuencia que no puede romperse: nunca hay coexistencia. Antes de
    // este contrato, la entrada de Physical con el aviso abierto dejaba un
    // globo flotando de un personaje que ya no estaba.
    const { container, rerender } = render(React.createElement(DicoPresence, datos));
    fireEvent.click(screen.getByRole('button', { name: /abrir .*aviso.* de dico/i }));
    expect(estadoDe(container)).toBe('native_notice');
    expect(container.querySelector('.dico-burbuja')).toBeInTheDocument();

    rerender(React.createElement(DicoPresence, { ...datos, intervencion }));
    expect(estadoDe(container)).toBe('physical_opening');
    expect(nativeDe(container)).not.toBeInTheDocument();
    expect(physicalDe(container)).toBeInTheDocument();

    esperarMovimiento(physicalDe(container));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    rerender(React.createElement(DicoPresence, { ...datos, intervencion: null }));
    esperarMovimiento(physicalDe(container));
    expect(estadoDe(container)).toBe('native_idle');
    expect(nativeDe(container)).toBeInTheDocument();
    // Y el aviso NO vuelve solo: volver del plano fisico no reabre lo que se
    // habia cerrado.
    expect(container.querySelector('.dico-burbuja')).toBeNull();
  });

  it('tocar a Dico 2D ya NO trae a Physical', () => {
    // El cambio contractual, medido en positivo: el personaje es un control de
    // su mensaje. Si alguien vuelve a cablearlo a `OPEN_PHYSICAL`, esto falla.
    const { container } = render(React.createElement(DicoPresence, datos));
    expect(screen.queryByRole('button', { name: 'Traer a Dico' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver lo que dice Dico' }));
    expect(estadoDe(container)).toBe('native_notice');
    expect(physicalDe(container)).not.toBeInTheDocument();
  });

  it('muestra Native en native_idle', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    expect(estadoDe(container)).toBe('native_idle');
    expect(nativeDe(container)).toBeInTheDocument();
    expect(physicalDe(container)).not.toBeInTheDocument();
  });

  it('conserva Native al abrir un aviso', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    fireEvent.click(screen.getByRole('button', { name: /abrir .*aviso.* de dico/i }));
    expect(estadoDe(container)).toBe('native_notice');
    expect(nativeDe(container)).toBeInTheDocument();
    expect(container.querySelector('.dico-avisos--abierto')).toBeInTheDocument();
  });

  it('oculta Native desde physical_opening', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    abrirPhysical();
    expect(estadoDe(container)).toBe('physical_opening');
    expect(nativeDe(container)).not.toBeInTheDocument();
    expect(physicalDe(container)).toBeInTheDocument();
  });

  it('mantiene Native oculto en physical_open', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    abrirHastaPhysical(container);
    expect(estadoDe(container)).toBe('physical_open');
    expect(nativeDe(container)).not.toBeInTheDocument();
    expect(physicalDe(container)).toBeInTheDocument();
  });

  it('mantiene Native oculto durante todo physical_closing', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    abrirHastaPhysical(container);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    expect(estadoDe(container)).toBe('physical_closing');
    expect(nativeDe(container)).not.toBeInTheDocument();
    expect(physicalDe(container)).toBeInTheDocument();

    // Un `animationend` que sube desde un HIJO no puede terminar el cierre:
    // solo cuenta el del propio `.dico-physical`. El hijo hoy es la capa de la
    // pose; antes era el cuerpo sin cara.
    esperarMovimiento(container.querySelector('.dico-pose'));
    expect(estadoDe(container)).toBe('physical_closing');
    expect(nativeDe(container)).not.toBeInTheDocument();
  });

  it('restaura Native solamente al terminar physical_closing', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    abrirHastaPhysical(container);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    esperarMovimiento(physicalDe(container));
    expect(estadoDe(container)).toBe('native_idle');
    expect(nativeDe(container)).toBeInTheDocument();
    expect(physicalDe(container)).not.toBeInTheDocument();
  });

  it('abrir Physical cierra cualquier notice Native', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    fireEvent.click(screen.getByRole('button', { name: /abrir .*aviso.* de dico/i }));
    expect(estadoDe(container)).toBe('native_notice');
    abrirPhysical();
    expect(estadoDe(container)).toBe('physical_opening');
    expect(container.querySelector('.dico-avisos')).not.toBeInTheDocument();
  });

  it('no restaura el notice anterior cuando Physical termina de cerrar', () => {
    const { container } = render(React.createElement(DicoPresence, datos));
    fireEvent.click(screen.getByRole('button', { name: /abrir .*aviso.* de dico/i }));
    abrirHastaPhysical(container);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    esperarMovimiento(physicalDe(container));

    expect(estadoDe(container)).toBe('native_idle');
    expect(container.querySelector('.dico-avisos--abierto')).not.toBeInTheDocument();
    expect(screen.queryByText(/está sin precio/)).not.toBeInTheDocument();
  });

  it('Reduced Motion recorre la misma maquina sin esperar animaciones', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const cambios = vi.fn();
    const { container } = render(React.createElement(DicoPresence, {
      ...datos, onStateChange: cambios,
    }));

    abrirPhysical();
    await waitFor(() => expect(estadoDe(container)).toBe('physical_open'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    await waitFor(() => expect(estadoDe(container)).toBe('native_idle'));

    expect(cambios.mock.calls.map(([estado]) => estado)).toEqual([
      'native_idle',
      'physical_opening',
      'physical_open',
      'physical_closing',
      'native_idle',
    ]);
  });

  it('ningun estado logico muestra Native y Physical a la vez', () => {
    for (const estado of Object.values(DICO_PRESENCE_STATES)) {
      const visible = visibilidadDico(estado);
      expect(visible.native && visible.physical, estado).toBe(false);
    }
  });
});
