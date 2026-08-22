/**
 * Qué datos tiene que tener el legajo de un empleado de Dico para estar
 * completo.
 *
 * ESTA ESCRITO DOS VECES A PROPOSITO
 * Acá y en `legajo_completo()` (migración 0054). No es descuido: la pantalla
 * usa esta versión para decir QUE FALTA mientras la persona escribe, y el
 * servidor usa la suya para sellar `completado_at`, que es el flag que abre la
 * consola. Si sólo existiera la del navegador, entrar sería cuestión de
 * mandar un request a mano.
 *
 * Las dos listas tienen que decir lo mismo. Hay un test que las compara
 * parseando la migración, igual que el de los slugs reservados.
 *
 * LO QUE NO ES OBLIGATORIO, Y POR QUE
 * Piso/depto no lo tiene todo el mundo. Banco y alias se deducen del CBU y
 * pedirlos sería pedir dos veces el mismo dato. Fecha de ingreso la pone la
 * empresa, no la persona.
 */

/** Campo → cómo se llama cuando hay que decir que falta. */
export const OBLIGATORIOS = {
  nombre_completo: 'nombre y apellido',
  fecha_nacimiento: 'fecha de nacimiento',
  tipo_documento: 'tipo de documento',
  numero_documento: 'número de documento',
  cuil: 'CUIL',
  doc_frente_path: 'foto del documento (frente)',
  doc_dorso_path: 'foto del documento (dorso)',
  calle: 'calle',
  altura: 'altura',
  localidad: 'localidad',
  provincia: 'provincia',
  codigo_postal: 'código postal',
  telefono: 'teléfono',
  emergencia_nombre: 'contacto de emergencia',
  emergencia_telefono: 'teléfono de emergencia',
  cbu: 'CBU',
  titular_cuenta: 'titular de la cuenta',
};

/** Un campo cuenta como cargado si tiene algo que no sea espacios. */
function cargado(v) {
  return String(v ?? '').trim() !== '';
}

/** Los que faltan, con el nombre que ve la persona. */
export function faltantesDelLegajo(legajo) {
  return Object.entries(OBLIGATORIOS)
    .filter(([campo]) => !cargado(legajo?.[campo]))
    .map(([, etiqueta]) => etiqueta);
}

/**
 * Si está completo.
 *
 * OJO: esto decide qué se DIBUJA. Quien decide si se entra es
 * `completado_at`, que lo sella el servidor.
 */
export function legajoCompleto(legajo) {
  return faltantesDelLegajo(legajo).length === 0;
}
