/**
 * El saludo de la barra de arriba.
 *
 * Antes ahi iba el nombre del negocio, que es un dato que el duenio ya sabe:
 * esta parado adentro de su local. Un saludo con su nombre es lo unico que
 * ese lugar puede decir que el usuario no sepa ya.
 *
 * NO ES i18n. El panel del edificio habla español argentino y punto; meter
 * esto en el sistema de traducciones seria arrastrar toda esa maquinaria por
 * tres cadenas.
 */

/**
 * Franjas: la madrugada saluda "buenas noches", como en la calle. Nadie dice
 * "buenos dias" a las 4 de la mañana.
 */
export function saludoDe(fecha = new Date()) {
  const h = fecha.getHours();
  if (h >= 6 && h < 13) return 'Buenos días';
  if (h >= 13 && h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * El PRIMER nombre, no el completo: "Buenos días Ricardo" es un saludo,
 * "Buenos días Ricardo Rodriguez" es una citacion judicial.
 *
 * Sale de `user_metadata.full_name`, que es lo que escribe el alta. Si no hay
 * —cuentas viejas, invitaciones a medias— cae al usuario del correo, y si
 * tampoco hay correo devuelve null: quien llama decide que poner en su lugar,
 * porque un "Buenos días undefined" es peor que no saludar.
 */
export function nombreDe(session) {
  const meta = session?.user?.user_metadata || {};
  const completo = (meta.full_name || meta.name || '').trim();
  if (completo) return capitalizar(completo.split(/\s+/)[0]);

  const email = session?.user?.email || '';
  const usuario = email.split('@')[0] || '';
  if (!usuario) return null;
  // `dueno.parrilla-smoke` -> `Dueno`: el primer tramo antes de un separador.
  return capitalizar(usuario.split(/[.\-_+]/)[0]);
}

function capitalizar(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
