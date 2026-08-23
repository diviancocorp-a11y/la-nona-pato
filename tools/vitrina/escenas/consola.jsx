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

/* El correo del equipo, como lo devuelve Cloudflare. Sofía confirmó el
   reenvío; Martín todavía no, y por eso su alias no entrega nada. */
const DESTINOS = [
  // El destino del catch-all también es un destino: en Cloudflare no se puede
  // reenviar a una dirección que no esté en esta lista y confirmada.
  { email: 'ricardo.r@gmail.com', confirmado: true },
  { email: 'sofia.g@gmail.com', confirmado: true },
  { email: 'martin.k@gmail.com', confirmado: false },
];

const REGLAS = [
  { alias: 'sofia@grupodivianco.com', destinos: ['sofia.g@gmail.com'], activa: true },
  { alias: 'martin@grupodivianco.com', destinos: ['martin.k@gmail.com'], activa: true },
];

// El dueño anda por catch-all: su cuenta es anterior a que hubiera una regla
// por persona. Si el catch-all no contara, la consola le diría al dueño que no
// tiene correo.
const CATCH_ALL = { activo: true, destinos: ['ricardo.r@gmail.com'] };

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
    functions: {
      'staff-invite': async (body) => {
        const dominio = 'grupodivianco.com';
        if (body.accion === 'correos') {
          return { ok: true, dominio, reglas: REGLAS, destinos: DESTINOS, catchAll: CATCH_ALL };
        }
        if (body.accion === 'reenviar_confirmacion') {
          return { ok: true, message: `Le mandamos otro mail a ${body.personal}.` };
        }
        if (body.accion === 'diagnostico') {
          // El caso que motivó el diagnóstico: lee todo bien y no puede
          // escribir la regla. Es el que hay que poder mirar.
          return {
            ok: true, dominio,
            resumen: 'Se cae en «5. sonda: ¿puede ESCRIBIR reenvíos? (no crea nada)». '
              + 'no pudo crear el reenvío (Authentication error [10000]).',
            pasos: [
              { paso: '1. encontrar la zona', ok: true,
                detalle: { zoneId: 'z-fake', accountId: 'a-fake', origen: 'búsqueda por nombre' } },
              { paso: '2. leer los destinos (cuenta)', ok: true, detalle: { cantidad: 3 } },
              { paso: '3. leer los reenvíos (zona)', ok: true, detalle: { cantidad: 2 } },
              { paso: '4. leer el catch-all (zona)', ok: true, detalle: CATCH_ALL },
              { paso: '5. sonda: ¿puede ESCRIBIR reenvíos? (no crea nada)', ok: false,
                codigos: [10000],
                error: 'no pudo crear el reenvío (Authentication error [10000]). '
                  + 'Al token le falta el permiso «Zone → Email Routing Rules: Edit», '
                  + 'o ese permiso no alcanza a este dominio.' },
            ],
          };
        }
        if (body.accion === 'crear_correo') {
          const email = `${body.alias}@${dominio}`;
          // Si la regla YA existe —la creó alguien a mano en Cloudflare porque
          // al token le faltaba el permiso de escritura— el alta la detecta y
          // retoma. Es la salida que ofrece el mensaje de error.
          const yaHay = REGLAS.find(r => r.alias === email);
          if (yaHay) {
            return {
              ok: true, email, personal: yaHay.destinos[0], paso: 'listo',
              confirmado: true, regla: true,
              message: `${email} ya estaba andando.`,
            };
          }
          const destino = DESTINOS.find(d => d.email === body.personal);
          if (!destino) {
            DESTINOS.push({ email: body.personal, confirmado: false });
            return {
              ok: true, email, personal: body.personal, paso: 'esperando_confirmacion',
              confirmado: false, regla: false,
              message: `Le mandamos un mail a ${body.personal} para que confirme el reenvío.`,
            };
          }
          // Segunda pasada: se hace de cuenta que ya confirmó.
          destino.confirmado = true;
          REGLAS.push({ alias: email, destinos: [body.personal], activa: true });
          return {
            ok: true, email, personal: body.personal, paso: 'listo',
            confirmado: true, regla: true,
            message: `${email} ya reenvía a ${body.personal}.`,
          };
        }
        // Dar el acceso.
        const filas = filasDe('platform_admins');
        filas.push({
          user_id: `u${filas.length + 1}`, email: body.email,
          rol: 'staff', created_at: 'hoy',
        });
        return { ok: true, email: body.email, invitado: true,
          message: 'Le mandamos un mail para que elija su contraseña.' };
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
