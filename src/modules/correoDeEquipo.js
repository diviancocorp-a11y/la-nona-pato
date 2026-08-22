// El correo de trabajo de alguien del equipo de Divianco.
//
// ── COMO FUNCIONA UN CORREO DE LA EMPRESA ──
// Nadie del equipo tiene una casilla propia. Tiene un ALIAS en el dominio de
// la empresa (juan@grupodivianco.com) que REENVIA a su correo personal. Quien
// hace el reenvio es Cloudflare Email Routing, y es la unica verdad sobre que
// alias existe y a donde va. Aca no se guarda nada de eso: se lee de
// Cloudflare y se traduce a algo que una pantalla pueda mostrar.
//
// Duplicar esa tabla en nuestra base seria tener dos verdades sobre a donde va
// el correo de una persona, y la que manda no es la nuestra.
//
// ── LA REGLA QUE IMPORTA ──
// Cloudflare exige que el DUENIO del correo personal confirme el destino con
// un clic en un mail que le manda a el. Hasta que no lo hace, ese destino no
// recibe nada: un alias que apunte ahi se traga los mails en silencio.
//
// Por eso `recibeMail()` existe y se aplica en DOS lados: en la pantalla, para
// no ofrecer un boton que va a fallar, y en la edge function, que es la que
// manda la invitacion. Si la invitacion sale antes de la confirmacion, se
// pierde — y encima vence a las 24 horas, asi que cuando la persona por fin
// confirma, el link que la esperaba ya no sirve.

/** Pasa un nombre a algo que sirva de parte local de un correo. */
export function aliasDesde(nombre) {
  return String(nombre || '')
    // El rango va escapado y no literal: son caracteres combinantes, invisibles
    // en el editor, y este repo ya se comio dos builds por cortar UTF-8 al medio.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 64);
}

/**
 * Si un alias sirve como parte local de un correo.
 *
 * Se valida de este lado ADEMAS del servidor por una razon concreta: un alias
 * invalido no falla al crearse, falla despues, cuando alguien le escribe.
 */
export function aliasValido(alias) {
  const a = String(alias || '');
  return a.length > 0 && a.length <= 64 && /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(a);
}

/**
 * Si a esa direccion le llega el correo HOY.
 *
 * Dos formas de que llegue: una regla propia del alias, o un catch-all que se
 * lleva todo lo que no matchea ninguna regla. En las dos, el destino tiene que
 * estar confirmado — una regla que apunta a un destino sin confirmar existe,
 * se ve en el panel de Cloudflare, y no entrega nada.
 *
 * @param {string} email  direccion completa (alias@dominio)
 * @param {{reglas: Array, destinos: Array, catchAll: object}} estado
 */
export function recibeMail(email, estado) {
  return viaDe(email, estado) !== null;
}

/** Por donde le llega el correo a esa direccion: 'regla', 'catch-all' o null. */
export function viaDe(email, estado) {
  const dir = String(email || '').toLowerCase();
  const { reglas = [], destinos = [], catchAll = null } = estado || {};

  const confirmados = new Set(
    destinos.filter((d) => d.confirmado).map((d) => String(d.email).toLowerCase()),
  );

  const regla = reglas.find((r) => r.alias === dir && r.activa);
  if (regla) {
    return regla.destinos.some((d) => confirmados.has(String(d).toLowerCase()))
      ? 'regla'
      : null;
  }

  // El catch-all no es un detalle: las cuentas fundadoras son anteriores a que
  // hubiera una regla por persona, y siguen andando por ahi. Tratarlas como
  // "sin correo" seria bloquear justamente a quien administra la consola.
  if (catchAll?.activo && catchAll.destinos.some((d) => confirmados.has(String(d).toLowerCase()))) {
    return 'catch-all';
  }
  return null;
}

/**
 * En que estado esta el correo de trabajo de una persona.
 *
 * Devuelve algo que una pantalla puede mostrar sin volver a razonar:
 *   sin_correo   no hay alias ni catch-all: no le llega nada
 *   sin_confirmar hay alias, pero el duenio del personal no confirmo todavia
 *   listo        le llega
 */
export function estadoDelCorreo(email, estado) {
  const dir = String(email || '').toLowerCase();
  const { reglas = [] } = estado || {};
  const regla = reglas.find((r) => r.alias === dir && r.activa);
  const via = viaDe(dir, estado);

  if (via) return { estado: 'listo', via, personal: regla ? regla.destinos[0] || null : null };
  if (regla) return { estado: 'sin_confirmar', via: null, personal: regla.destinos[0] || null };
  return { estado: 'sin_correo', via: null, personal: null };
}

/** Lo que se le muestra a una persona, no lo que se guarda. */
export const TEXTO_DE_ESTADO = {
  sin_correo: 'sin correo de trabajo',
  sin_confirmar: 'esperando que confirme el reenvío',
  listo: 'recibe correo',
};
