// La consola de Divianco: planes, precios, clientes y equipo.
//
// Los datos son los que quedaron en la tabla `plans` tras la migracion 0052.
// Poner SESION en null muestra el LOGIN, que es la otra mitad de la pantalla.
import Consola from 'app/pages/Consola.jsx';

const SESION = { user: { id: 'u-staff', email: 'vos@divianco.com' } };

const PLANES = [
  {
    id: 'digital', nombre: 'Digital',
    descripcion: 'Para vender a distancia: catálogo, pedidos y clientes.',
    precio_mensual: 29000, precio_anual_por_mes: 23200,
    meses_gratis: 1, meses_descuento: 0, descuento_pct: 0,
    disponible: true, orden: 1,
  },
  {
    id: 'local', nombre: 'Local',
    descripcion: 'Todo lo de Digital más el salón: mesas, caja, comandas y equipo.',
    precio_mensual: 59000, precio_anual_por_mes: 47200,
    meses_gratis: 1, meses_descuento: 3, descuento_pct: 50,
    disponible: true, orden: 2,
  },
  {
    id: 'cadena', nombre: 'Cadena',
    descripcion: 'Varias sucursales, roles por local y comparativas entre ellos.',
    precio_mensual: 99000, precio_anual_por_mes: 79200,
    meses_gratis: 1, meses_descuento: 0, descuento_pct: 0,
    disponible: true, orden: 3,
  },
  {
    id: 'total', nombre: 'Total',
    descripcion: 'Todo lo de Cadena más facturación electrónica y soporte 24 h con IA.',
    precio_mensual: 0, precio_anual_por_mes: 0,
    meses_gratis: 1, meses_descuento: 0, descuento_pct: 0,
    disponible: false, orden: 4,
  },
];

const hace = (d) => new Date(Date.now() + d * 86400000).toISOString();

const NEGOCIOS = [
  {
    id: 't1', slug: 'cochi', name: 'Cochi', vertical: 'gastro',
    operation_mode: 'fisico', status: 'active', plan_id: 'local',
    ciclo: 'mensual', paga_hasta: hace(4), medio_de_cobro: 'mercadopago',
  },
  {
    id: 't2', slug: 'la-nona-pato', name: 'La Nona Pato', vertical: 'gastro',
    operation_mode: 'virtual', status: 'active', plan_id: 'digital',
    ciclo: 'anual', paga_hasta: hace(210), medio_de_cobro: 'transferencia',
  },
  {
    id: 't3', slug: 'mala-miga', name: 'Mala Miga', vertical: 'gastro',
    operation_mode: 'virtual', status: 'suspendido', plan_id: 'digital',
    ciclo: 'mensual', paga_hasta: hace(-22), suspendido_at: hace(-7),
    medio_de_cobro: 'efectivo',
  },
  {
    id: 't4', slug: 'barberia-demo', name: 'Barbería Demo', vertical: 'barberia',
    operation_mode: 'fisico', status: 'trial', plan_id: 'local',
    ciclo: 'mensual', paga_hasta: null, medio_de_cobro: null,
  },
];

const STAFF = [
  { user_id: 'u-staff', email: 'vos@divianco.com', created_at: '2026-01-01' },
  { user_id: 'u2', email: 'sofia@divianco.com', created_at: '2026-04-10' },
];

export default {
  titulo: 'Consola de Divianco',
  componente: Consola,
  props: {},
  datos: {
    tablas: { plans: PLANES, tenants: NEGOCIOS, platform_admins: STAFF },
    sesion: SESION,
    rpc: {
      sumar_staff: ({ p_email }) => {
        STAFF.push({ user_id: `u${STAFF.length + 1}`, email: p_email, created_at: 'hoy' });
        return { ok: true };
      },
      quitar_staff: ({ p_user_id }) => {
        if (p_user_id === 'u-staff') return { ok: false, error: 'no_te_saques_a_vos' };
        const i = STAFF.findIndex(x => x.user_id === p_user_id);
        if (i >= 0) STAFF.splice(i, 1);
        return { ok: true };
      },
    },
  },
};
