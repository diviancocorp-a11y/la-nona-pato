// src/pages/Signup.jsx
// Alta self-service: el cliente crea su propio negocio en la plataforma.
//
// Vive en la RAIZ (divianco.app/registro). No tiene sentido en el subdominio
// de un tenant, que ya pertenece a alguien.
//
// El slug se sugiere desde el nombre del negocio pero se puede editar; una
// vez que el dueño lo toca, deja de auto-completarse para no pisarle lo que
// escribio. La disponibilidad se consulta con debounce contra slug_available.

import { useState, useEffect, useRef, useCallback } from 'react';
import { slugify, validateSlug } from '../lib/slugify';
import { slugDisponible, registrarNegocio } from '../services/signup';

const VERTICALES = [
  { id: 'gastro', emoji: '🍔', nombre: 'Gastronomía', detalle: 'Carta, pedidos, recetas' },
  { id: 'barber', emoji: '✂️', nombre: 'Barbería', detalle: 'Turnos y servicios' },
  { id: 'retail', emoji: '👕', nombre: 'Indumentaria', detalle: 'Talles, colores y stock' },
];

const C = {
  bg: '#0f0e0d', card: 'rgba(255,255,255,0.05)', line: 'rgba(255,255,255,0.12)',
  tx: '#f5f1ea', t2: 'rgba(245,241,234,0.6)', ac: '#e8b947',
  ok: '#4ade80', err: '#f87171',
};

const inputStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 15,
  background: 'rgba(0,0,0,0.25)', border: `1px solid ${C.line}`,
  color: C.tx, outline: 'none', boxSizing: 'border-box',
};

function Campo({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', marginTop: 5, fontSize: 12.5, color: C.t2 }}>{hint}</span>}
    </label>
  );
}

export default function Signup() {
  const [bizName, setBizName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [vertical, setVertical] = useState('gastro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [dispo, setDispo] = useState(null);   // null | 'checking' | true | false
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);

  const debounce = useRef(null);

  useEffect(() => { document.title = 'Crear mi negocio — Dico'; }, []);

  // Sugerencia de slug mientras el dueño no lo haya editado a mano.
  useEffect(() => {
    if (!slugTocado) setSlug(slugify(bizName));
  }, [bizName, slugTocado]);

  const validacionLocal = validateSlug(slug);

  // Disponibilidad contra el server, con debounce para no consultar por tecla.
  useEffect(() => {
    if (!validacionLocal.ok) { setDispo(null); return; }
    setDispo('checking');
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setDispo(await slugDisponible(slug));
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [slug, validacionLocal.ok]);

  const puedeEnviar =
    bizName.trim().length >= 2 &&
    validacionLocal.ok && dispo === true &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8 &&
    !enviando;

  const enviar = useCallback(async (e) => {
    e.preventDefault();
    if (!puedeEnviar) return;
    setEnviando(true); setError(null);
    const r = await registrarNegocio({ email, password, bizName, vertical, slug });
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setListo(true);
  }, [puedeEnviar, email, password, bizName, vertical, slug]);

  const wrap = {
    minHeight: '100dvh', background: C.bg, color: C.tx,
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    padding: '40px 20px', display: 'flex', justifyContent: 'center',
  };

  if (listo) {
    return (
      <main style={{ ...wrap, alignItems: 'center' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>📬</div>
          <h1 style={{ fontSize: 24, margin: '14px 0 10px' }}>Revisá tu email</h1>
          <p style={{ color: C.t2, fontSize: 15, lineHeight: 1.55 }}>
            Te mandamos un link a <strong style={{ color: C.tx }}>{email}</strong>.
            Cuando lo confirmes, creamos <strong style={{ color: C.tx }}>{slug}.divianco.app</strong> y
            entrás a cargar tu carta.
          </p>
          <p style={{ color: C.t2, fontSize: 13, marginTop: 18, lineHeight: 1.5 }}>
            Si no llega en unos minutos, mirá en spam. La dirección queda
            reservada para vos mientras tanto.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <form onSubmit={enviar} style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Dico</div>
          <p style={{ color: C.t2, fontSize: 15, marginTop: 6 }}>
            Creá tu negocio. Es gratis y toma un minuto.
          </p>
        </div>

        <Campo label="¿Cómo se llama tu negocio?">
          <input
            style={inputStyle} value={bizName} autoFocus
            onChange={(e) => setBizName(e.target.value)}
            placeholder="Pizzería Doña Rosa" maxLength={80}
          />
        </Campo>

        <Campo label="¿A qué te dedicás?">
          <div style={{ display: 'flex', gap: 8 }}>
            {VERTICALES.map((v) => {
              const activo = vertical === v.id;
              return (
                <button
                  type="button" key={v.id} onClick={() => setVertical(v.id)}
                  style={{
                    flex: 1, padding: '12px 6px', borderRadius: 11, cursor: 'pointer',
                    background: activo ? 'rgba(232,185,71,0.14)' : C.card,
                    border: `1.5px solid ${activo ? C.ac : C.line}`,
                    color: C.tx, textAlign: 'center', font: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 21 }}>{v.emoji}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, marginTop: 4 }}>{v.nombre}</div>
                  <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{v.detalle}</div>
                </button>
              );
            })}
          </div>
        </Campo>

        <Campo label="La dirección de tu local">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              style={{ ...inputStyle, flex: 1 }} value={slug}
              onChange={(e) => { setSlugTocado(true); setSlug(slugify(e.target.value)); }}
              placeholder="mi-negocio" maxLength={40} spellCheck={false}
            />
            <span style={{ color: C.t2, fontSize: 14, whiteSpace: 'nowrap' }}>.divianco.app</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, minHeight: 18 }}>
            {slug && !validacionLocal.ok && (
              <span style={{ color: C.err }}>{validacionLocal.reason}</span>
            )}
            {validacionLocal.ok && dispo === 'checking' && (
              <span style={{ color: C.t2 }}>Verificando…</span>
            )}
            {validacionLocal.ok && dispo === true && (
              <span style={{ color: C.ok }}>✓ {slug}.divianco.app está libre</span>
            )}
            {validacionLocal.ok && dispo === false && (
              <span style={{ color: C.err }}>Esa dirección ya está ocupada</span>
            )}
            {validacionLocal.ok && dispo === null && (
              <span style={{ color: C.t2 }}>No pudimos verificar la disponibilidad</span>
            )}
          </div>
        </Campo>

        <Campo label="Tu email">
          <input
            style={inputStyle} type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="vos@ejemplo.com"
          />
        </Campo>

        <Campo label="Contraseña" hint="Mínimo 8 caracteres.">
          <input
            style={inputStyle} type="password" value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />
        </Campo>

        {error && (
          <div style={{
            padding: '11px 13px', borderRadius: 10, marginBottom: 14, fontSize: 14,
            background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
            color: '#fca5a5',
          }}>{error}</div>
        )}

        <button
          type="submit" disabled={!puedeEnviar}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            fontSize: 15.5, fontWeight: 700, font: 'inherit',
            background: puedeEnviar ? C.ac : 'rgba(255,255,255,0.1)',
            color: puedeEnviar ? '#1a1408' : C.t2,
            cursor: puedeEnviar ? 'pointer' : 'not-allowed',
          }}
        >
          {enviando ? 'Creando…' : 'Crear mi negocio'}
        </button>

        <p style={{ color: C.t2, fontSize: 12.5, marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
          Te vamos a pedir que confirmes el email antes de activar el local.
        </p>
      </form>
    </main>
  );
}
