import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BurbujaDico from '../components/dico/BurbujaDico';

const TEXTO = 'Dico reserva el mensaje completo.';

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BurbujaDico typewriter', () => {
  it('inicia progresivo, mantiene cursor y el click completa', () => {
    const { container } = render(React.createElement(BurbujaDico, { texto: TEXTO }));
    const visible = container.querySelector('.dico-burbuja-texto');

    expect(visible).toHaveTextContent('');
    expect(container.querySelector('.dico-burbuja-cursor')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(18));
    expect(visible).toHaveTextContent(TEXTO.slice(0, 1));

    fireEvent.click(screen.getByRole('button', { name: 'Completar mensaje de Dico' }));
    expect(visible).toHaveTextContent(TEXTO);
    expect(container.querySelector('.dico-burbuja-cursor')).not.toBeInTheDocument();
  });

  it('Reduced Motion muestra el texto completo desde el primer render', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { container } = render(React.createElement(BurbujaDico, { texto: TEXTO }));

    expect(container.querySelector('.dico-burbuja-texto')).toHaveTextContent(TEXTO);
    expect(container.querySelector('.dico-burbuja-cursor')).not.toBeInTheDocument();
    expect(container.querySelector('.dico-burbuja-contenido')).toHaveAttribute('tabindex', '-1');
  });

  it('reserva la geometria con una sola fuente accesible del mensaje', () => {
    const { container } = render(React.createElement(BurbujaDico, { texto: TEXTO }));
    const reserva = container.querySelector('.dico-burbuja-reserva');
    const visible = container.querySelector('.dico-burbuja-texto');
    const lectura = container.querySelectorAll('.dico-burbuja-lectura');

    expect(reserva).toHaveTextContent(TEXTO);
    expect(reserva).toHaveAttribute('aria-hidden', 'true');
    expect(visible).toHaveAttribute('aria-hidden', 'true');
    expect(lectura).toHaveLength(1);
    expect(lectura[0]).toHaveTextContent(TEXTO);
    expect(lectura[0]).not.toHaveAttribute('aria-hidden');
  });

  it('apila reserva y typewriter en la misma celda de flujo', () => {
    const css = readFileSync(resolve('src/components/dico/burbuja.css'), 'utf8');
    const contenido = css.slice(
      css.indexOf('.dico-burbuja-contenido {'),
      css.indexOf('}', css.indexOf('.dico-burbuja-contenido {')),
    );
    const capas = css.slice(
      css.indexOf('.dico-burbuja-reserva,'),
      css.indexOf('}', css.indexOf('.dico-burbuja-reserva,')),
    );
    expect(contenido).toContain('display: grid');
    expect(capas).toContain('grid-area: 1 / 1');
  });
});
