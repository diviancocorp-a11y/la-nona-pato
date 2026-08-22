/**
 * Los puestos de la consola de Divianco y qué ve cada uno.
 *
 * ESTO ES DICO, NO UN TENANT
 * Acá viven los empleados de Divianco. Los roles del negocio de un cliente
 * —dueño, encargado, cajero, mozo— son otra cosa entera y viven en
 * `roles.js`. Un cliente nunca ve esta pantalla y un empleado de Dico no
 * trabaja en ningún local.
 *
 * DOS EJES QUE NO SON EL MISMO
 *   `rol`    owner | staff  →  quién REPARTE el acceso a la consola. Uno solo.
 *   `puesto`                →  qué HACE adentro. Es lo que declara este archivo.
 *
 * Si el puesto decidiera también quién reparte accesos, cada administrador
 * podría nombrar administradores y el acceso volvería a ser transitivo — que
 * es justo lo que la migración 0053 vino a cerrar.
 *
 * POR QUE ESTO ES CODIGO Y NO UNA TABLA
 * Igual que `roles.js` con los roles del negocio y que 0052 con los planes: el
 * DATO (quién tiene qué puesto) va a la base, la POLITICA (qué puede un
 * puesto) va acá, se versiona y se revisa en un diff. Un update mal hecho no
 * puede darle la lista de precios a marketing.
 *
 * ESTO NO ES LA SEGURIDAD
 * Es la navegación. Lo que mueve plata está además en RLS (migración 0054):
 * `plans` sólo lo escribe administrador, `tenants` administrador y ventas.
 * Esconder una pestaña no protege una tabla.
 */

export const ACCESO = {
  COMPLETO: 'completo',
  LECTURA: 'lectura',
  NADA: 'nada',
};

const { COMPLETO, LECTURA, NADA } = ACCESO;

export const PUESTOS = {
  administrador: {
    id: 'administrador',
    label: 'Administrador',
    descripcion: 'Precios, planes y suscripciones. Todo el negocio de Dico.',
    abreEn: 'planes',
  },
  ventas: {
    id: 'ventas',
    label: 'Ventas',
    descripcion: 'Da de alta clientes y mueve sus suscripciones. Los precios los lee.',
    abreEn: 'negocios',
  },
  soporte: {
    id: 'soporte',
    label: 'Soporte',
    descripcion: 'Ve el estado de cada cliente para poder atenderlo. No le toca la cuenta.',
    abreEn: 'negocios',
  },
  marketing: {
    id: 'marketing',
    label: 'Marketing',
    descripcion: 'Los planes y sus precios, para comunicarlos. No ve quién paga qué.',
    abreEn: 'planes',
  },
};

export const PUESTO_POR_DEFECTO = 'soporte';

/**
 * La matriz.
 *
 * Lo que NO figura para un puesto es `nada`: se declara sólo lo que se ve, así
 * una pestaña nueva nace oculta en vez de visible para todos. Es la única
 * forma de que el olvido sea seguro.
 */
const MATRIZ = {
  administrador: {
    planes: COMPLETO,
    negocios: COMPLETO,
    equipo: LECTURA,   // repartir accesos es del dueño, no del puesto
    legajo: COMPLETO,  // el suyo, siempre
  },
  ventas: {
    // Lee los precios porque los tiene que decir; no los cambia.
    planes: LECTURA,
    negocios: COMPLETO,
    legajo: COMPLETO,
  },
  soporte: {
    planes: LECTURA,
    // Ve al cliente para poder atenderlo y no le mueve la suscripción:
    // "me lo dejaste sin cobrar" no puede salir de una pantalla de ayuda.
    negocios: LECTURA,
    legajo: COMPLETO,
  },
  marketing: {
    planes: LECTURA,
    // Nada de negocios: la lista de clientes con lo que paga cada uno no le
    // hace falta para comunicar precios, y es el dato más delicado que hay acá.
    legajo: COMPLETO,
  },
};

/** Qué acceso tiene un puesto sobre una sección. */
export function accesoDe(puesto, seccion) {
  return MATRIZ[puesto]?.[seccion] || NADA;
}

/** Si la ve, en la medida que sea. */
export function puedeVer(puesto, seccion) {
  return accesoDe(puesto, seccion) !== NADA;
}

/** Si además la puede tocar. */
export function puedeEditar(puesto, seccion) {
  return accesoDe(puesto, seccion) === COMPLETO;
}

/**
 * Las secciones que le tocan, en el orden en que se muestran.
 *
 * El dueño ve Equipo aunque su puesto diga lectura: repartir accesos es del
 * `rol`, no del puesto, y son dos preguntas distintas.
 */
export function seccionesDe(puesto, { esDuenio = false } = {}) {
  const todas = [
    { id: 'planes', label: 'Planes y precios' },
    { id: 'negocios', label: 'Negocios' },
    { id: 'equipo', label: 'Equipo' },
  ];
  return todas.filter((s) => {
    if (s.id === 'equipo') return esDuenio;
    return puedeVer(puesto, s.id);
  });
}

/** Dónde cae al entrar: su pantalla si la tiene, y si no, la primera que vea. */
export function pantallaInicial(puesto, { esDuenio = false } = {}) {
  const disponibles = seccionesDe(puesto, { esDuenio }).map((s) => s.id);
  const preferida = PUESTOS[puesto]?.abreEn;
  if (preferida && disponibles.includes(preferida)) return preferida;
  return disponibles[0] || null;
}

/** Cómo se llama el puesto en pantalla. */
export function etiquetaDePuesto(puesto) {
  return PUESTOS[puesto]?.label || puesto || '—';
}
