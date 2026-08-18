/**
 * Users — gestion de acceso al admin (Sprint 1).
 *
 * Lista los usuarios con acceso, permite crear nuevos (email + password),
 * cambiar rol owner/staff y revocar acceso. Todo via edge function
 * admin-users, que exige rol OWNER en el caller. Si un staff abre esta
 * pantalla ve la lista vacia con el error del server (403).
 *
 * Roles:
 *   owner — todo + gestionar usuarios
 *   staff — opera el negocio; en Sprint 5 pierde finanzas/settings
 */
import { useState, useEffect, useCallback } from 'react';
import { listAdminUsers, createAdminUser, setAdminRole, removeAdminUser } from '../../services/adminUsers';

const ROLE_LABEL = { owner: 'Owner', staff: 'Staff' };

function RoleChip({ role }) {
  const isOwner = role === 'owner';
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
      background: isOwner ? 'var(--ag-c-sales-soft, rgba(46,160,67,0.12))' : 'var(--ag-bg-soft, rgba(127,127,127,0.12))',
      color: isOwner ? 'var(--ag-c-sales, #2ea043)' : 'var(--ag-ink-2)',
    }}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

function Users({ showToast, onBack, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null); // user object

  // Form de alta
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    const res = await listAdminUsers();
    if (res.ok) setUsers(res.users || []);
    else setLoadError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    setFormError('');
    if (!email.trim()) { setFormError('Email requerido'); return; }
    if (password.length < 8) { setFormError('Password minimo 8 caracteres'); return; }
    setBusy(true);
    const res = await createAdminUser(email.trim(), password, role);
    setBusy(false);
    if (res.ok) {
      // El mensaje lo manda el server: en el edificio una cuenta que ya
      // existia NO cambia de contrasena (eso seria tomarle la cuenta), y el
      // texto tiene que decir la verdad de lo que paso.
      showToast?.(res.message
        || (res.reused ? 'Ya tenía cuenta: le dimos acceso' : 'Usuario creado con acceso al panel'));
      setEmail(''); setPassword(''); setRole('staff'); setShowForm(false);
      load();
    } else {
      setFormError(res.error);
    }
  };

  const handleToggleRole = async (u) => {
    const next = u.role === 'owner' ? 'staff' : 'owner';
    setBusy(true);
    const res = await setAdminRole(u.user_id, next);
    setBusy(false);
    if (res.ok) { showToast?.(`${u.email} ahora es ${ROLE_LABEL[next]}`); load(); }
    else showToast?.(res.error);
  };

  const handleRemove = async (u) => {
    setConfirmRemove(null);
    setBusy(true);
    const res = await removeAdminUser(u.user_id);
    setBusy(false);
    if (res.ok) { showToast?.(`Acceso revocado a ${u.email}`); load(); }
    else showToast?.(res.error);
  };

  const fmtDate = (iso) => {
    if (!iso) return 'Nunca';
    try { return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
    catch { return '—'; }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="ag-p-head">
        <h1>Usuarios</h1>
        <p className="ag-p-sub">Quien puede entrar al panel y con que rol</p>
      </div>

      <div style={{ padding: '0 18px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Boton alta / form */}
        {!showForm ? (
          <button type="button" className="ag-btn ag-btn-primary" disabled={busy} onClick={() => setShowForm(true)} style={{ alignSelf: 'flex-start' }}>
            + Agregar usuario
          </button>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 14, background: 'var(--ag-bg-soft, rgba(127,127,127,0.08))' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Nuevo usuario</div>
            <input
              type="email" placeholder="email@ejemplo.com" value={email} autoComplete="off"
              onChange={e => setEmail(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ag-line, rgba(127,127,127,0.25))', background: 'transparent', color: 'inherit' }}
            />
            <input
              type="password" placeholder="Password (min 8 caracteres)" value={password} autoComplete="new-password"
              onChange={e => setPassword(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ag-line, rgba(127,127,127,0.25))', background: 'transparent', color: 'inherit' }}
            />
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--ag-line, rgba(127,127,127,0.25))', background: 'transparent', color: 'inherit' }}>
              <option value="staff">Staff — opera el negocio</option>
              <option value="owner">Owner — todo + gestiona usuarios</option>
            </select>
            {formError && <div style={{ color: 'var(--ag-c-orders, #d9534f)', fontSize: 13 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="ag-btn ag-btn-primary" disabled={busy}>{busy ? 'Creando...' : 'Crear'}</button>
              <button type="button" className="ag-btn" disabled={busy} onClick={() => { setShowForm(false); setFormError(''); }}>Cancelar</button>
            </div>
          </form>
        )}

        {/* Lista */}
        {loading && <div style={{ color: 'var(--ag-ink-3)', padding: 20, textAlign: 'center' }}>Cargando usuarios...</div>}
        {!loading && loadError && (
          <div style={{ color: 'var(--ag-ink-3)', padding: 20, textAlign: 'center' }}>
            {loadError}
          </div>
        )}
        {!loading && !loadError && users.map(u => (
          <div key={u.user_id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 14, background: 'var(--ag-card-bg, rgba(127,127,127,0.06))',
            border: '1px solid var(--ag-line, rgba(127,127,127,0.15))',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>
                {u.email} {u.user_id === currentUserId && <span style={{ fontSize: 11, color: 'var(--ag-ink-3)' }}>(vos)</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ag-ink-3)', marginTop: 2 }}>
                Ultimo ingreso: {fmtDate(u.last_sign_in_at)}
              </div>
            </div>
            <RoleChip role={u.role} />
            {u.user_id !== currentUserId && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="ag-btn" disabled={busy} title={u.role === 'owner' ? 'Bajar a staff' : 'Subir a owner'}
                  onClick={() => handleToggleRole(u)} style={{ fontSize: 12, padding: '6px 10px' }}>
                  {u.role === 'owner' ? '→ Staff' : '→ Owner'}
                </button>
                <button type="button" className="ag-btn" disabled={busy} title="Revocar acceso"
                  onClick={() => setConfirmRemove(u)}
                  style={{ fontSize: 12, padding: '6px 10px', color: 'var(--ag-c-orders, #d9534f)' }}>
                  Quitar
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && !loadError && users.length === 0 && (
          <div style={{ color: 'var(--ag-ink-3)', padding: 20, textAlign: 'center' }}>Sin usuarios con acceso.</div>
        )}

        {onBack && (
          <button type="button" className="ag-btn" onClick={onBack} style={{ alignSelf: 'flex-start', marginTop: 8 }}>← Volver</button>
        )}
      </div>

      {/* Confirmacion de revocado */}
      {confirmRemove && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmRemove(null)}>
          <div style={{ background: 'var(--ag-bg, #fff)', color: 'inherit', borderRadius: 16, padding: 22, maxWidth: 340, margin: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Revocar acceso</div>
            <div style={{ fontSize: 14, color: 'var(--ag-ink-2)', marginBottom: 16 }}>
              {confirmRemove.email} no va a poder entrar mas al panel. Su cuenta no se borra.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="ag-btn" onClick={() => setConfirmRemove(null)}>Cancelar</button>
              <button type="button" className="ag-btn ag-btn-primary" style={{ background: 'var(--ag-c-orders, #d9534f)' }} onClick={() => handleRemove(confirmRemove)}>Revocar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
