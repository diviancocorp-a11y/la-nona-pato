/**
 * Qué documentación pide cada país para incorporar a una PERSONA.
 *
 * NO SE MEZCLA CON `paises.js`, Y ES A PROPOSITO
 * Aquel archivo describe el país donde opera un NEGOCIO: moneda, huso horario,
 * IVA y qué adaptador fiscal existe. Esto describe qué papeles hay que
 * presentar para incorporar a alguien al equipo de Dico. Son dos preguntas
 * distintas sobre el mismo país, y un cliente de Chile no tiene nada que ver
 * con un empleado chileno.
 *
 * Lo que sí se reusa es la LISTA de países y sus nombres: tener dos listas
 * distintas de países en el mismo repo es tener una que se olvida de crecer.
 *
 * ── POR QUE HACE FALTA ──
 * El legajo no es igual en todos lados. En Argentina el documento es el DNI y
 * tiene dorso; un pasaporte no. La identificación fiscal de una persona es
 * CUIL acá (no CUIT: ese es el de la empresa) y RUT en Chile. Los datos de
 * cobro cambian igual: CBU de 22 dígitos acá, IBAN afuera.
 *
 * Pedirle "CUIL" a alguien de Colombia es pedirle un dato que no existe.
 *
 * ── EL DEFAULT ES DELIBERADAMENTE FLOJO ──
 * Los países sin regla propia caen en una genérica: pasaporte o documento
 * nacional, la identificación fiscal que declara `paises.js` para ese país, y
 * datos de cobro internacionales. Adivinar mal la regla de un país es peor que
 * preguntar de forma genérica — un identificador validado con el largo
 * equivocado rechaza datos correctos, y la persona no tiene cómo saber por qué.
 */
import { PAISES, PAIS_POR_DEFECTO, getPais, idFiscalDe } from './paises';

export { PAIS_POR_DEFECTO };

/** Los tipos de documento que existen. Se comparten entre países. */
export const DOCUMENTOS = {
  dni: { id: 'dni', label: 'DNI', dorso: true },
  ci: { id: 'ci', label: 'Cédula de identidad', dorso: true },
  documento_nacional: { id: 'documento_nacional', label: 'Documento nacional', dorso: true },
  pasaporte: { id: 'pasaporte', label: 'Pasaporte', dorso: false },
};

const GENERICO = {
  documentos: ['pasaporte', 'documento_nacional'],
  cobro: {
    numero: { label: 'IBAN o número de cuenta' },
    banco: { label: 'Banco' },
    swift: { label: 'SWIFT / BIC' },
  },
};

/**
 * Lo propio de cada país. Lo que no figura acá usa `GENERICO`.
 *
 * Sólo se declara donde se sabe con certeza. Agregar un país es agregar una
 * entrada, y hasta que alguien la agregue el formulario sigue siendo usable.
 */
const REGLAS = {
  AR: {
    documentos: ['dni', 'pasaporte'],
    // CUIL, no CUIT: el de la empresa es otro número y `paises.js` declara ese.
    fiscal: { label: 'CUIL', digitos: 11 },
    cobro: {
      numero: { label: 'CBU o CVU', digitos: 22 },
      alias: { label: 'Alias', requerido: false },
      banco: { label: 'Banco', requerido: false },
    },
  },
  UY: { documentos: ['ci', 'pasaporte'] },
  CL: { documentos: ['ci', 'pasaporte'] },
  PY: { documentos: ['ci', 'pasaporte'] },
  BO: { documentos: ['ci', 'pasaporte'] },
  PE: { documentos: ['dni', 'pasaporte'] },
  CO: { documentos: ['ci', 'pasaporte'] },
  MX: { documentos: ['ci', 'pasaporte'] },
  ES: { documentos: ['dni', 'pasaporte'] },
};

function reglaDe(codigo) {
  return REGLAS[String(codigo || '').toUpperCase()] || {};
}

/** La lista para el selector, reusando los nombres de `paises.js`. */
export function paisesParaLegajo() {
  return Object.values(PAISES).map((p) => ({ id: p.id, label: p.label }));
}

/** Los documentos que ese país acepta, en el orden en que se ofrecen. */
export function documentosDe(codigo) {
  const ids = reglaDe(codigo).documentos || GENERICO.documentos;
  return ids.map((id) => DOCUMENTOS[id]).filter(Boolean);
}

/**
 * Si ese documento tiene dorso.
 *
 * Es la diferencia entre pedir una foto que existe y pedir una que no: un
 * pasaporte no tiene reverso que fotografiar, y exigirlo deja a la persona
 * trabada sin manera de destrabarse.
 */
export function tieneDorso(codigoPais, tipoDocumento) {
  const doc = documentosDe(codigoPais).find((d) => d.id === tipoDocumento);
  return !!doc?.dorso;
}

/** Cómo se llama la identificación fiscal de una PERSONA ahí. */
export function etiquetaFiscal(codigo) {
  return reglaDe(codigo).fiscal?.label || idFiscalDe(codigo);
}

function fiscalDe(codigo) {
  return reglaDe(codigo).fiscal || { label: etiquetaFiscal(codigo) };
}

function cobroDe(codigo) {
  return reglaDe(codigo).cobro || GENERICO.cobro;
}

/** Los campos de cobro de ese país, en el orden en que se muestran. */
export function camposDeCobro(codigo) {
  return Object.entries(cobroDe(codigo)).map(([id, def]) => ({
    id,
    label: def.label,
    digitos: def.digitos || null,
    // Sin `requerido: false` explícito va como obligatorio: es más seguro que
    // un campo nuevo nazca pedido y no que se cuele vacío sin que nadie note.
    requerido: def.requerido !== false,
  }));
}

/** El nombre del país, para mostrarlo. */
export function nombreDePais(codigo) {
  return getPais(codigo).label;
}

/**
 * Valida un campo de largo fijo. Devuelve el error o null.
 *
 * Se cuentan sólo los dígitos: la gente pega el CBU como se lo dio el banco,
 * con espacios o guiones, y rechazarlo por eso es rechazar un dato correcto
 * mal tipeado.
 */
export function validarDigitos(valor, digitos, etiqueta) {
  if (!digitos) return null;
  const solo = String(valor ?? '').replace(/\D/g, '');
  if (solo === '') return null; // que falte lo dice "faltan datos", no esto
  if (solo.length !== digitos) {
    return `El ${etiqueta} tiene ${digitos} dígitos y escribiste ${solo.length}.`;
  }
  return null;
}

/** Todos los errores de formato del legajo, según su país. */
export function erroresDeFormato(legajo) {
  const codigo = legajo?.pais;
  const errores = {};

  const f = fiscalDe(codigo);
  const fiscal = validarDigitos(legajo?.identificacion_fiscal, f.digitos, f.label);
  if (fiscal) errores.identificacion_fiscal = fiscal;

  const c = cobroDe(codigo).numero;
  const numero = validarDigitos(legajo?.cuenta_numero, c.digitos, c.label);
  if (numero) errores.cuenta_numero = numero;

  return errores;
}
