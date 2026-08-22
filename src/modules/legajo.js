/**
 * Qué datos tiene que tener el legajo de alguien del equipo de Dico.
 *
 * NO ES UNA LISTA FIJA
 * Depende de tres cosas, y por eso no puede ser un array suelto:
 *
 *   país       decide el documento, cómo se llama la identificación fiscal y
 *              qué datos de cobro existen. Pedir "CUIL" a alguien de Colombia
 *              es pedirle un dato que no existe;
 *   documento  decide si hay dorso. Un pasaporte no tiene reverso, y exigirlo
 *              deja a la persona trabada sin manera de destrabarse;
 *   modalidad  decide si hace falta el legajo laboral entero.
 *
 * ── EMPLEADO Y CONTRATISTA NO SON LO MISMO ──
 * Alguien en relación de dependencia necesita legajo: domicilio, documento,
 * dónde se le deposita el sueldo. Alguien que factura su servicio —el caso
 * típico de un contratista remoto— no: de esa persona hace falta con qué
 * facturarle y a dónde pagarle, y nada más. Pedirle el domicilio y un contacto
 * de emergencia es pedirle datos personales que la empresa no tiene por qué
 * tener, y encima frena un alta que debería tomar dos minutos.
 *
 * La modalidad la fija el DUEÑO al dar el acceso, no la persona: en qué
 * relación está alguien con la empresa es una decisión de la empresa, no una
 * autodeclaración.
 *
 * ── ESTA ESCRITO DOS VECES A PROPOSITO ──
 * Acá y en `legajo_completo()` (migración 0055). La pantalla usa esta versión
 * para decir qué falta mientras la persona escribe; el servidor usa la suya
 * para sellar `completado_at`, que es el flag que abre la consola. Si sólo
 * existiera la del navegador, entrar sería cuestión de mandar un request a
 * mano. Hay un test que compara las dos parseando la migración.
 */
import {
  tieneDorso, etiquetaFiscal, camposDeCobro, nombreDePais,
} from './documentacionPorPais';

export const MODALIDADES = {
  empleado: {
    id: 'empleado',
    label: 'En relación de dependencia',
    descripcion: 'Cobra sueldo. Necesita legajo completo.',
  },
  contratista: {
    id: 'contratista',
    label: 'Factura sus servicios',
    descripcion: 'Emite factura. Sólo hacen falta sus datos fiscales y de cobro.',
  },
};

export const MODALIDAD_POR_DEFECTO = 'empleado';

/** Lo que se pide siempre, sea quien sea. */
const IDENTIDAD = {
  nombre: 'nombre',
  apellido: 'apellido',
  pais: 'país',
  fecha_nacimiento: 'fecha de nacimiento',
  tipo_documento: 'tipo de documento',
  numero_documento: 'número de documento',
  doc_frente_path: 'foto del documento (frente)',
};

/** Lo que se pide sólo en relación de dependencia. */
const DOMICILIO = {
  calle: 'calle',
  altura: 'altura',
  localidad: 'localidad',
  provincia: 'provincia',
  codigo_postal: 'código postal',
  telefono: 'teléfono',
};

/**
 * Los campos obligatorios para ESTE legajo, con el nombre que ve la persona.
 *
 * Devuelve un objeto campo → etiqueta, no una lista, porque quien lo consume
 * necesita las dos cosas: saber si falta, y cómo llamarlo al decirlo.
 */
export function obligatoriosDe(legajo, modalidad = MODALIDAD_POR_DEFECTO) {
  const pais = legajo?.pais;
  const campos = { ...IDENTIDAD };

  campos.identificacion_fiscal = etiquetaFiscal(pais);

  // El dorso sólo si ese documento lo tiene.
  if (tieneDorso(pais, legajo?.tipo_documento)) {
    campos.doc_dorso_path = 'foto del documento (dorso)';
  }

  if (modalidad === 'empleado') Object.assign(campos, DOMICILIO);

  // Los de cobro los declara el país: acá es CBU, afuera IBAN y SWIFT.
  // La etiqueta va TAL CUAL: pasarla a minúsculas convertía "CBU o CVU" en
  // "cbu o cvu", y una sigla en minúscula se lee como un error de tipeo.
  for (const c of camposDeCobro(pais)) {
    if (c.requerido) campos[campoDeCobro(c.id)] = c.label;
  }
  campos.titular_cuenta = 'titular de la cuenta';

  return campos;
}

/** El id del campo de cobro del país → la columna donde se guarda. */
export function campoDeCobro(id) {
  return ({
    numero: 'cuenta_numero',
    alias: 'cuenta_alias',
    banco: 'cuenta_banco',
    swift: 'cuenta_swift',
  })[id] || `cuenta_${id}`;
}

function cargado(v) {
  return String(v ?? '').trim() !== '';
}

/** Los que faltan, con el nombre que ve la persona. */
export function faltantesDelLegajo(legajo, modalidad = MODALIDAD_POR_DEFECTO) {
  return Object.entries(obligatoriosDe(legajo, modalidad))
    .filter(([campo]) => !cargado(legajo?.[campo]))
    .map(([, etiqueta]) => etiqueta);
}

/**
 * Si está completo.
 *
 * OJO: esto decide qué se DIBUJA. Quien decide si se entra es
 * `completado_at`, que lo sella el servidor.
 */
export function legajoCompleto(legajo, modalidad = MODALIDAD_POR_DEFECTO) {
  return faltantesDelLegajo(legajo, modalidad).length === 0;
}

/**
 * Cómo se llena el titular de la cuenta.
 *
 * La cuenta tiene que estar a nombre de la persona: depositar el sueldo de
 * alguien en la cuenta de un tercero es la forma más silenciosa de que ese
 * sueldo no llegue. La excepción real es el contratista que factura como
 * empresa, y ahí el titular es la razón social — por eso se destraba con un
 * tilde y no se deja escribir libre desde el principio.
 */
export function titularSugerido(legajo) {
  const n = String(legajo?.nombre ?? '').trim();
  const a = String(legajo?.apellido ?? '').trim();
  return [n, a].filter(Boolean).join(' ');
}

/** El país sale del legajo y ya: el domicilio no vive en otro país que la persona. */
export function nombreDelPais(legajo) {
  return nombreDePais(legajo?.pais);
}
