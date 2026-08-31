import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DicoSlot from '../components/dico/DicoSlot';

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

describe('DicoSlot', () => {
  it('controla Physical sin montar otro Dico Native', () => {
    const { container } = render(React.createElement(DicoSlot));
    const abrir = screen.getByRole('button', { name: 'Abrir Dico Physical' });

    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
    expect(container.querySelector('[data-dico-core]')).not.toBeInTheDocument();

    fireEvent.click(abrir);
    expect(container.querySelector('.dico-physical')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar Dico Physical' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Dico Physical' }));
    expect(container.querySelector('.dico-physical')).not.toBeInTheDocument();
  });
});
