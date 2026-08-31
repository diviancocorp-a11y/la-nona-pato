import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DicoSlot from '../components/dico/DicoSlot';

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('DicoSlot', () => {
  it('controla Physical sin montar otro Dico Native y conserva el retorno', () => {
    const { container } = render(React.createElement(DicoSlot));
    const abrir = screen.getByRole('button', { name: 'Abrir Dico Physical' });

    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
    expect(container.querySelector('[data-dico-core]')).not.toBeInTheDocument();

    fireEvent.click(abrir);
    const physical = container.querySelector('.dico-physical');
    expect(physical).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar Dico Physical' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    expect(container.querySelector('.dico-physical')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardando Dico Physical' })).toBeDisabled();
    expect(container.querySelector('.dico-slot')).toHaveClass('dico-slot--cerrando');

    fireEvent.animationEnd(physical);
    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir Dico Physical' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('cierra inmediatamente con Reduced Motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { container } = render(React.createElement(DicoSlot));

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Dico Physical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));

    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
  });
});
