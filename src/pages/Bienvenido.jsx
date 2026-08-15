// src/pages/Bienvenido.jsx
// Donde cae el usuario al confirmar su email (emailRedirectTo del signUp).
//
// ACA se crea el tenant, no en el formulario: con la confirmacion de email
// activada, auth.signUp() no devuelve sesion, y signup_tenant() exige una
// (toma la identidad de auth.uid(), nunca del caller). Recien al volver del
// mail hay con que.
//
// Es idempotente: signup_tenant (0019) devuelve el tenant existente con
// already_existed=true en vez de fallar, asi que recargar o volver a tocar el
// link del mail lleva al local igual, sin ramas por texto de error.

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { crearTenantPendiente, urlDelNegocio } from '../services/signup';

const C = {
  bg: '#0f0e0d', tx: '#f5f1ea', t2: 'rgba(245,241,234,0.6)',
  ac: '#e8b947', err: '#f87171',
};

const wrap = {
  minHeight: '100dvh', background: C.bg, color: C.tx,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '40px 24px', textAlign: 'center',
  fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
};

export default function Bienvenido() {
  const [estado, setEstado] = useState('cargando'); // cargando | ok | sin-sesion | error
  const [slug, setSlug] = useState(null);
  const [error, setError] = useState(null);
  const yaCorrio = useRef(false);

  useEffect(() => {
    document.title = 'Activando tu negocio — Dico';
    // StrictMode monta dos veces en dev: sin esto se dispara el alta dos
    // veces y la segunda choca contra "ya tiene un negocio".
    if (yaCorrio.current) return;
    yaCorrio.current = true;

    (async () => {
      // El SDK procesa el token del link y deja la sesion antes de esto.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setEstado('sin-sesion'); return; }

      // signup_tenant es idempotente (0019): si el dueño recarga o vuelve a
      // tocar el link del mail, devuelve el tenant que ya tiene en vez de
      // fallar. Por eso aca no hay rama por texto de error ni consulta extra.
      const r = await crearTenantPendiente();

      if (r.ok) { setSlug(r.slug); setEstado('ok'); return; }

      setError(r.error);
      setEstado('error');
    })();
  }, []);

  useEffect(() => {
    if (estado !== 'ok' || !slug) return;
    const t = setTimeout(() => { window.location.href = urlDelNegocio(slug); }, 2200);
    return () => clearTimeout(t);
  }, [estado, slug]);

  if (estado === 'cargando') {
    return <main style={wrap}><p style={{ color: C.t2 }}>Activando tu negocio…</p></main>;
  }

  if (estado === 'sin-sesion') {
    return (
      <main style={wrap}>
        <div style={{ maxWidth: 400 }}>
          <div style={{ fontSize: 40 }}>🔑</div>
          <h1 style={{ fontSize: 22, margin: '14px 0 10px' }}>Necesitamos que inicies sesión</h1>
          <p style={{ color: C.t2, fontSize: 15, lineHeight: 1.55 }}>
            El link de confirmación puede haber vencido. Entrá con tu email y
            contraseña y terminamos de crear tu local.
          </p>
          <a
            href="/entrar"
            style={{
              display: 'inline-block', marginTop: 20, padding: '11px 22px',
              borderRadius: 10, background: C.ac, color: '#1a1408',
              fontWeight: 700, fontSize: 15, textDecoration: 'none',
            }}
          >
            Entrar
          </a>
        </div>
      </main>
    );
  }

  if (estado === 'error') {
    return (
      <main style={wrap}>
        <div style={{ maxWidth: 400 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 22, margin: '14px 0 10px' }}>No pudimos activarlo</h1>
          <p style={{ color: C.err, fontSize: 15, lineHeight: 1.55 }}>{error}</p>
          <p style={{ color: C.t2, fontSize: 13, marginTop: 16 }}>
            Tu cuenta está creada: no hace falta que te registres de nuevo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 44 }}>🎉</div>
        <h1 style={{ fontSize: 25, margin: '14px 0 10px' }}>¡Tu local ya existe!</h1>
        <p style={{ color: C.t2, fontSize: 15, lineHeight: 1.55 }}>
          Está en <strong style={{ color: C.ac }}>{slug}.divianco.app</strong>
          <br />Te llevamos para allá…
        </p>
        <a
          href={urlDelNegocio(slug)}
          style={{
            display: 'inline-block', marginTop: 20, padding: '11px 22px',
            borderRadius: 10, background: C.ac, color: '#1a1408',
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
          }}
        >
          Entrar ahora
        </a>
      </div>
    </main>
  );
}
