import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const signupService = vi.hoisted(() => ({
  slugDisponible: vi.fn(),
  registrarNegocio: vi.fn(),
}));

vi.mock('../services/signup', () => signupService);

import _Signup from '../pages/Signup';

const signupCss = readFileSync('src/styles/signup.css', 'utf8');

async function completeSignup() {
  fireEvent.change(screen.getByLabelText('¿Cómo se llama tu negocio?'), {
    target: { value: 'Café Uno' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Barbería/ }));
  fireEvent.click(screen.getByRole('button', { name: /Solo a distancia/ }));
  fireEvent.change(screen.getByLabelText('¿En qué país?'), {
    target: { value: 'UY' },
  });
  fireEvent.change(screen.getByLabelText('Tu email'), {
    target: { value: 'hola@cafeuno.com' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'segura123' },
  });

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Crear mi negocio/ })).toBeEnabled();
  }, { timeout: 1500 });
}

describe('Phase 2A /registro visual canary', () => {
  beforeEach(() => {
    signupService.slugDisponible.mockReset().mockResolvedValue(true);
    signupService.registrarNegocio.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the DICO token contract and licensed-font fallbacks only', () => {
    expect(signupCss).toContain('var(--ds-color-brand-gold-500)');
    expect(signupCss).toContain('var(--ds-font-compat-ui)');
    expect(signupCss).toContain('var(--ds-font-compat-heading)');
    expect(signupCss).toContain('var(--ds-font-compat-technical)');
    expect(signupCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(signupCss).not.toMatch(/url\s*\(/i);
  });

  it('preserves every field, option and default selection', () => {
    render(<_Signup />);

    expect(screen.getByLabelText('¿Cómo se llama tu negocio?')).toBeInTheDocument();
    expect(screen.getByLabelText('¿En qué país?')).toHaveValue('AR');
    expect(screen.getByLabelText('La dirección de tu local')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();

    const choices = screen.getAllByRole('button').filter((button) => (
      button.hasAttribute('aria-pressed')
    ));
    expect(choices).toHaveLength(6);
    expect(screen.getByRole('button', { name: /Gastronomía/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Local a la calle/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Crear mi negocio/ })).toBeDisabled();
  });

  it('preserves the exact signup payload derivation', async () => {
    render(<_Signup />);
    await completeSignup();

    fireEvent.click(screen.getByRole('button', { name: /Crear mi negocio/ }));

    await waitFor(() => {
      expect(signupService.registrarNegocio).toHaveBeenCalledWith({
        email: 'hola@cafeuno.com',
        password: 'segura123',
        bizName: 'Café Uno',
        vertical: 'barber',
        slug: 'cafe-uno',
        operationMode: 'virtual',
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        channels: ['online_booking'],
      });
    });
  });

  it('preserves the success email state', async () => {
    render(<_Signup />);
    await completeSignup();
    fireEvent.click(screen.getByRole('button', { name: /Crear mi negocio/ }));

    expect(await screen.findByRole('heading', { name: 'Revisá tu email' })).toBeInTheDocument();
    expect(screen.getByText('hola@cafeuno.com')).toBeInTheDocument();
    expect(screen.getByText(/cafe-uno\.divianco\.app/)).toBeInTheDocument();
  });
});
