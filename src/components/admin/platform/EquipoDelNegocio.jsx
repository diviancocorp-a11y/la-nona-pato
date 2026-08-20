/**
 * EquipoDelNegocio — quien entra al panel y con que permisos (Etapa 6f).
 *
 * POR QUE NO SE REUSA `Users` DEL LEGACY
 * Alla el rol es UNO y global: owner o staff. Aca una persona tiene varios
 * roles y puede tenerlos acotados a una sucursal. Meter ese modelo en la
 * pantalla vieja la habria llenado de ramas para sostener dos formas distintas
 * del mismo dato, y el legacy esta en produccion con tres negocios andando.
 *
 * LOS PERMISOS SE ELIGEN POR LO QUE LA PERSONA HACE
 * No hay una grilla de checkboxes por pantalla. Se elige "Cajero" y el sistema
 * sabe que ve un cajero, porque eso vive en el registry y no en una tabla que
 * el usuario edita. Cuando alguien pida permisos a medida se hara la tabla;
 * hasta entonces, esto se entiende sin leer un manual.
 *
 * EL NEGOCIO NO SE PUEDE QUEDAR SIN DUENIO
 * La edge function lo impide del lado del servidor. Aca ademas se dice ANTES
 * de intentarlo, porque un boton que falla siempre es peor que uno que explica.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listAdminUsers, addMember, setMemberRoles, removeAdminUser,
} from '../../../services/adminUsers';
import { ROLES, rolesAsignables, etiquetaDeRol } from '../../../modules/roles';

const card = {
  background: 'var(--ag-bg-card)', border: '1px solid var(--ag-line)',
  borderRadius: 12, padding: '13px 15px',
};

const campo = {
  width: '100%', padding: '11px 13px', borderRadius: 9, fontSize: 15,
  background: 'var(--ag-surface-2, rgba(0,0,0,0.04))',
  border: '1px solid var(--ag-line)', color: 'inherit',
  boxSizing: 'border-box', font: 'inherit',
};

function Pastilla({ rol, activo, onClick, terminos, bloqueado, motivo }) {
  return (
    <button
      type="button"
      onClick={bloqueado ? undefined : onClick}
      aria-pressed={activo}
      aria-disabled={bloqueado || undefined}
      title={motivo || ROLES[rol]?.descripcion}
      style={{
        padding: '7px 13px', borderRadius: 999,
        // Un boton que no responde y no explica por que se siente roto. Este
        // se ve fijo a proposito y dice el motivo al tocarlo.
        cursor: bloqueado ? 'not-allowed' : 'pointer',
        font: 'inherit', fontSize: 13, fontWeight: activo ? 650 : 400,
        border: activo ? '1px solid transparent' : '1px solid var(--ag-line)',
        background: activo ? 'var(--ag-ink)' : 'transparent',
        color: activo ? 'var(--ag-bg-card)' : 'inherit',
        opacity: bloqueado ? 0.7 : 1,
      }}
    >
      {etiquetaDeRol(rol, terminos)}
      {bloqueado && <span aria-hidden="true"> 🔒</span>}
    </button>
  );
}

export default function EquipoDelNegocio({
  vertical,
  modo,
  terminos,
  sucursales = [],
  currentUserId,
  showToast,
  onBack,
}) {
  const [miembros, setMiembros] = useState(null);
  const [abriendoAlta, setAbriendoAlta] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rolesNuevos, setRolesNuevos] = useState(['attendant']);
  const [sucursalNueva, setSucursalNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null);

  const asignables = useMemo(
    () => rolesAsignables(vertical, modo).map(r => r.id), [vertical, modo]);

  const cargar = useCallback(async () => {
    const r = await listAdminUsers();
    if (!r.ok) { showToast?.(r.error || 'No se pudo cargar el equipo'); return; }
    setMiembros(r.users || []);
  }, [showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  const duenios = (miembros || []).filter(m => (m.roles || []).includes('owner'));
  const esUltimoDuenio = (m) => duenios.length === 1 && duenios[0].user_id === m.user_id;

  const alternar = (lista, rol, set) => {
    const tiene = lista.includes(rol);
    const siguiente = tiene ? lista.filter(r => r !== rol) : [...lista, rol];
    // Alguien sin ningun rol no podria entrar a ningun lado: se deja al menos uno.
    if (siguiente.length) set(siguiente);
  };

  const sumar = async () => {
    if (!email.trim()) return;
    setGuardando(true);
    const r = await addMember(
      email.trim(), password, rolesNuevos, sucursalNueva || null,
    );
    setGuardando(false);
    if (!r.ok) { showToast?.(r.error || 'No se pudo sumar'); return; }
    showToast?.(r.reused
      ? 'Ya tenía cuenta: entra con la contraseña que ya usaba.'
      : 'Listo, ya puede entrar');
    setEmail(''); setPassword(''); setRolesNuevos(['attendant']);
    setSucursalNueva(''); setAbriendoAlta(false);
    cargar();
  };

  const guardarRoles = async (m, roles) => {
    const r = await setMemberRoles(m.user_id, roles);
    if (!r.ok) { showToast?.(r.error || 'No se pudo guardar'); return; }
    showToast?.('Permisos actualizados');
    setEditando(null);
    cargar();
  };

  const quitar = async (m) => {
    const r = await removeAdminUser(m.user_id);
    if (!r.ok) { showToast?.(r.error || 'No se pudo quitar'); return; }
    showToast?.('Ya no tiene acceso');
    cargar();
  };

  return (
    <div style={{ padding: '12px 16px 24px', position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {onBack && (
          <button
            type="button" onClick={onBack} aria-label="Volver"
            style={{
              border: 'none', background: 'transparent', font: 'inherit',
              fontSize: 20, cursor: 'pointer', color: 'inherit', padding: 0,
            }}
          >
            {'‹'}
          </button>
        )}
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif", fontWeight: 800, fontSize: 18,
          margin: 0, color: 'var(--ag-ink)', letterSpacing: '-0.01em',
        }}>Equipo</h2>
      </div>

      <p style={{ fontSize: 13, color: 'var(--ag-ink-3)', margin: '0 0 14px' }}>
        Cada persona ve sólo lo que su rol necesita. Los números del negocio
        son del dueño y del encargado.
      </p>

      {miembros === null && (
        <p style={{ fontSize: 13, color: 'var(--ag-ink-3)' }}>Cargando...</p>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {(miembros || []).map(m => {
          const suyos = m.roles || [];
          const enEdicion = editando?.user_id === m.user_id;
          return (
            <div key={m.user_id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, color: 'var(--ag-ink)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.email}
                    {m.user_id === currentUserId && (
                      <span style={{ fontSize: 12, color: 'var(--ag-ink-3)' }}> · vos</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ag-ink-3)', marginTop: 3 }}>
                    {suyos.map(r => etiquetaDeRol(r, terminos)).join(' · ') || 'Sin permisos'}
                    {/* Una fila sin sucursal vale por todas: no se dice nada,
                        porque "todas las sucursales" en un local unico es ruido. */}
                    {m.branch_ids?.filter(Boolean).length > 0 && sucursales.length > 1 && (
                      <> · {m.branch_ids.filter(Boolean)
                        .map(id => sucursales.find(s => s.id === id)?.name)
                        .filter(Boolean).join(', ')}</>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditando(enEdicion ? null : { ...m, borrador: suyos })}
                  style={{
                    border: '1px solid var(--ag-line)', background: 'transparent',
                    borderRadius: 8, padding: '5px 11px', cursor: 'pointer',
                    font: 'inherit', fontSize: 12.5, color: 'inherit', alignSelf: 'start',
                  }}
                >
                  {enEdicion ? 'Cerrar' : 'Permisos'}
                </button>
              </div>

              {enEdicion && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--ag-line)' }}>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                    {asignables.map(rol => {
                      // El ultimo duenio no puede dejar de serlo: si pudiera,
                      // el negocio quedaria sin nadie que gestione el equipo.
                      const fijo = rol === 'owner' && esUltimoDuenio(m);
                      return (
                        <Pastilla
                          key={rol} rol={rol} terminos={terminos}
                          activo={editando.borrador.includes(rol)}
                          bloqueado={fijo}
                          motivo={fijo
                            ? 'Es el único dueño del negocio: alguien tiene que poder gestionar el equipo.'
                            : undefined}
                          onClick={() => setEditando(e => {
                            const tiene = e.borrador.includes(rol);
                            const sig = tiene
                              ? e.borrador.filter(r => r !== rol)
                              : [...e.borrador, rol];
                            // Nadie se queda sin ningun rol: no podria entrar.
                            return sig.length ? { ...e, borrador: sig } : e;
                          })}
                        />
                      );
                    })}
                  </div>

                  {esUltimoDuenio(m) && (
                    <p style={{ fontSize: 12.5, color: 'var(--ag-ink-3)', margin: '0 0 10px' }}>
                      Es el único dueño, así que ese rol no se le puede sacar.
                      Sumá otro dueño primero.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      disabled={esUltimoDuenio(m) && !editando.borrador.includes('owner')}
                      onClick={() => guardarRoles(m, editando.borrador)}
                      className="ag-btn-primary"
                      style={{ flex: 1 }}
                    >
                      Guardar
                    </button>
                    {m.user_id !== currentUserId && !esUltimoDuenio(m) && (
                      <button type="button" className="ag-btn-ghost" onClick={() => quitar(m)}>
                        Quitar acceso
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!abriendoAlta ? (
        <button
          type="button" className="ag-btn-primary"
          style={{ width: '100%', marginTop: 14 }}
          onClick={() => setAbriendoAlta(true)}
        >
          + Sumar a alguien
        </button>
      ) : (
        <div style={{ ...card, marginTop: 14, display: 'grid', gap: 11 }}>
          <strong style={{ fontSize: 14 }}>Sumar a alguien</strong>

          <input
            style={campo} value={email} autoFocus type="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Su email"
          />
          <div>
            <input
              style={campo} value={password} type="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña (si es cuenta nueva)"
            />
            <span style={{ display: 'block', marginTop: 5, fontSize: 12.5, color: 'var(--ag-ink-3)' }}>
              Si ya tiene cuenta en Dico, entra con la suya y esto se ignora.
            </span>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
              ¿Qué hace?
            </span>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {asignables.map(rol => (
                <Pastilla
                  key={rol} rol={rol} terminos={terminos}
                  activo={rolesNuevos.includes(rol)}
                  onClick={() => alternar(rolesNuevos, rol, setRolesNuevos)}
                />
              ))}
            </div>
            <span style={{ display: 'block', marginTop: 7, fontSize: 12.5, color: 'var(--ag-ink-3)' }}>
              {rolesNuevos.map(r => ROLES[r]?.descripcion).filter(Boolean).join(' ')}
            </span>
          </div>

          {/* El selector de sucursal solo aparece si hay mas de una: en un
              negocio de un local es una pregunta sin respuesta posible. */}
          {sucursales.length > 1 && (
            <label>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                ¿En qué local?
              </span>
              <select
                style={campo} value={sucursalNueva}
                onChange={(e) => setSucursalNueva(e.target.value)}
              >
                <option value="">En todos</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button" className="ag-btn-ghost"
              onClick={() => setAbriendoAlta(false)}
            >
              Cancelar
            </button>
            <button
              type="button" className="ag-btn-primary" style={{ flex: 1 }}
              disabled={!email.trim() || guardando}
              onClick={sumar}
            >
              {guardando ? 'Sumando…' : 'Sumar al equipo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
