import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DicoEscena, { POSES_DICO_ESCENA } from '../components/dico/DicoEscena';
import DicoCara from '../components/dico/DicoCara';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('DicoEscena', () => {
  it('mantiene la identidad canonica en el Dico chico', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'idle', size: 30, title: 'Dico chico',
    }));
    expect(screen.getByRole('img', { name: 'Dico chico' })).toBeInTheDocument();
    expect(container.querySelector('.dico-bigote')).toBeInTheDocument();
    expect(container.querySelector('.dico-nariz')).toBeInTheDocument();
  });

  it('muestra la espera con puntos sin cambiar el cuerpo', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'esperando', size: 48, title: 'Dico esperando',
    }));
    expect(container.querySelectorAll('.dico-espera-punto')).toHaveLength(3);
    expect(container.querySelector('.dico--esperando')).toBeInTheDocument();
  });

  it('expone las siete poses canonicas', () => {
    expect(POSES_DICO_ESCENA).toEqual([
      'celebra', 'descubre', 'explica', 'fatal', 'idle', 'pregunta', 'senala',
    ]);
  });

  it('muestra el mensaje y ejecuta la accion principal', () => {
    const onAccion = vi.fn();
    render(React.createElement(DicoEscena, {
      pose: 'senala',
      texto: 'Empecemos por tu primer producto.',
      accion: '+ Agregar producto',
      onAccion,
      title: 'Dico señala el botón',
    }));

    expect(screen.getByRole('img', { name: 'Dico señala el botón' })).toBeInTheDocument();
    expect(screen.getByText('Empecemos por tu primer producto.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar producto' }));
    expect(onAccion).toHaveBeenCalledOnce();
  });

  it('usa la pose neutra cuando recibe una desconocida', () => {
    render(React.createElement(DicoEscena, { pose: 'inventada', title: 'Dico neutro' }));
    expect(screen.getByRole('img', { name: 'Dico neutro' }).getAttribute('src'))
      .toContain('escena-idle');
  });
});
