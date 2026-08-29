/**
 * El estado de suscripcion de UN negocio, derivado de su fila en `tenants`.
 *
 * ── POR QUE ESTE ARCHIVO EXISTE Y NO BLOQUEA NADA ──
 * La auditoria del 29/ago encontro que la monetizacion estaba modelada entera
 * y conectada a nada: `planes.js` define modulos y limites que ningun
 * componente consulta, `tenant_puede_operar()` no la invoca ninguna policy, y
 * `suspender_impagos()` no esta agendada en pg_cron. Los 7 negocios tienen
 * `paga_hasta` en null, o sea que hoy nadie puede ser suspendido nunca.
 *
 * La tentacion es cablear todo de una. Seria un error: encender limites y
 * suspension juntos, sobre datos que nunca se migraron, es un cambio comercial
 * irreversible disfrazado de refactor. El primer negocio que quede afuera de
 * su propio panel por un `paga_hasta` mal seteado no vuelve.
 *
 * Entonces el orden es: MOSTRAR primero, decidir despues.
 *
 *   1. (este archivo) leer el plan y la fecha, y saber decir en que estado
 *      esta. NADA se bloquea.
 *   2. una pantalla "Mi suscripcion" que el duenio pueda ver — hoy no existe
 *      ningun lugar donde sepa que plan tiene ni cuando vence.
 *   3. asignar plan en el alta (`signup_tenant` no lo hace).
 *   4. limites con AVISO, todavia sin bloquear.
 *   5. bloqueo de creacion por encima del plan.
 *   6. cobros y periodo de gracia.
 *   7. recien ahi, el cron de suspension.
 *
 * Cada paso es reversible por separado. Este es el 1.
 *
 * ── LA REGLA DE `puedeOperar` ──
 * Devuelve `true` siempre salvo que la BASE ya diga `status = 'suspendido'`.
 * No inventa suspensiones a partir de la fecha: eso lo decide el server
 * (`suspender_impagos`, cuando se agende), nunca el cliente. Un front que
 * calcula por su cuenta quien esta al dia es un front que puede dejar afuera a
 * alguien que pago.
 */

/** Dias entre hoy y una fecha ISO. Negativo = ya paso. */
function diasHasta(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const MS_DIA = 86400000;
  // Se compara a medianoche para que "vence hoy" no dependa de la hora.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((t - hoy.getTime()) / MS_DIA);
}

/** Cuantos dias antes del vencimiento se empieza a avisar. */
export const DIAS_DE_AVISO = 7;

/**
 * Estados posibles. Son de PRODUCTO, no de la base: `sin_plan` y `por_vencer`
 * no existen como valor de `tenants.status`, se derivan.
 *
 *   sin_plan    · no tiene plan_id. Hoy le pasa a todo negocio creado por el
 *                 alta self-service, porque `signup_tenant` no lo asigna.
 *   sin_fecha   · tiene plan pero nunca se le cargo `paga_hasta`. Es el caso
 *                 de los 7 negocios actuales: la 0052 les puso plan de forma
 *                 retroactiva y nadie completo la fecha.
 *   al_dia      · paga_hasta en el futuro, con margen.
 *   por_vencer  · vence dentro de DIAS_DE_AVISO.
 *   vencida     · la fecha paso y el server todavia no lo suspendio (hay 15
 *                 dias de gracia por diseno, migracion 0052).
 *   suspendida  · lo dice la base, no esta pantalla.
 */
export function estadoDeSuscripcion(tenant) {
  if (!tenant) return 'sin_plan';
  if (tenant.status === 'suspendido') return 'suspendida';
  if (!tenant.plan_id) return 'sin_plan';
  if (!tenant.paga_hasta) return 'sin_fecha';

  const dias = diasHasta(tenant.paga_hasta);
  if (dias === null) return 'sin_fecha';
  if (dias < 0) return 'vencida';
  if (dias <= DIAS_DE_AVISO) return 'por_vencer';
  return 'al_dia';
}

/**
 * Si el negocio puede OPERAR (cargar, cobrar, mover stock).
 *
 * Unica fuente: `status`. Ver la nota de arriba sobre por que el front no
 * deduce esto de la fecha.
 */
export function puedeOperar(tenant) {
  return tenant?.status !== 'suspendido';
}

/** Todo junto, que es lo que consume el hook. */
export function resumenDeSuscripcion(tenant) {
  const estado = estadoDeSuscripcion(tenant);
  return {
    planId: tenant?.plan_id || null,
    ciclo: tenant?.ciclo || 'mensual',
    pagaHasta: tenant?.paga_hasta || null,
    diasRestantes: diasHasta(tenant?.paga_hasta),
    estado,
    // Explicito a proposito: que se lea en el call site que esto todavia no
    // depende del plan ni de la fecha.
    puedeOperar: puedeOperar(tenant),
    necesitaAtencion: estado !== 'al_dia',
  };
}
