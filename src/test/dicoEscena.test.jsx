import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DicoEscena, { POSES_DICO_ESCENA } from '../components/dico/DicoEscena';
import DicoCara from '../components/dico/DicoCara';
import DicoCoreEscena from '../components/dico/DicoCoreEscena';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('DicoEscena', () => {
  it('mantiene la anatomia modular y adulta en el Dico chico', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'idle', size: 30, title: 'Dico chico',
    }));
    expect(screen.getByRole('img', { name: 'Dico chico' })).toBeInTheDocument();
    expect(container.querySelectorAll('.dico-ojo')).toHaveLength(2);
    expect(container.querySelectorAll('.dico-ceja')).toHaveLength(2);
    expect(container.querySelectorAll('.dico-parpado')).toHaveLength(2);
    expect(container.querySelector('.dico-bigote')).not.toBeInTheDocument();
    expect(container.querySelector('.dico-nariz')).not.toBeInTheDocument();
    expect(container.querySelector('.dico-rubor')).not.toBeInTheDocument();
  });

  it('dirige y limita la mirada sin crear otro estado', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'pregunta', lookX: 4, lookY: -4,
    }));
    const mirada = container.querySelector('.dico-pupila-param');
    expect(container.querySelector('.dico--pregunta.dico--mirada-dirigida')).toBeInTheDocument();
    expect(mirada.style.getPropertyValue('--dico-look-x')).toBe('2.6px');
    expect(mirada.style.getPropertyValue('--dico-look-y')).toBe('-1.8px');
  });

  it('deja preparados tres frames simples de habla', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'idle', speakingFrame: 'mid',
    }));
    expect(container.querySelector('.dico--habla-mid')).toBeInTheDocument();
    expect(container.querySelector('.dico-boca--habla-cerrada')).toBeInTheDocument();
    expect(container.querySelector('.dico-boca--habla-media')).toBeInTheDocument();
    expect(container.querySelector('.dico-boca--habla-abierta')).toBeInTheDocument();
  });

  it('muestra la espera con puntos sin cambiar el cuerpo', () => {
    const { container } = render(React.createElement(DicoCara, {
      estado: 'esperando', size: 48, title: 'Dico esperando',
    }));
    expect(container.querySelectorAll('.dico-espera-punto')).toHaveLength(3);
    expect(container.querySelector('.dico--esperando')).toBeInTheDocument();
  });

  it('usa el Core modular en una escena operativa', () => {
    const { container } = render(React.createElement(DicoCoreEscena, {
      estado: 'pregunta', lookY: 0.65, title: 'Dico mira la accion',
    }));
    expect(screen.getByRole('img', { name: 'Dico mira la accion' })).toBeInTheDocument();
    expect(container.querySelector('.dico-cuadro--core .dico--pregunta')).toBeInTheDocument();
    expect(container.querySelector('.dico-cuadro--core img').getAttribute('src')).toContain('moneda');
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
