import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DicoSlot from '../components/dico/DicoSlot';

describe('DicoSlot', () => {
  it('renderiza el estado controlado y solo emite intenciones y finales', () => {
    const onAbrir = vi.fn();
    const onAperturaCompleta = vi.fn();
    const onCerrar = vi.fn();
    const onCierreCompleto = vi.fn();
    const props = { onAbrir, onAperturaCompleta, onCerrar, onCierreCompleto };
    const { container, rerender } = render(React.createElement(DicoSlot, {
      ...props, estado: 'native_idle',
    }));
    const abrir = screen.getByRole('button', { name: 'Abrir Dico Physical' });

    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
    expect(container.querySelector('[data-dico-core]')).not.toBeInTheDocument();

    fireEvent.click(abrir);
    expect(onAbrir).toHaveBeenCalledOnce();
    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();

    rerender(React.createElement(DicoSlot, { ...props, estado: 'physical_opening' }));
    const physical = container.querySelector('.dico-physical');
    expect(physical).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abriendo Dico Physical' })).toBeDisabled();

    fireEvent(physical, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(onAperturaCompleta).toHaveBeenCalledOnce();

    rerender(React.createElement(DicoSlot, { ...props, estado: 'physical_open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    expect(onCerrar).toHaveBeenCalledOnce();

    rerender(React.createElement(DicoSlot, { ...props, estado: 'physical_closing' }));
    expect(container.querySelector('.dico-physical')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardando Dico Physical' })).toBeDisabled();
    expect(container.querySelector('.dico-slot')).toHaveClass('dico-slot--cerrando');

    // React 19 detects jsdom's prefixed animation event at module load.
    fireEvent(container.querySelector('.dico-physical'), new Event('webkitAnimationEnd', { bubbles: true }));
    expect(onCierreCompleto).toHaveBeenCalledOnce();
  });
});
