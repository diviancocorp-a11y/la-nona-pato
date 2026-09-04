import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

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

  /* El boton se habilita cuando resuelve el chequeo de slug, que `Signup`
     hace detras de un debounce REAL de 400ms.
   *
   * Antes esto era `waitFor(..., { timeout: 1500 })`: un presupuesto de reloj
   * de pared para esperar un timer de reloj de pared. Con la suite completa
   * —86 archivos en threads— y la maquina ocupada, esos 1500ms se consumian
   * antes de que el timer, el re-render y la promesa terminaran, y el archivo
   * fallaba sin que nada estuviera roto. Subir el numero solo habria movido
   * el umbral hasta la proxima vez que la maquina estuviera mas cargada.
   *
   * Con el reloj bajo control no hay presupuesto que agotar: se adelantan los
   * 400ms exactos y `advanceTimersByTimeAsync` vacia las microtareas que
   * quedan colgando del `await` de adentro del timer. El test deja de
   * depender de cuanto tarda esta maquina hoy. */
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(screen.getByRole('button', { name: /Crear mi negocio/ })).toBeEnabled();
}

describe('Phase 2A /registro visual canary', () => {
  beforeEach(() => {
    // El reloj lo maneja el test, no la maquina (ver `completeSignup`).
    vi.useFakeTimers();
    signupService.slugDisponible.mockReset().mockResolvedValue(true);
    signupService.registrarNegocio.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('uses the approved self-hosted DICO typography contract', () => {
    expect(signupCss).toContain('var(--ds-color-brand-gold-500)');
    expect(signupCss).toContain('var(--ds-font-ui)');
    expect(signupCss).toContain('var(--ds-font-soul)');
    expect(signupCss).toContain('var(--ds-font-technical)');
    expect(signupCss).not.toContain('var(--ds-font-compat-ui)');
    expect(signupCss).not.toContain('var(--ds-font-compat-heading)');
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
    // Vaciar lo que quedo pendiente del submit. Con el reloj bajo control no
    // se puede sondear con `waitFor`: no corre el tiempo solo.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    {
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
    }
  });

  it('preserves the success email state', async () => {
    render(<_Signup />);
    await completeSignup();
    fireEvent.click(screen.getByRole('button', { name: /Crear mi negocio/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.getByRole('heading', { name: 'Revisá tu email' })).toBeInTheDocument();
    expect(screen.getByText('hola@cafeuno.com')).toBeInTheDocument();
    expect(screen.getByText(/cafe-uno\.divianco\.app/)).toBeInTheDocument();
  });
});
