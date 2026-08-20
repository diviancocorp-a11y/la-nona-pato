// Recuperar la contraseña (pantalla /entrar).
//
// Lo que importa que sea cierto:
//   - que quien llega del mail vea el formulario de contraseña NUEVA y no el
//     login comun. Si ve el comun, escribe la contraseña vieja —la que no
//     recuerda, por eso pidio el reset— y no entra;
//   - que eso funcione TAMBIEN si Supabase ya limpio el hash, que es una
//     carrera que se pierde con la conexion justa;
//   - que pedir el reset no revele que direcciones tienen cuenta.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const pedirResetPassword = vi.fn();
const cambiarPassword = vi.fn();
const destinoTrasLogin = vi.fn();

vi.mock('../services/signup', () => ({
  iniciarSesion: vi.fn(),
  destinoTrasLogin: (...a) => destinoTrasLogin(...a),
  pedirResetPassword: (...a) => pedirResetPassword(...a),
  cambiarPassword: (...a) => cambiarPassword(...a),
}));

// El handler que registra la pantalla, para poder disparar el evento.
let handlerDeAuth = null;
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb) => {
        handlerDeAuth = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

const Login = (await import('../pages/Login')).default;

function irA(hash) {
  window.history.replaceState(null, '', `/entrar${hash}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  handlerDeAuth = null;
  destinoTrasLogin.mockResolvedValue({ ok: true, url: 'https://x.divianco.app', slug: 'x' });
});

afterEach(() => { irA(''); });

describe('llega del mail de recuperacion', () => {
  it('con el hash puesto, pide la contraseña nueva', () => {
    irA('#type=recovery&access_token=abc');
    render(<Login />);
    expect(screen.getByText(/Elegí tu contraseña nueva/i)).toBeInTheDocument();
  });

  it('SIN el hash, el evento de Supabase igual la muestra', async () => {
    // Es el caso que se rompia: Supabase limpio el hash antes del render.
    irA('');
    render(<Login />);
    expect(screen.queryByText(/Elegí tu contraseña nueva/i)).not.toBeInTheDocument();

    handlerDeAuth('PASSWORD_RECOVERY', {});
    await waitFor(() => {
      expect(screen.getByText(/Elegí tu contraseña nueva/i)).toBeInTheDocument();
    });
  });

  it('otro evento de auth no cambia la pantalla', async () => {
    irA('');
    render(<Login />);
    handlerDeAuth('SIGNED_IN', {});
    await waitFor(() => {
      expect(screen.queryByText(/Elegí tu contraseña nueva/i)).not.toBeInTheDocument();
    });
  });
});

describe('fijar la contraseña nueva', () => {
  beforeEach(() => { irA('#type=recovery'); });

  it('no acepta si las dos no coinciden', async () => {
    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: 'unaclave123' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'otraclave123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y entrar/i }));
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(cambiarPassword).not.toHaveBeenCalled();
  });

  it('no acepta una demasiado corta', async () => {
    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y entrar/i }));
    expect(await screen.findByText(/al menos 6/i)).toBeInTheDocument();
    expect(cambiarPassword).not.toHaveBeenCalled();
  });

  it('con todo bien, la guarda', async () => {
    cambiarPassword.mockResolvedValue({ ok: true });
    render(<Login />);
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: 'claveNueva123' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'claveNueva123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y entrar/i }));
    await waitFor(() => expect(cambiarPassword).toHaveBeenCalledWith('claveNueva123'));
  });
});

describe('pedir el reset no filtra quien tiene cuenta', () => {
  it('contesta lo mismo exista o no la direccion', async () => {
    irA('');
    pedirResetPassword.mockResolvedValue({ ok: true });
    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: /Olvidé mi contraseña/i }));

    fireEvent.change(screen.getByPlaceholderText('vos@ejemplo.com'), {
      target: { value: 'noexiste@nada.com' },
    });
    // El boton de enviar de la pantalla de reset.
    const botones = screen.getAllByRole('button');
    const enviar = botones.find(b => /mandar|enviar|recuperar|reset/i.test(b.textContent));
    fireEvent.click(enviar);

    // "Si esa dirección tiene cuenta...": nunca confirma que exista.
    const aviso = await screen.findByText(/si esa dirección tiene cuenta/i);
    expect(aviso).toBeInTheDocument();
  });
});
