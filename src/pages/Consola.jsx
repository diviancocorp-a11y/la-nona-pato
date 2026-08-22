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
  soyDuenioDivianco, fijarPasswordConsola, resetearClaveDeStaff,
  fetchCorreosDeEquipo, crearCorreoDeEmpleado, reenviarConfirmacion,
  diagnosticoDeCloudflare,
} from '../services/platformPlanes';
import { supabase } from '../lib/supabase';
import { PLANES, cronogramaDeAlta, totalPrimerAnio } from '../modules/planes';
import {
  aliasDesde, aliasValido, estadoDelCorreo, TEXTO_DE_ESTADO,
} from '../modules/correoDeEquipo';
import {
  PUESTOS, PUESTO_POR_DEFECTO, seccionesDe, pantallaInicial, puedeEditar,
  etiquetaDePuesto,
} from '../modules/rolesDeConsola';
import { fetchMiLegajo, cambiarPuesto } from '../services/platformStaff';
import { MODALIDAD_POR_DEFECTO } from '../modules/legajo';
import LegajoDeStaff from '../components/admin/platform/LegajoDeStaff';

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

function PlanCard({ plan, onGuardar, guardando, soloLectura = false }) {
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

      {/* El boton no aparece para quien no edita. Dejarlo deshabilitado
          seria ofrecer algo que no existe: la policy `plans_write` (0054)
          filtra el update y no devuelve error, asi que "guardar" no fallaria
          — simplemente no pasaria nada. */}
      {soloLectura ? (
        <span style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '10px 0' }}>
          Los precios los edita un administrador.
        </span>
      ) : (
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
      )}
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

function FilaNegocio({ n, planes, onGuardar, soloLectura = false }) {
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

          {soloLectura ? (
            <span style={{ fontSize: 12, color: C.t3 }}>
              La suscripción la mueve ventas o un administrador.
            </span>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────── Elegir la contraseña ──────────────────── */

/**
 * Quien llega por el link de invitacion ya tiene sesion abierta: lo que le
 * falta es la clave. Sin esta pantalla el link dejaba a la persona adentro sin
 * forma de volver a entrar despues, que es como se ve un "acceso denegado" al
 * segundo intento.
 */
function ElegirClave({ onListo }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async (ev) => {
    ev.preventDefault();
    if (enviando) return;
    if (p1.length < 8) { setError('La contraseña necesita al menos 8 caracteres.'); return; }
    if (p1 !== p2) { setError('Las contraseñas no coinciden.'); return; }
    setEnviando(true); setError(null);
    const r = await fijarPasswordConsola(p1);
    setEnviando(false);
    if (r.__error) { setError(r.message); return; }
    // El hash del link no sirve mas: se limpia para que un F5 no reabra esto.
    window.history.replaceState(null, '', '/consola');
    onListo();
  };

  return (
    <main style={{
      minHeight: '100vh', background: C.bg, color: C.tx,
      display: 'grid', placeItems: 'center', padding: 24,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <form onSubmit={guardar} style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Elegí tu contraseña</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 5 }}>
            Es la que vas a usar para entrar a la consola.
          </div>
        </div>
        <Campo etiqueta="Contraseña">
          <input style={input} type="password" value={p1} autoFocus autoComplete="new-password"
            onChange={(e) => setP1(e.target.value)} placeholder="Mínimo 8 caracteres" />
        </Campo>
        <Campo etiqueta="Repetila">
          <input style={input} type="password" value={p2} autoComplete="new-password"
            onChange={(e) => setP2(e.target.value)} placeholder="••••••••" />
        </Campo>
        {error && <div style={{ fontSize: 13, color: C.bad }}>{error}</div>}
        <button type="submit" disabled={enviando}
          style={{
            padding: '11px', borderRadius: 9, border: 'none', font: 'inherit',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            background: C.ac, color: '#111',
          }}>
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </main>
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

        {/* NO hay "olvidé mi contraseña" acá, y es a proposito: ese link
            llevaba a `/entrar`, que es el login de los CLIENTES y termina
            resolviendo a que negocio mandarte. Un empleado no tiene negocio.
            Si se olvida la clave, se la pide al dueño, que se la resetea
            desde Equipo. */}
        <p style={{ color: C.t3, fontSize: 12, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
          ¿Olvidaste la contraseña? Pedile al dueño que te mande un link nuevo.
        </p>
      </form>
    </main>
  );
}

/* ──────────────────────── El equipo ──────────────────────── */

const botonChico = {
  border: `1px solid ${C.line}`, background: 'transparent',
  color: C.t2, borderRadius: 7, padding: '4px 10px',
  font: 'inherit', fontSize: 12, cursor: 'pointer',
};

/**
 * Alta de alguien del equipo: primero el correo, después el acceso.
 *
 * SON DOS PASOS PORQUE CLOUDFLARE LO IMPONE
 * El correo de trabajo es un alias que reenvía al correo personal, y
 * Cloudflare no deja apuntar un alias a un correo que su dueño no confirmó con
 * un clic. Eso no lo puede hacer ninguna API — es justamente la protección
 * contra desviarle el correo a un tercero.
 *
 * De ahí que la persona reciba DOS mails, y en este orden: el de Cloudflare
 * para confirmar, y recién después la invitación a la consola. Al revés no
 * funciona: la invitación llegaría a un alias que todavía no entrega nada, se
 * perdería en silencio y encima vence a las 24 horas.
 *
 * El botón de crear se puede apretar dos veces y hay que hacerlo. La llamada
 * es idempotente: la primera crea el destino, la segunda cierra el alta.
 */
function AltaDeEmpleado({ dominio, onCrearCorreo, onSumar }) {
  const [nombre, setNombre] = useState('');
  const [aliasEditado, setAliasEditado] = useState(null);
  const [personal, setPersonal] = useState('');
  const [paso, setPaso] = useState(null); // null | 'esperando' | 'listo'
  const [correo, setCorreo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // Cuando el alias no se pudo crear pero el alta sigue igual. Va pegado al
  // paso y no en el aviso de arriba, que se pisa con el mensaje siguiente:
  // esto tiene que seguir a la vista cuando se apriete "Dar acceso".
  const [aviso, setAvisoLocal] = useState(null);
  const [puestoElegido, setPuestoElegido] = useState(PUESTO_POR_DEFECTO);

  // El alias se sugiere desde el nombre, pero se puede pisar: hay apellidos
  // que no entran en la convención y nadie quiere pelearse con un campo.
  const alias = aliasEditado ?? aliasDesde(nombre);
  const puedeCrear = aliasValido(alias) && /\S+@\S+\.\S+/.test(personal);

  const limpiar = () => {
    setNombre(''); setAliasEditado(null); setPersonal('');
    setPaso(null); setCorreo(null); setAvisoLocal(null);
    setPuestoElegido(PUESTO_POR_DEFECTO);
  };

  const crear = async () => {
    setOcupado(true);
    const r = await onCrearCorreo({ alias, personal: personal.trim() });
    setOcupado(false);
    if (r.__error) return;
    setCorreo(r.email);
    setAvisoLocal(r.aviso || null);
    setPaso(r.paso === 'listo' ? 'listo' : 'esperando');
  };

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.line}`,
      borderRadius: 10, padding: 13, display: 'grid', gap: 11,
    }}>
      <strong style={{ fontSize: 13.5 }}>Dar de alta a alguien</strong>

      <Campo etiqueta="Nombre y apellido">
        <input
          style={input} value={nombre} disabled={paso !== null}
          onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez"
        />
      </Campo>

      {/* El puesto se elige ACA y no después: es lo que decide qué ve la
          persona cuando entra, y elegirlo al final invita a dejar el default
          puesto sin mirar. */}
      <Campo
        etiqueta="Qué va a hacer"
        ayuda={PUESTOS[puestoElegido]?.descripcion}
      >
        <select
          style={input} value={puestoElegido}
          onChange={(e) => setPuestoElegido(e.target.value)}
        >
          {Object.values(PUESTOS).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </Campo>

      <Campo
        etiqueta="Correo de trabajo"
        ayuda="No es una casilla: es un alias que reenvía. Se puede editar."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <input
            style={{ ...input, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            value={alias} disabled={paso !== null}
            onChange={(e) => setAliasEditado(aliasDesde(e.target.value))}
            placeholder="juan.perez"
          />
          <span style={{
            padding: '9px 10px', fontSize: 13, color: C.t3, whiteSpace: 'nowrap',
            border: `1px solid ${C.line}`, borderLeft: 'none',
            borderTopRightRadius: 8, borderBottomRightRadius: 8,
          }}>
            @{dominio || '…'}
          </span>
        </div>
      </Campo>

      <Campo
        etiqueta="Su correo personal"
        ayuda="A dónde se le reenvía. Le va a llegar un mail de Cloudflare para
               que lo confirme: hasta que no haga ese clic, el alias no recibe
               nada."
      >
        <input
          style={input} type="email" value={personal} disabled={paso !== null}
          onChange={(e) => setPersonal(e.target.value)} placeholder="juan@gmail.com"
        />
      </Campo>

      {paso === 'esperando' && (
        <div style={{
          fontSize: 12.5, padding: '9px 11px', borderRadius: 8, lineHeight: 1.5,
          background: 'rgba(251,191,36,0.10)', color: C.warn,
        }}>
          Le mandamos un mail a <strong>{personal}</strong> para que confirme el
          reenvío. Cuando lo haga, seguí desde acá — todavía no le mandes la
          invitación: hasta ese clic, {correo} no recibe nada.
        </div>
      )}

      {paso === 'listo' && !aviso && (
        <div style={{
          fontSize: 12.5, padding: '9px 11px', borderRadius: 8, lineHeight: 1.5,
          background: 'rgba(74,222,128,0.10)', color: C.ok,
        }}>
          <strong>{correo}</strong> ya reenvía a {personal}. Falta el acceso a la
          consola.
        </div>
      )}

      {paso === 'listo' && aviso && (
        <div style={{
          fontSize: 12.5, padding: '9px 11px', borderRadius: 8, lineHeight: 1.5,
          background: 'rgba(248,113,113,0.10)', color: C.bad,
        }}>
          {aviso}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {paso !== 'listo' && (
          <button
            type="button" disabled={!puedeCrear || ocupado}
            onClick={crear}
            style={{
              flex: 1, padding: '9px', borderRadius: 8, border: 'none', font: 'inherit',
              fontSize: 13.5, fontWeight: 700,
              cursor: puedeCrear && !ocupado ? 'pointer' : 'not-allowed',
              opacity: puedeCrear && !ocupado ? 1 : 0.45,
              background: C.ac, color: '#111',
            }}
          >
            {ocupado ? 'Creando…'
              : paso === 'esperando' ? 'Ya confirmó, seguir'
                : 'Crear el correo'}
          </button>
        )}

        {paso === 'listo' && (
          <button
            type="button" disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              const r = await onSumar(correo, puestoElegido);
              setOcupado(false);
              if (!r?.__error) limpiar();
            }}
            style={{
              flex: 1, padding: '9px', borderRadius: 8, border: 'none', font: 'inherit',
              fontSize: 13.5, fontWeight: 700, cursor: ocupado ? 'wait' : 'pointer',
              background: C.ac, color: '#111',
            }}
          >
            {ocupado ? 'Invitando…' : 'Dar acceso a la consola'}
          </button>
        )}

        {paso !== null && (
          <button type="button" onClick={limpiar} style={botonChico}>
            Empezar de nuevo
          </button>
        )}
      </div>
    </div>
  );
}

/** Una línea que dice si a esa persona le llega el correo, y por dónde. */
function EstadoDeCorreo({ email, correos, onReenviar }) {
  if (!correos) return null;
  const { estado, personal } = estadoDelCorreo(email, correos);
  const color = { listo: C.t3, sin_confirmar: C.warn, sin_correo: C.bad }[estado];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 11.5, color }}>
        {estado === 'listo' && personal ? `→ ${personal}` : TEXTO_DE_ESTADO[estado]}
      </span>
      {estado === 'sin_confirmar' && personal && (
        <button
          type="button" onClick={() => onReenviar(personal)}
          title="Le vuelve a mandar el mail de confirmación"
          style={{ ...botonChico, padding: '2px 7px', fontSize: 11 }}
        >
          Reenviar
        </button>
      )}
    </span>
  );
}

/**
 * Qué puede hacer el token de Cloudflare, medido y en pantalla.
 *
 * Existe porque el alta se cayó una vez con "Authentication error" a secas, y
 * ni el mensaje ni el código decían en cuál de las cinco llamadas. Adivinar
 * costó una vuelta entera; esto lo contesta en un clic.
 */
function Diagnostico({ onDiagnosticar }) {
  const [r, setR] = useState(null);
  const [corriendo, setCorriendo] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        type="button" disabled={corriendo}
        onClick={async () => {
          setCorriendo(true);
          setR(await onDiagnosticar());
          setCorriendo(false);
        }}
        style={{ ...botonChico, justifySelf: 'start' }}
      >
        {corriendo ? 'Probando…' : 'Probar el token de Cloudflare'}
      </button>

      {r && (
        <div style={{
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 10,
          padding: 12, display: 'grid', gap: 7, fontSize: 12.5, lineHeight: 1.5,
        }}>
          <strong style={{ color: r.__error ? C.bad : C.tx }}>
            {r.__error ? r.message : r.resumen}
          </strong>
          {(r.pasos || []).map((p) => (
            <div key={p.paso} style={{ color: p.ok ? C.t3 : C.bad }}>
              {p.ok ? '✓' : '✗'} {p.paso}
              {p.ok
                ? <span style={{ color: C.t3 }}> · {JSON.stringify(p.detalle)}</span>
                : <span> · {p.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Equipo({
  staff, correos, onSumar, onQuitar, onResetear, onCrearCorreo, onReenviar,
  onDiagnosticar, onCambiarPuesto, esDuenio,
}) {
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>
        Quién puede entrar a la consola y tocar precios y suscripciones. No es
        lo mismo que ser dueño de un negocio.
      </p>

      {!esDuenio && (
        <div style={{
          fontSize: 12.5, padding: '9px 11px', borderRadius: 8,
          background: 'rgba(251,191,36,0.10)', color: C.warn,
        }}>
          Sólo el dueño de la plataforma puede dar o quitar accesos.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {staff.map(s => (
          <div key={s.user_id} style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 10, padding: '11px 13px',
          }}>
            <span style={{ flex: 1, fontSize: 13.5, minWidth: 180 }}>
              {s.email || s.user_id}
              {s.rol === 'owner' && (
                <span style={{ color: C.ac, fontSize: 11.5 }}> · dueño</span>
              )}
              <br />
              <EstadoDeCorreo email={s.email} correos={correos} onReenviar={onReenviar} />
            </span>

            {/* El puesto se cambia sin reinvitar: cambiar de área es normal y
                no tiene por qué costarle a nadie una contraseña nueva. */}
            {esDuenio && s.rol !== 'owner' ? (
              <select
                value={s.puesto || PUESTO_POR_DEFECTO}
                onChange={(e) => onCambiarPuesto(s, e.target.value)}
                style={{
                  ...input, width: 'auto', fontSize: 12, padding: '5px 8px',
                }}
              >
                {Object.values(PUESTOS).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 12, color: C.t3 }}>
                {etiquetaDePuesto(s.puesto)}
              </span>
            )}
            {esDuenio && s.rol !== 'owner' && (
            <button
              type="button" onClick={() => onResetear(s)}
              title="Le manda un mail para que elija una contraseña nueva"
              style={botonChico}
            >
              Nueva clave
            </button>
            )}
            {esDuenio && s.rol !== 'owner' && (
            <button type="button" onClick={() => onQuitar(s)} style={botonChico}>
              Quitar
            </button>
            )}
          </div>
        ))}
      </div>

      {esDuenio && (
        <AltaDeEmpleado
          dominio={correos?.dominio}
          onCrearCorreo={onCrearCorreo}
          onSumar={onSumar}
        />
      )}

      {esDuenio && <Diagnostico onDiagnosticar={onDiagnosticar} />}
    </div>
  );
}

/* ────────────────────────── La consola ────────────────────────── */

/**
 * El estado del correo del equipo, o null si no se pudo leer.
 *
 * Se traga el error a propósito: que Cloudflare no conteste no puede dejar sin
 * pantalla de equipo. El alta sí avisa, porque ahí el error es el resultado.
 */
async function recargarCorreos() {
  const r = await fetchCorreosDeEquipo();
  return r.__error ? null : r;
}

export default function Consola() {
  const [staff, setStaff] = useState(null);
  const [duenio, setDuenio] = useState(false);
  const [equipo, setEquipo] = useState([]);
  // Quien llega por el link de invitacion o de recuperacion ya tiene sesion;
  // lo que le falta es la clave. Se lee el hash en el primer render porque
  // Supabase lo procesa y lo limpia apenas puede.
  const [eligiendoClave, setEligiendoClave] = useState(() => {
    try {
      const h = window.location.hash || '';
      return h.includes('type=invite') || h.includes('type=recovery');
    } catch { return false; }
  });
  const [planes, setPlanes] = useState([]);
  const [negocios, setNegocios] = useState([]);
  // El correo del equipo sale de Cloudflare, no de nuestra base. Queda en null
  // si no se pudo leer: la pantalla del equipo tiene que seguir andando aunque
  // Cloudflare este caido o al token le falte un permiso — lo que se pierde es
  // el cartelito de estado, no la posibilidad de sacarle el acceso a alguien.
  const [correos, setCorreos] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  // Arranca en null y lo decide el PUESTO: fijarlo en 'planes' mandaba a
  // marketing a una pestaña que igual puede ver, pero a ventas y a soporte los
  // dejaba mirando precios en vez de su lista de clientes.
  const [tab, setTab] = useState(null);
  const [puesto, setPuesto] = useState(PUESTO_POR_DEFECTO);
  // `null` = todavía no se sabe. Distinto de `false` (falta completarlo): con
  // `false` se muestra el legajo, con `null` no se muestra nada todavía.
  const [legajoListo, setLegajoListo] = useState(null);
  const [miEmail, setMiEmail] = useState('');
  const [modalidad, setModalidad] = useState(MODALIDAD_POR_DEFECTO);
  // El duenio puede abrir su legajo a mano; no se lo pide la pantalla.
  const [legajoAMano, setLegajoAMano] = useState(false);

  useEffect(() => { document.title = 'Consola — Divianco'; }, []);

  const cargar = useCallback(async () => {
    const esStaff = await soyStaffDivianco();
    setStaff(esStaff);
    if (!esStaff) return;
    const esDuenio = await soyDuenioDivianco();
    setDuenio(esDuenio);
    const [ps, ns, eq, legajo] = await Promise.all([
      fetchPlanes(), fetchNegocios(), fetchStaff(), fetchMiLegajo(),
    ]);
    setPlanes(ps);
    setNegocios(ns);
    setEquipo(eq);

    // Quién soy YO en esta lista: el puesto sale de la misma consulta que ya
    // se hacía, sin una llamada extra.
    const { data: sesion } = await supabase.auth.getSession();
    const yo = eq.find((s2) => s2.user_id === sesion?.session?.user?.id);
    const miPuesto = yo?.puesto || PUESTO_POR_DEFECTO;
    setPuesto(miPuesto);
    setMiEmail(yo?.email || sesion?.session?.user?.email || '');
    setModalidad(yo?.modalidad || MODALIDAD_POR_DEFECTO);
    // Quien manda es `completado_at`, que lo sella el servidor. El navegador
    // no puede declararse completo.
    //
    // Al DUENIO no se le exige: si el legajo lo bloqueara y algo fallara
    // subiendo el documento, el unico que puede administrar accesos quedaria
    // afuera y no habria quien lo destrabe. Mismo criterio que 0053 con "al
    // duenio no se lo puede quitar". Lo carga cuando quiere, desde el link.
    setLegajoListo(esDuenio || !!legajo?.completado_at);
    setTab((t) => t || pantallaInicial(miPuesto, { esDuenio }));
    // Sólo el dueño: la edge function le contesta 403 a un staff, y pedir algo
    // que sabés que va a fallar es ensuciar la consola del navegador.
    if (esDuenio) setCorreos(await recargarCorreos());
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Leer el hash es ganarle una carrera al cliente de Supabase, que lo limpia
  // apenas puede. Estos eventos son los que emite para cada caso y no dependen
  // de que el hash siga ahi. Es el mismo arreglo que se hizo en `/entrar`.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY' || evento === 'USER_UPDATED') return;
      if (evento === 'SIGNED_IN' && (window.location.hash || '').includes('type=invite')) {
        setEligiendoClave(true);
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

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
  // El orden importa: primero la clave, despues el permiso. Quien viene del
  // link YA es staff (lo sumo el duenio antes de invitarlo); pedirle que
  // "entre" antes de tener contraseña es pedirle algo que no puede hacer.
  if (eligiendoClave) {
    return <ElegirClave onListo={() => { setEligiendoClave(false); cargar(); }} />;
  }

  if (!staff) return <Entrar onEntro={cargar} />;

  // El legajo va DESPUES del permiso y ANTES de la consola. Ese orden es el
  // que pidio el flujo: primero se sabe que la persona entra, despues se le
  // piden los datos con los que se le paga. Se muestra mientras `legajoListo`
  // sea false; en `null` todavia no se sabe y no se muestra nada.
  if (legajoListo === false || legajoAMano) {
    return (
      <LegajoDeStaff
        email={miEmail}
        puesto={etiquetaDePuesto(puesto)}
        modalidad={modalidad}
        onListo={() => { setLegajoListo(true); setLegajoAMano(false); cargar(); }}
        onSalir={legajoAMano
          ? () => setLegajoAMano(false)
          : async () => {
            try { await salirDeConsola(); } catch { /* empty */ }
            setStaff(false);
            setLegajoListo(null);
          }}
      />
    );
  }

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
            {etiquetaDePuesto(puesto)}{duenio && ' · dueño'}
            {' — '}
            {negocios.length} negocios · {suspendidos} suspendidos · {porVencer} vencen esta semana
          </p>
        </header>

        <nav style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {seccionesDe(puesto, { esDuenio: duenio }).map(({ id, label: txt }) => (
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
            type="button" onClick={() => setLegajoAMano(true)}
            style={{
              marginLeft: 'auto', padding: '7px 12px', borderRadius: 999,
              border: `1px solid ${C.line}`, background: 'transparent',
              color: C.t3, font: 'inherit', fontSize: 12.5, cursor: 'pointer',
            }}
          >
            Mis datos
          </button>
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
              padding: '7px 12px', borderRadius: 999,
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
              <PlanCard
                key={p.id} plan={p} onGuardar={onGuardarPlan} guardando={guardando}
                soloLectura={!puedeEditar(puesto, 'planes')}
              />
            ))}
          </div>
        )}

        {tab === 'negocios' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {negocios.map(n => (
              <FilaNegocio
                key={n.id} n={n} planes={planes} onGuardar={onGuardarNegocio}
                soloLectura={!puedeEditar(puesto, 'negocios')}
              />
            ))}
          </div>
        )}

        {tab === 'equipo' && (
          <Equipo
            staff={equipo}
            correos={correos}
            esDuenio={duenio}
            onSumar={async (email, puestoNuevo) => {
              const r = await sumarStaff(email, puestoNuevo);
              setAviso(r.__error ? r.message : [`${email}: ${r.message}`, r.aviso].filter(Boolean).join(' '));
              if (!r.__error) setEquipo(await fetchStaff());
              return r;
            }}
            onCrearCorreo={async (datos) => {
              const r = await crearCorreoDeEmpleado(datos);
              setAviso(r.__error ? r.message : [r.message, r.aviso].filter(Boolean).join(' '));
              // Se relee siempre: si la llamada creó el destino, la lista de
              // la izquierda ya tiene que reflejarlo.
              setCorreos(await recargarCorreos());
              return r;
            }}
            onReenviar={async (personal) => {
              const r = await reenviarConfirmacion(personal);
              setAviso(r.__error ? r.message : r.message);
              setCorreos(await recargarCorreos());
            }}
            onDiagnosticar={diagnosticoDeCloudflare}
            onCambiarPuesto={async (s2, puestoNuevo) => {
              const r = await cambiarPuesto(s2.user_id, puestoNuevo);
              setAviso(r.__error ? r.message
                : `${s2.email}: ahora es ${etiquetaDePuesto(puestoNuevo)}`);
              if (!r.__error) setEquipo(await fetchStaff());
            }}
            onResetear={async (s2) => {
              const r = await resetearClaveDeStaff(s2.email);
              setAviso(r.__error ? r.message : `${s2.email}: ${r.message}`);
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
