// El equipo de un local gastronomico, con los roles de 6f.
//
// El service pega contra una edge function y no contra la base: la escena
// declara que contesta esa function en `datos.functions`.
import EquipoDelNegocio from 'app/components/admin/platform/EquipoDelNegocio.jsx';

const MIEMBROS = [
  {
    user_id: 'u1', email: 'ricky@divianco.com', roles: ['owner'],
    branch_ids: [null], created_at: '2026-01-10',
  },
  {
    user_id: 'u2', email: 'sole@local.com', roles: ['manager', 'cashier'],
    branch_ids: [null], created_at: '2026-03-02',
  },
  {
    user_id: 'u3', email: 'juan@local.com', roles: ['attendant'],
    branch_ids: [null], created_at: '2026-05-20',
  },
  {
    user_id: 'u4', email: 'cocina@local.com', roles: ['kitchen'],
    branch_ids: [null], created_at: '2026-06-01',
  },
];

// La vitrina no habla con Supabase: la escena declara que contesta la function.
const FUNCIONES = {
  'tenant-users': async (body) => {
    if (body.action === 'list') return { ok: true, users: MIEMBROS };
    if (body.action === 'set_role') {
      const m = MIEMBROS.find(x => x.user_id === body.user_id);
      if (m) m.roles = body.roles;
      return { ok: true };
    }
    if (body.action === 'create') {
      MIEMBROS.push({
        user_id: `u${MIEMBROS.length + 1}`, email: body.email,
        roles: body.roles, branch_ids: [body.branch_id], created_at: 'hoy',
      });
      return { ok: true };
    }
    if (body.action === 'remove') {
      const i = MIEMBROS.findIndex(x => x.user_id === body.user_id);
      if (i >= 0) MIEMBROS.splice(i, 1);
      return { ok: true };
    }
    return { ok: false, error: 'accion desconocida' };
  },
};

export default {
  titulo: 'Equipo y permisos',
  componente: EquipoDelNegocio,
  props: {
    vertical: 'gastro',
    modo: 'fisico',
    terminos: { operario: 'Mozo' },
    sucursales: [{ id: 'b1', name: 'Principal' }],
    currentUserId: 'u1',
    showToast: (m) => console.log('toast:', m),
    onBack: () => {},
  },
  datos: { functions: FUNCIONES },
};
