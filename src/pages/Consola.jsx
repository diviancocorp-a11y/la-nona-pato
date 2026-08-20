/**
 * Consola — el panel de Divianco, no el de un negocio.
 *
 * QUE ES Y QUE NO ES
 * `PlatformAdmin` es el panel de UN negocio: productos, pedidos, caja. Esto es
 * la otra punta: la lista de clientes de Dico y los precios que se les cobra.
 * Son dos productos distintos con dos audiencias distintas, y por eso es una
 * ruta aparte y no una pestaña más — meterla adentro del panel del negocio
 * habría hecho que un dueño vea, aunque sea escondida, la pantalla que le pone
 * precio a su propia suscripción.
 *
 * SOLO EN LA RAIZ Y SOLO PARA EL STAFF
 * Vive en `divianco.app/consola`. Se pide `soyStaffDivianco()` antes de
 * dibujar nada, pero eso es la puerta, no la cerradura: lo que de verdad
 * protege es la policy `plans_write` (0052). Si alguien llega igual, ve la
 * pantalla y no puede guardar.
 *
 * LOS PRECIOS SE EDITAN, LO QUE INCLUYE EL PLAN NO
 * Acá se cambian importes y promos. Qué módulos trae cada plan vive en
 * `src/modules/planes.js` y se cambia con un deploy: es producto, no un número.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  fetchPlanes, guardarPlan, soyStaffDivianco, fetchNegocios, actualizarSuscripcion,
  entrarAConsola, salirDeConsola, fetchStaff, sumarStaff, quitarStaff,
} from '../services/platformPlanes';
import { PLANES, cronogramaDeAlta, totalPrimerAnio } from '../modules/planes';

const C = {
  bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e',
  tx: '#f5f5f4', t2: '#a1a1aa', t3: '#71717a', ac: '#e8b947',
  ok: '#4ade80', warn: '#fbbf24', bad: '#f87171',
};

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;

const input = {
  width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 14,
  background: '#0f0f10', border: `1px solid ${C.line}`, color: C.tx,
  boxSizing: 'border-box', font: 'inherit',
};

const label = { display: 'block', fontSize: 12, color: C.t2, marginBottom: 5 };

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={label}>{etiqueta}</span>
      {children}
      {ayuda && (
        <span style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: C.t3 }}>
          {ayuda}
        </span>
      )}
    </label>
  );
}

/* ───────────────────────── Un plan ───────────────────────── */

function PlanCard({ plan, onGuardar, guardando }) {
  const [b, setB] = useState(plan);
  const [sucio, setSucio] = useState(false);

  useEffect(() => { setB(plan); setSucio(false); }, [plan]);

  const set = (k, v) => { setB(p => ({ ...p, [k]: v })); setSucio(true); };

  const def = PLANES[plan.id];
  const anual = Number(b.precio_anual_por_mes) || 0;
  const mensual = Number(b.precio_mensual) || 0;
  // El descuento anual se muestra calculado y no se pide: pedirlo dos veces es
  // pedir que un dia no coincidan.
  const dtoAnual = mensual > 0 && anual > 0
    ? Math.round((1 - anual / mensual) * 100) : 0;

  const primerAnio = totalPrimerAnio(b);
  const sinPromo = mensual * 12;

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
      padding: 16, display: 'grid', gap: 13,
      opacity: b.disponible ? 1 : 0.72,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 16, color: C.tx, flex: 1 }}>{b.nombre}</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t2 }}>
          <input
            type="checkbox" checked={!!b.disponible}
            onChange={(e) => set('disponible', e.target.checked)}
          />
          A la venta
        </label>
      </div>

      {def?.pendiente?.length > 0 && (
        <div style={{
          fontSize: 12, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(251,191,36,0.10)', color: C.warn,
        }}>
          Falta construir: {def.pendiente.join(', ')}. Ponerlo a la venta antes
          es prometer algo que todavía no existe.
        </div>
      )}

      <Campo etiqueta="Descripción">
        <input style={input} value={b.descripcion || ''}
          onChange={(e) => set('descripcion', e.target.value)} />
      </Campo>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Campo etiqueta="Precio mensual">
          <input style={input} inputMode="numeric" value={b.precio_mensual ?? ''}
            onChange={(e) => set('precio_mensual', e.target.value.replace(/[^\d.]/g, ''))} />
        </Campo>
        <Campo
          etiqueta="Anual (por mes)"
          ayuda={dtoAnual > 0 ? `${dtoAnual}% de descuento` : 'Sin descuento anual'}
        >
          <input style={input} inputMode="numeric" value={b.precio_anual_por_mes ?? ''}
            onChange={(e) => set('precio_anual_por_mes', e.target.value.replace(/[^\d.]/g, ''))} />
        </Campo>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Campo etiqueta="Meses gratis">
          <input style={input} inputMode="numeric" value={b.meses_gratis ?? 0}
            onChange={(e) => set('meses_gratis', e.target.value.replace(/[^\d]/g, ''))} />
        </Campo>
        <Campo etiqueta="Meses con dto.">
          <input style={input} inputMode="numeric" value={b.meses_descuento ?? 0}
            onChange={(e) => set('meses_descuento', e.target.value.replace(/[^\d]/g, ''))} />
        </Campo>
        <Campo etiqueta="% de dto.">
          <input style={input} inputMode="numeric" value={b.descuento_pct ?? 0}
            onChange={(e) => set('descuento_pct', e.target.value.replace(/[^\d.]/g, ''))} />
        </Campo>
      </div>

      {/* Lo que de verdad va a pasar con esos numeros, mes a mes. Sin esto una
          promo se define a ciegas y se descubre lo que costo recien al cobrar. */}
      <div style={{
        background: '#0f0f10', border: `1px solid ${C.line}`, borderRadius: 9,
        padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 7 }}>
          Los primeros 12 meses con esta promo
        </div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {cronogramaDeAlta(b, 12).map(f => (
            <div
              key={f.mes}
              title={`Mes ${f.mes}: ${money(f.importe)}${f.nota ? ` (${f.nota})` : ''}`}
              style={{
                flex: '1 1 22px', minWidth: 22, height: 30, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9.5, fontWeight: 700,
                background: f.importe === 0
                  ? 'rgba(74,222,128,0.16)'
                  : f.nota ? 'rgba(232,185,71,0.16)' : C.line,
                color: f.importe === 0 ? C.ok : f.nota ? C.ac : C.t2,
              }}
            >
              {f.importe === 0 ? '—' : Math.round(f.importe / 1000) + 'k'}
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 9, display: 'flex', justifyContent: 'space-between',
          fontSize: 12.5, color: C.t2,
        }}>
          <span>Primer año</span>
          <span style={{ color: C.tx, fontWeight: 700 }}>
            {money(primerAnio)}
            {sinPromo > primerAnio && (
              <span style={{ color: C.t3, fontWeight: 400 }}>
                {' '}· resignás {money(sinPromo - primerAnio)}
              </span>
            )}
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={!sucio || guardando}
        onClick={() => onGuardar(b)}
        style={{
          padding: '10px', borderRadius: 9, border: 'none', font: 'inherit',
          fontSize: 14, fontWeight: 700,
          cursor: sucio ? 'pointer' : 'not-allowed',
          opacity: sucio ? 1 : 0.4,
          background: C.ac, color: '#111',
        }}
      >
        {guardando ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Sin cambios'}
      </button>
    </div>
  );
}

/* ─────────────────────── Los negocios ─────────────────────── */

const ESTADO = {
  trial: { txt: 'Probando', color: C.t2 },
  active: { txt: 'Al día', color: C.ok },
  suspendido: { txt: 'Suspendido', color: C.bad },
  dormant: { txt: 'Dormido', color: C.t3 },
};

function FilaNegocio({ n, planes, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [b, setB] = useState(n);
  useEffect(() => { setB(n); }, [n]);

  const e = ESTADO[b.status] || ESTADO.trial;
  const vence = b.paga_hasta ? new Date(b.paga_hasta) : null;
  const diasRestantes = vence
    ? Math.ceil((vence - new Date()) / 86400000) : null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10 }}>
      <button
        type="button" onClick={() => setAbierto(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 13px', background: 'none', border: 0, cursor: 'pointer',
          font: 'inherit', color: C.tx, textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14 }}>{b.name}</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>
            {b.slug}.divianco.app · {b.vertical}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12.5, color: C.t2 }}>
            {planes.find(p => p.id === b.plan_id)?.nombre || 'sin plan'}
          </div>
          <div style={{ fontSize: 11.5, color: e.color, marginTop: 2 }}>
            {e.txt}
            {diasRestantes !== null && b.status !== 'suspendido' && (
              <> · {diasRestantes >= 0 ? `${diasRestantes}d` : `${-diasRestantes}d vencido`}</>
            )}
          </div>
        </div>
      </button>

      {abierto && (
        <div style={{
          padding: '0 13px 13px', display: 'grid', gap: 10,
          borderTop: `1px solid ${C.line}`, paddingTop: 12,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo etiqueta="Plan">
              <select style={input} value={b.plan_id || ''}
                onChange={(ev) => setB(p => ({ ...p, plan_id: ev.target.value }))}>
                <option value="">— sin plan —</option>
                {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Ciclo">
              <select style={input} value={b.ciclo || 'mensual'}
                onChange={(ev) => setB(p => ({ ...p, ciclo: ev.target.value }))}>
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select>
            </Campo>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Campo
              etiqueta="Pago hasta"
              ayuda="Moverlo hacia adelante lo saca de suspendido."
            >
              <input
                style={input} type="date"
                value={b.paga_hasta ? String(b.paga_hasta).slice(0, 10) : ''}
                onChange={(ev) => setB(p => ({ ...p, paga_hasta: ev.target.value }))}
              />
            </Campo>
            <Campo etiqueta="Cómo paga">
              <select style={input} value={b.medio_de_cobro || ''}
                onChange={(ev) => setB(p => ({ ...p, medio_de_cobro: ev.target.value }))}>
                <option value="">— sin definir —</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
              </select>
            </Campo>
          </div>

          <button
            type="button" onClick={() => onGuardar(b)}
            style={{
              padding: '9px', borderRadius: 8, border: `1px solid ${C.ac}`,
              background: 'transparent', color: C.ac, font: 'inherit',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Guardar suscripción
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Entrar ─────────────────────────── */

/**
 * El login de la consola.
 *
 * Es propio y no reusa `/entrar` porque aquel, al terminar, manda al negocio de
 * la persona: para quien viene a administrar la plataforma eso es salir de
 * donde queria entrar. Y la sesion de Supabase se guarda POR ORIGEN, asi que la
 * que se abre en el subdominio de un negocio no sirve acá.
 */
function Entrar({ onEntro }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async (ev) => {
    ev.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(null);
    const r = await entrarAConsola(email, password);
    setEnviando(false);
    if (r.__error) { setError(r.message); return; }
    onEntro();
  };

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.tx,
      display: 'grid', placeItems: 'center', padding: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <form onSubmit={enviar} style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 14 }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>
            Consola <span style={{ color: C.t3, fontWeight: 400 }}>· Divianco</span>
          </div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 5 }}>
            Para el equipo. Si tenés un negocio, entrá por tu panel.
          </div>
        </div>

        <Campo etiqueta="Email">
          <input
            style={input} type="email" value={email} autoFocus autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} placeholder="vos@divianco.com"
          />
        </Campo>

        <Campo etiqueta="Contraseña">
          <input
            style={input} type="password" value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
          />
        </Campo>

        {error && (
          <div style={{ fontSize: 13, color: C.bad }}>{error}</div>
        )}

        <button
          type="submit" disabled={enviando || !email || !password}
          style={{
            padding: '11px', borderRadius: 9, border: 'none', font: 'inherit',
            fontSize: 15, fontWeight: 700,
            cursor: enviando ? 'wait' : 'pointer',
            opacity: (!email || !password) ? 0.5 : 1,
            background: C.ac, color: '#111',
          }}
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>

        <a href="/entrar" style={{ color: C.t3, fontSize: 12.5, textAlign: 'center' }}>
          ¿Olvidaste tu contraseña?
        </a>
      </form>
    </main>
  );
}

/* ──────────────────────── El equipo ──────────────────────── */

function Equipo({ staff, onSumar, onQuitar }) {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>
        Quién puede entrar a la consola y tocar precios y suscripciones. No es
        lo mismo que ser dueño de un negocio.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {staff.map(s => (
          <div key={s.user_id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 10, padding: '11px 13px',
          }}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{s.email || s.user_id}</span>
            <button
              type="button" onClick={() => onQuitar(s)}
              style={{
                border: `1px solid ${C.line}`, background: 'transparent',
                color: C.t2, borderRadius: 7, padding: '4px 10px',
                font: 'inherit', fontSize: 12, cursor: 'pointer',
              }}
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div style={{
        background: C.card, border: `1px solid ${C.line}`,
        borderRadius: 10, padding: 13, display: 'grid', gap: 10,
      }}>
        <Campo
          etiqueta="Sumar a alguien del equipo"
          ayuda="Le llega un mail para que elija su contraseña. No se registra en
                 divianco.app: eso le crearía un negocio que no necesita."
        >
          <input
            style={input} type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="empleado@divianco.com"
          />
        </Campo>
        <button
          type="button"
          disabled={!email.trim() || enviando}
          onClick={async () => {
            setEnviando(true);
            await onSumar(email.trim());
            setEnviando(false);
            setEmail('');
          }}
          style={{
            padding: '9px', borderRadius: 8, border: 'none', font: 'inherit',
            fontSize: 13.5, fontWeight: 700,
            cursor: email.trim() ? 'pointer' : 'not-allowed',
            opacity: email.trim() ? 1 : 0.45,
            background: C.ac, color: '#111',
          }}
        >
          {enviando ? 'Sumando…' : 'Dar acceso'}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────── La consola ────────────────────────── */

export default function Consola() {
  const [staff, setStaff] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [negocios, setNegocios] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [tab, setTab] = useState('planes');

  useEffect(() => { document.title = 'Consola — Divianco'; }, []);

  const cargar = useCallback(async () => {
    const esStaff = await soyStaffDivianco();
    setStaff(esStaff);
    if (!esStaff) return;
    const [ps, ns, eq] = await Promise.all([fetchPlanes(), fetchNegocios(), fetchStaff()]);
    setPlanes(ps);
    setNegocios(ns);
    setEquipo(eq);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const onGuardarPlan = useCallback(async (borrador) => {
    setGuardando(true);
    const r = await guardarPlan(borrador.id, borrador);
    setGuardando(false);
    setAviso(r.__error ? r.message : `${borrador.nombre}: guardado`);
    if (!r.__error) setPlanes(ps => ps.map(p => (p.id === r.plan.id ? r.plan : p)));
  }, []);

  const onGuardarNegocio = useCallback(async (b) => {
    const r = await actualizarSuscripcion(b.id, b);
    setAviso(r.__error ? r.message : `${b.name}: suscripción actualizada`);
    if (!r.__error) {
      setNegocios(ns => ns.map(n => (n.id === b.id ? { ...n, ...r.negocio } : n)));
    }
  }, []);

  if (staff === null) {
    return (
      <main style={{ minHeight: '100vh', background: C.bg, color: C.t2, padding: 40 }}>
        Cargando…
      </main>
    );
  }

  // Sin sesion de staff se muestra el login y no un cartel de "no tenés
  // acceso": la sesion de Supabase es POR ORIGEN, asi que quien ya entro en el
  // subdominio de su negocio llega acá como anonimo. Decirle que no tiene
  // permiso cuando lo que le falta es entrar es mandarlo a buscar un problema
  // que no existe.
  if (!staff) return <Entrar onEntro={cargar} />;

  const suspendidos = negocios.filter(n => n.status === 'suspendido').length;
  const porVencer = negocios.filter(n => {
    if (!n.paga_hasta || n.status === 'suspendido') return false;
    const d = Math.ceil((new Date(n.paga_hasta) - new Date()) / 86400000);
    return d <= 7;
  }).length;

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.tx,
      fontFamily: "'DM Sans', system-ui, sans-serif", padding: '20px 16px 60px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 20, margin: 0, letterSpacing: '-0.01em' }}>
            Consola <span style={{ color: C.t3, fontWeight: 400 }}>· Divianco</span>
          </h1>
          <p style={{ fontSize: 13, color: C.t3, margin: '6px 0 0' }}>
            {negocios.length} negocios · {suspendidos} suspendidos · {porVencer} vencen esta semana
          </p>
        </header>

        <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['planes', 'Planes y precios'], ['negocios', 'Negocios'], ['equipo', 'Equipo']].map(([id, txt]) => (
            <button
              key={id} type="button" onClick={() => setTab(id)}
              style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                font: 'inherit', fontSize: 13,
                border: `1px solid ${tab === id ? C.ac : C.line}`,
                background: tab === id ? C.ac : 'transparent',
                color: tab === id ? '#111' : C.t2,
                fontWeight: tab === id ? 700 : 400,
              }}
            >
              {txt}
            </button>
          ))}
          <button
            type="button"
            onClick={async () => {
              // El estado se baja SIEMPRE, falle o no el signOut: si dependiera
              // de que la llamada salga bien, un error de red te deja sin poder
              // salir de la consola.
              try { await salirDeConsola(); } catch { /* empty */ }
              setStaff(false);
            }}
            style={{
              marginLeft: 'auto', padding: '7px 12px', borderRadius: 999,
              border: `1px solid ${C.line}`, background: 'transparent',
              color: C.t3, font: 'inherit', fontSize: 12.5, cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </nav>

        {aviso && (
          <div style={{
            padding: '9px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13,
            background: 'rgba(232,185,71,0.10)', color: C.ac,
          }}>
            {aviso}
          </div>
        )}

        {tab === 'planes' && (
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          }}>
            {planes.map(p => (
              <PlanCard key={p.id} plan={p} onGuardar={onGuardarPlan} guardando={guardando} />
            ))}
          </div>
        )}

        {tab === 'negocios' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {negocios.map(n => (
              <FilaNegocio key={n.id} n={n} planes={planes} onGuardar={onGuardarNegocio} />
            ))}
          </div>
        )}

        {tab === 'equipo' && (
          <Equipo
            staff={equipo}
            onSumar={async (email) => {
              const r = await sumarStaff(email);
              setAviso(r.__error ? r.message : `${email}: ${r.message}`);
              if (!r.__error) setEquipo(await fetchStaff());
            }}
            onQuitar={async (s2) => {
              const r = await quitarStaff(s2.user_id);
              setAviso(r.__error ? r.message : `${s2.email}: acceso quitado`);
              if (!r.__error) setEquipo(await fetchStaff());
            }}
          />
        )}
      </div>
    </main>
  );
}
