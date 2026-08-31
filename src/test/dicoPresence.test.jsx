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
const nativeDe = container => container.querySelector('[data-dico-core]');
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

describe('DicoPresence', () => {
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

    esperarMovimiento(container.querySelector('.dico-physical-cuerpo'));
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
