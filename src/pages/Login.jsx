// src/pages/Login.jsx
// Entrada a la plataforma (divianco.app/entrar).
//
// POR QUE EXISTE: sin esto, un dueño que confirmaba el mail y cerraba la
// pestaña quedaba con una cuenta valida y NINGUNA forma de volver. Paso de
// verdad en la primera prueba de alta: el redirect fallaba y la cuenta
// quedaba huerfana.
//
// Cubre los dos casos con la MISMA llamada, porque signup_tenant() es
// idempotente (0019):
//   - ya tiene negocio                  -> lo devuelve -> va a su subdominio
//   - confirmo pero nunca llego a /bienvenido -> lo crea ahora
// No hace falta preguntar antes en que caso esta.

import { useState, useEffect, useCallback } from 'react';
import { iniciarSesion, destinoTrasLogin, pedirResetPassword, cambiarPassword } from '../services/signup';

const C = {
  bg: '#0f0e0d', line: 'rgba(255,255,255,0.12)',
  tx: '#f5f1ea', t2: 'rgba(245,241,234,0.6)', ac: '#e8b947',
  err: '#f87171', ok: '#4ade80',
};

const inputStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 15,
  background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.line}`,
  color: C.tx, outline: 'none', boxSizing: 'border-box',
};

const wrap = {
  minHeight: '100dvh', background: C.bg, color: C.tx,
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  padding: '40px 20px', display: 'flex', justifyContent: 'center',
  alignItems: 'center',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [destino, setDestino] = useState(null);
  const [modoReset, setModoReset] = useState(false);
  // El link del mail de reset vuelve a /entrar con type=recovery en el hash y
  // una sesion ya abierta: lo que falta es fijar la contraseña nueva. Se lee
  // en el inicializador (primer render, sincronico) porque el cliente de
  // Supabase procesa y limpia ese hash apenas puede.
  const [modoNueva, setModoNueva] = useState(() => {
    try { return window.location.hash.includes('type=recovery'); } catch { return false; }
  });
  const [password2, setPassword2] = useState('');

  useEffect(() => { document.title = 'Entrar — Dico'; }, []);

  const guardarNueva = useCallback(async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (password.length < 6) { setError('La contraseña necesita al menos 6 caracteres.'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden.'); return; }
    setEnviando(true); setError(null); setAviso(null);

    const r = await cambiarPassword(password);
    if (!r.ok) { setError(r.error); setEnviando(false); return; }

    // Con la clave ya cambiada, mismo destino que un login normal.
    const d = await destinoTrasLogin();
    setEnviando(false);
    if (!d.ok) { setError(d.error); return; }
    setDestino(d);
    window.location.href = d.url;
  }, [password, password2, enviando]);

  const entrar = useCallback(async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(null); setAviso(null);

    const login = await iniciarSesion({ email, password });
    if (!login.ok) { setError(login.error); setEnviando(false); return; }

    const d = await destinoTrasLogin();
    setEnviando(false);
    if (!d.ok) { setError(d.error); return; }

    setDestino(d);
    window.location.href = d.url;
  }, [email, password, enviando]);

  const resetear = useCallback(async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(null); setAviso(null);
    const r = await pedirResetPassword(email);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    // Mensaje deliberadamente ambiguo: confirmar que el mail existe permitiria
    // averiguar que direcciones estan registradas en la plataforma.
    setAviso('Si esa dirección tiene cuenta, te mandamos un mail para cambiar la contraseña.');
  }, [email, enviando]);

  if (destino) {
    return (
      <main style={wrap}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 40 }}>👋</div>
          <h1 style={{ fontSize: 22, margin: '14px 0 10px' }}>Entrando a tu local</h1>
          <p style={{ color: C.t2, fontSize: 15 }}>
            <strong style={{ color: C.ac }}>{destino.slug}.divianco.app</strong>
          </p>
          <a href={destino.url} style={{ color: C.ac, fontSize: 14, display: 'inline-block', marginTop: 14 }}>
            Si no pasa nada, tocá acá
          </a>
        </div>
      </main>
    );
  }

  if (modoNueva) {
    return (
      <main style={wrap}>
        <form onSubmit={guardarNueva} style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Dico</div>
            <p style={{ color: C.t2, fontSize: 15, marginTop: 6 }}>Elegí tu contraseña nueva.</p>
          </div>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Contraseña nueva</span>
            <input
              style={inputStyle} type="password" value={password} autoFocus autoComplete="new-password"
              onChange={(ev) => setPassword(ev.target.value)} placeholder="Mínimo 6 caracteres"
            />
          </label>

          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Repetila</span>
            <input
              style={inputStyle} type="password" value={password2} autoComplete="new-password"
              onChange={(ev) => setPassword2(ev.target.value)} placeholder="••••••••"
            />
          </label>

          {error && (
            <div style={{
              padding: '11px 13px', borderRadius: 10, marginBottom: 14, fontSize: 14,
              background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
              color: '#fca5a5',
            }}>{error}</div>
          )}

          <button
            type="submit" disabled={enviando}
            style={{
              width: '100%', padding: '13px', borderRadius: 11, border: 'none',
              fontSize: 15.5, fontWeight: 700, font: 'inherit',
              background: enviando ? 'rgba(255,255,255,0.1)' : C.ac,
              color: enviando ? C.t2 : '#1a1408',
              cursor: enviando ? 'not-allowed' : 'pointer',
            }}
          >
            {enviando ? 'Un momento…' : 'Guardar y entrar'}
          </button>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5 }}>
            <button
              type="button"
              onClick={() => { setModoNueva(false); setPassword(''); setPassword2(''); setError(null); }}
              style={{ background: 'none', border: 'none', color: C.t2, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
            >
              Volver a entrar
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <form onSubmit={modoReset ? resetear : entrar} style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Dico</div>
          <p style={{ color: C.t2, fontSize: 15, marginTop: 6 }}>
            {modoReset ? 'Te mandamos un link para cambiarla.' : 'Entrá a tu negocio.'}
          </p>
        </div>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</span>
          <input
            style={inputStyle} type="email" value={email} autoFocus autoComplete="email"
            onChange={(ev) => setEmail(ev.target.value)} placeholder="vos@ejemplo.com"
          />
        </label>

        {!modoReset && (
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Contraseña</span>
            <input
              style={inputStyle} type="password" value={password} autoComplete="current-password"
              onChange={(ev) => setPassword(ev.target.value)} placeholder="••••••••"
            />
          </label>
        )}

        {error && (
          <div style={{
            padding: '11px 13px', borderRadius: 10, marginBottom: 14, fontSize: 14,
            background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
            color: '#fca5a5',
          }}>{error}</div>
        )}

        {aviso && (
          <div style={{
            padding: '11px 13px', borderRadius: 10, marginBottom: 14, fontSize: 14,
            background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.28)',
            color: C.ok,
          }}>{aviso}</div>
        )}

        <button
          type="submit" disabled={enviando}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            fontSize: 15.5, fontWeight: 700, font: 'inherit',
            background: enviando ? 'rgba(255,255,255,0.1)' : C.ac,
            color: enviando ? C.t2 : '#1a1408',
            cursor: enviando ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando ? 'Un momento…' : (modoReset ? 'Mandarme el link' : 'Entrar')}
        </button>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13.5 }}>
          <button
            type="button"
            onClick={() => { setModoReset(!modoReset); setError(null); setAviso(null); }}
            style={{ background: 'none', border: 'none', color: C.t2, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
          >
            {modoReset ? 'Volver a entrar' : 'Olvidé mi contraseña'}
          </button>
        </div>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 13.5, color: C.t2 }}>
          ¿Todavía no tenés negocio?{' '}
          <a href="/registro" style={{ color: C.ac }}>Creá el tuyo</a>
        </div>
      </form>
    </main>
  );
}
