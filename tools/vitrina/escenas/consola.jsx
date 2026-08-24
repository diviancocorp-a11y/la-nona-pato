// La consola de Divianco: planes, precios, clientes y equipo.
//
// Los datos son los que quedaron en la tabla `plans` tras la migracion 0052.
// Poner SESION en null muestra el LOGIN, que es la otra mitad de la pantalla.
import Consola from 'app/pages/Consola.jsx';
// El fake copia las tablas al cargar la escena: mutar el array de aca no se
// ve en la pantalla. Lo que hay que tocar son las filas del fake.
import { filasDe } from '../fake-supabase.js';

const SESION = { user: { id: 'u-staff', email: 'ricardo.r@grupodivianco.com' } };

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

const dias = (d) => new Date(Date.now() - d * 86400000).toISOString();

// Los siete negocios REALES del edificio con su estado del 24/ago: ninguno
// llego al primer valor. Es la foto que reordeno el plan y conviene poder
// mirarla en la pantalla que la muestra.
const NEGOCIOS = [
  {
    id: 't1', slug: 'cochi', name: 'Cochi', vertical: 'gastro',
    operation_mode: 'fisico', status: 'active', plan_id: 'local',
    ciclo: 'mensual', paga_hasta: hace(4), medio_de_cobro: 'mercadopago',
    activated_at: dias(46), last_activity_at: dias(4), first_value_at: null,
  },
  {
    id: 't2', slug: 'la-nona-pato', name: 'La Nona Pato', vertical: 'gastro',
    operation_mode: 'virtual', status: 'active', plan_id: 'digital',
    ciclo: 'anual', paga_hasta: hace(210), medio_de_cobro: 'transferencia',
    activated_at: dias(46), last_activity_at: dias(6), first_value_at: dias(30),
  },
  {
    id: 't3', slug: 'mala-miga', name: 'Mala Miga', vertical: 'gastro',
    operation_mode: 'virtual', status: 'suspendido', plan_id: 'digital',
    ciclo: 'mensual', paga_hasta: hace(-22), suspendido_at: hace(-7),
    medio_de_cobro: 'efectivo',
    activated_at: dias(46), last_activity_at: dias(40), first_value_at: dias(38),
  },
  {
    id: 't4', slug: 'barberia-demo', name: 'Barbería Demo', vertical: 'barber',
    operation_mode: 'fisico', status: 'trial', plan_id: 'local',
    ciclo: 'mensual', paga_hasta: null, medio_de_cobro: null,
    activated_at: dias(9), last_activity_at: dias(5), first_value_at: null,
  },
];

const STAFF = [
  { user_id: 'u-staff', email: 'ricardo.r@grupodivianco.com', rol: 'owner', puesto: 'administrador', modalidad: 'empleado', created_at: '2026-01-01' },
  { user_id: 'u2', email: 'sofia@grupodivianco.com', rol: 'staff', puesto: 'ventas', modalidad: 'empleado', created_at: '2026-04-10' },
  // Sin confirmar: es el estado del que nadie se acuerda hasta que alguien
  // dice "no me llego el mail". Que se vea es medio arreglo.
  { user_id: 'u3', email: 'martin@grupodivianco.com', rol: 'staff', puesto: 'soporte', modalidad: 'contratista', created_at: '2026-08-19' },
];

// La consola pide el legajo antes de dejar entrar. Sin esta fila la escena
// mostraria el legajo y no la consola — que es correcto, y para eso esta la
// escena `legajo`.
const LEGAJOS = [
  { user_id: 'u-staff', nombre: 'Ricardo', apellido: 'Rodriguez', pais: 'AR',
    completado_at: '2026-01-02' },
  // Sofia con el legajo completo: es la ficha que se puede mirar entera.
  { user_id: 'u2', nombre: 'Sofia', apellido: 'Gomez', pais: 'AR',
    fecha_nacimiento: '1994-03-11', tipo_documento: 'dni', numero_documento: '37123456',
    identificacion_fiscal: '27371234561', calle: 'Chazarreta', altura: '1435',
    localidad: 'Cordoba', provincia: 'Cordoba', codigo_postal: '5000',
    telefono: '3511234567', emergencia_nombre: 'Marta Gomez',
    emergencia_telefono: '3517654321', cuenta_numero: '2850590940090418135201',
    cuenta_alias: 'sofia.gomez.mp', titular_cuenta: 'Sofia Gomez',
    titular_es_empresa: false, completado_at: '2026-04-12' },
  // Martin sin completar: el otro estado que hay que poder ver.
  { user_id: 'u3', nombre: 'Martin', apellido: 'K.', pais: 'AR', completado_at: null },
];

export default {
  titulo: 'Consola de Divianco',
  componente: Consola,
  props: {},
  datos: {
    tablas: {
      plans: PLANES, tenants: NEGOCIOS, platform_admins: STAFF,
      staff_legajo: LEGAJOS,
      // La vista del edificio (0056). El fake no hace joins, asi que la escena
      // la arma: es lo mismo que devolveria `staff_fichas`.
      staff_fichas: STAFF.map((a) => {
        const l = LEGAJOS.find((x) => x.user_id === a.user_id) || {};
        return {
          user_id: a.user_id, email: a.email, rol: a.rol, puesto: a.puesto,
          modalidad: a.modalidad || 'empleado', alta_at: a.created_at,
          nombre: l.nombre || null, apellido: l.apellido || null,
          pais: l.pais || null, completado_at: l.completado_at || null,
          foto_perfil_path: null,
        };
      }),
    },
    sesion: SESION,
    // El alta de un empleado pasa entera por la edge function. Este fake
    // imita lo unico que importa de Cloudflare: la primera vez el destino
    // queda SIN confirmar y no se puede crear la regla; recien la segunda
    // llamada —despues del clic de la persona— cierra el alta.
    // El alta pasa por la edge function. Desde 0057 hace una sola cosa:
    // invitar al correo personal.
    functions: {
      'staff-invite': async (body) => {
        if (body.resetear) {
          return { ok: true, email: body.email, message: 'Link enviado.' };
        }
        const filas = filasDe('platform_admins');
        filas.push({
          user_id: `u${filas.length + 1}`, email: body.email,
          rol: 'staff', puesto: body.puesto || 'soporte',
          modalidad: 'empleado', created_at: 'hoy',
        });
        return {
          ok: true, email: body.email, invitado: true,
          message: 'Le mandamos un mail para que elija su contraseña.',
        };
      },
    },
    rpc: {
      sumar_staff: ({ p_email }) => {
        const filas = filasDe('platform_admins');
        filas.push({
          user_id: `u${filas.length + 1}`, email: p_email,
          rol: 'staff', created_at: 'hoy',
        });
        return { ok: true };
      },
      cambiar_puesto: ({ p_user_id, p_puesto }) => {
        const fila = filasDe('platform_admins').find(x => x.user_id === p_user_id);
        if (!fila) return { ok: false, error: 'no_esta' };
        fila.puesto = p_puesto;
        return { ok: true, puesto: p_puesto };
      },
      quitar_staff: ({ p_user_id }) => {
        if (p_user_id === 'u-staff') return { ok: false, error: 'no_te_saques_a_vos' };
        const filas = filasDe('platform_admins');
        const i = filas.findIndex(x => x.user_id === p_user_id);
        if (i >= 0) filas.splice(i, 1);
        return { ok: true };
      },
    },
  },
};
