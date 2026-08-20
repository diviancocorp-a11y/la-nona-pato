// El equipo de un local gastronomico, con los roles de 6f.
//
// El service pega contra una edge function y no contra la base, asi que el
// fake de supabase no alcanza: se mockea `functions.invoke` a mano.
import EquipoDelNegocio from 'app/components/admin/platform/EquipoDelNegocio.jsx';
import { supabase } from '../fake-supabase.js';

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

// La vitrina no habla con Supabase: se le da a `invoke` lo que devolveria.
supabase.functions = {
  invoke: async (_fn, { body }) => {
    if (body.action === 'list') return { data: { ok: true, users: MIEMBROS }, error: null };
    if (body.action === 'set_role') {
      const m = MIEMBROS.find(x => x.user_id === body.user_id);
      if (m) m.roles = body.roles;
      return { data: { ok: true }, error: null };
    }
    if (body.action === 'create') {
      MIEMBROS.push({
        user_id: `u${MIEMBROS.length + 1}`, email: body.email,
        roles: body.roles, branch_ids: [body.branch_id], created_at: 'hoy',
      });
      return { data: { ok: true }, error: null };
    }
    if (body.action === 'remove') {
      const i = MIEMBROS.findIndex(x => x.user_id === body.user_id);
      if (i >= 0) MIEMBROS.splice(i, 1);
      return { data: { ok: true }, error: null };
    }
    return { data: { ok: false, error: 'accion desconocida' }, error: null };
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
};
