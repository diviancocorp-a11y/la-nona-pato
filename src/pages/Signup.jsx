// src/pages/Signup.jsx
// Alta self-service: el cliente crea su propio negocio en la plataforma.

import { useState, useEffect, useRef, useCallback } from 'react';
import { slugify, validateSlug } from '../lib/slugify';
import { slugDisponible, registrarNegocio } from '../services/signup';
import { modosDisponibles, canalesSugeridos } from '../modules/registry';
import { paisesDisponibles, monedaDe, zonaDe, PAIS_POR_DEFECTO } from '../modules/paises';
import '../styles/signup.css';

const VERTICALES = [
  { id: 'gastro', nombre: 'Gastronomía', detalle: 'Carta, pedidos, recetas' },
  { id: 'barber', nombre: 'Barbería', detalle: 'Turnos y servicios' },
  { id: 'retail', nombre: 'Indumentaria', detalle: 'Talles, colores y stock' },
];

const MODOS = modosDisponibles();
const PAISES = paisesDisponibles();

function VerticalIcon({ id }) {
  if (id === 'gastro') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3v8M4.5 3v5.5A2.5 2.5 0 0 0 7 11M9.5 3v5.5A2.5 2.5 0 0 1 7 11v10M16 3v18M16 3c2.3 0 4 2.4 4 5.5S18.3 14 16 14" />
      </svg>
    );
  }

  if (id === 'barber') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="7" r="2.5" />
        <circle cx="6" cy="17" r="2.5" />
        <path d="m8.2 8.2 11.3 7.3M8.2 15.8 19.5 8.5M10.8 12l-2.6-1.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8.5 4 3.5 2 3.5-2 4 3-2 3v10h-11V10l-2-3 4-3Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function Campo({ label, hint, htmlFor, children }) {
  return (
    <div className="signup-field">
      <label className="signup-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="signup-hint">{hint}</p>}
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="signup-brand" aria-label="Dico">
      <div className="signup-brand__grid" aria-hidden="true" />
      <div className="signup-wordmark">
        <span>DICO</span>
        <i aria-hidden="true" />
      </div>
      <div className="signup-brand__message">
        <p className="signup-technical">Alta de negocio · Sistema Dico</p>
        <h1><span>Creá tu</span> <span>negocio.</span></h1>
        <p>Es gratis y toma un minuto.</p>
      </div>
      <ol className="signup-brand__steps" aria-label="Proceso de alta">
        <li><span>01</span>Configurá</li>
        <li><span>02</span>Confirmá</li>
        <li><span>03</span>Empezá</li>
      </ol>
    </aside>
  );
}

export default function Signup() {
  const [bizName, setBizName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTocado, setSlugTocado] = useState(false);
  const [vertical, setVertical] = useState('gastro');
  const [modo, setModo] = useState('fisico');
  const [country, setCountry] = useState(PAIS_POR_DEFECTO);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [dispo, setDispo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [listo, setListo] = useState(false);

  const debounce = useRef(null);

  useEffect(() => { document.title = 'Crear mi negocio — Dico'; }, []);

  useEffect(() => {
    if (!slugTocado) setSlug(slugify(bizName));
  }, [bizName, slugTocado]);

  const validacionLocal = validateSlug(slug);

  useEffect(() => {
    if (!validacionLocal.ok) { setDispo(null); return; }
    setDispo('checking');
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setDispo(await slugDisponible(slug));
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [slug, validacionLocal.ok]);

  const paisElegido = PAISES.find((p) => p.id === country);

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
    const r = await registrarNegocio({
      email, password, bizName, vertical, slug,
      operationMode: modo,
      country,
      currency: monedaDe(country),
      timezone: zonaDe(country),
      channels: canalesSugeridos(vertical, modo),
    });
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setListo(true);
  }, [puedeEnviar, email, password, bizName, vertical, slug, modo, country]);

  if (listo) {
    return (
      <main className="signup-page signup-page--success">
        <BrandPanel />
        <section className="signup-workspace signup-success-wrap">
          <div className="signup-success" role="status">
            <div className="signup-success__icon"><MailIcon /></div>
            <p className="signup-eyebrow">Registro recibido</p>
            <h2>Revisá tu email</h2>
            <p>
              Te mandamos un link a <strong>{email}</strong>. Cuando lo confirmes,
              creamos <strong>{slug}.divianco.app</strong> y entrás a cargar tu carta.
            </p>
            <p className="signup-success__note">
              Si no llega en unos minutos, mirá en spam. La dirección queda reservada
              para vos mientras tanto.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="signup-page">
      <BrandPanel />

      <section className="signup-workspace">
        <header className="signup-intro">
          <p className="signup-eyebrow">Configuración inicial</p>
          <h2>Empecemos por lo esencial</h2>
          <p>Todo lo demás se puede ajustar después.</p>
        </header>

        <form className="signup-form" onSubmit={enviar}>
          <section className="signup-card" aria-labelledby="signup-business-heading">
            <header className="signup-card__heading">
              <span>01</span>
              <h3 id="signup-business-heading">Tu negocio</h3>
            </header>

            <Campo label="¿Cómo se llama tu negocio?" htmlFor="signup-business-name">
              <input
                id="signup-business-name"
                className="signup-control"
                value={bizName}
                autoFocus
                onChange={(e) => setBizName(e.target.value)}
                placeholder="Pizzería Doña Rosa"
                maxLength={80}
              />
            </Campo>

            <fieldset className="signup-fieldset">
              <legend className="signup-label">¿A qué te dedicás?</legend>
              <div className="signup-options signup-options--verticals">
                {VERTICALES.map((v) => {
                  const activo = vertical === v.id;
                  return (
                    <button
                      className={`signup-option${activo ? ' is-active' : ''}`}
                      type="button"
                      key={v.id}
                      onClick={() => setVertical(v.id)}
                      aria-pressed={activo}
                    >
                      <span className="signup-option__icon"><VerticalIcon id={v.id} /></span>
                      <span className="signup-option__copy">
                        <strong>{v.nombre}</strong>
                        <small>{v.detalle}</small>
                      </span>
                      <span className="signup-option__state" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="signup-fieldset">
              <legend className="signup-label">¿Cómo atendés?</legend>
              <div className="signup-options signup-options--modes">
                {MODOS.map((m) => {
                  const activo = modo === m.id;
                  return (
                    <button
                      className={`signup-option signup-option--mode${activo ? ' is-active' : ''}`}
                      type="button"
                      key={m.id}
                      onClick={() => setModo(m.id)}
                      aria-pressed={activo}
                    >
                      <span className="signup-option__copy">
                        <strong>{m.label}</strong>
                        <small>{m.hint}</small>
                      </span>
                      <span className="signup-option__state" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <p className="signup-hint">Define si vas a manejar mesas, caja y gente en el local.</p>
            </fieldset>

            <Campo
              label="¿En qué país?"
              htmlFor="signup-country"
              hint={paisElegido && !paisElegido.factura
                ? `Podés operar y cobrar. La facturación electrónica todavía no está disponible en ${paisElegido.label}.`
                : 'Define tu moneda, tu huso horario y cómo se factura.'}
            >
              <div className="signup-select-wrap">
                <select
                  id="signup-country"
                  className="signup-control signup-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {PAISES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} — {p.currency}</option>
                  ))}
                </select>
              </div>
            </Campo>

            <Campo label="La dirección de tu local" htmlFor="signup-slug">
              <div className="signup-slug">
                <input
                  id="signup-slug"
                  className="signup-control"
                  value={slug}
                  onChange={(e) => { setSlugTocado(true); setSlug(slugify(e.target.value)); }}
                  placeholder="mi-negocio"
                  maxLength={40}
                  spellCheck={false}
                />
                <span>.divianco.app</span>
              </div>
              <div className="signup-validation" aria-live="polite">
                {slug && !validacionLocal.ok && (
                  <span className="is-error">{validacionLocal.reason}</span>
                )}
                {validacionLocal.ok && dispo === 'checking' && <span>Verificando…</span>}
                {validacionLocal.ok && dispo === true && (
                  <span className="is-success">✓ {slug}.divianco.app está libre</span>
                )}
                {validacionLocal.ok && dispo === false && (
                  <span className="is-error">Esa dirección ya está ocupada</span>
                )}
                {validacionLocal.ok && dispo === null && (
                  <span>No pudimos verificar la disponibilidad</span>
                )}
              </div>
            </Campo>
          </section>

          <section className="signup-card" aria-labelledby="signup-access-heading">
            <header className="signup-card__heading">
              <span>02</span>
              <h3 id="signup-access-heading">Tu acceso</h3>
            </header>
            <div className="signup-access-grid">
              <Campo label="Tu email" htmlFor="signup-email">
                <input
                  id="signup-email"
                  className="signup-control"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vos@ejemplo.com"
                />
              </Campo>

              <Campo label="Contraseña" htmlFor="signup-password" hint="Mínimo 8 caracteres.">
                <input
                  id="signup-password"
                  className="signup-control"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Campo>
            </div>
          </section>

          {error && <div className="signup-error" role="alert">{error}</div>}

          <button
            className="signup-submit"
            type="submit"
            disabled={!puedeEnviar}
            aria-busy={enviando}
          >
            <span>{enviando ? 'Creando…' : 'Crear mi negocio'}</span>
            <span aria-hidden="true">→</span>
          </button>

          <p className="signup-legal">
            Te vamos a pedir que confirmes el email antes de activar el local.
          </p>
          <p className="signup-login">¿Ya tenés cuenta? <a href="/entrar">Entrar</a></p>
        </form>
      </section>
    </main>
  );
}
