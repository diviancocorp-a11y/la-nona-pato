// src/lib/idempotencia.js
// Claves de idempotencia para las operaciones que mueven plata o stock.
//
// EL PROBLEMA
// Un doble click, un tap fantasma en un telefono lento o un reintento de red
// mandan la MISMA operacion dos veces. Sin clave, el server no puede saber si
// son dos pedidos o uno repetido: crea dos, cobra dos, descuenta dos.
//
// POR QUE LA CLAVE SE ATA AL CONTENIDO
// Es lo unico que distingue "lo mande de nuevo" de "esto es otra cosa":
//
//   generar una por llamada     -> dos clicks = dos claves = no sirve de nada
//   guardar una por sesion      -> la segunda compra del dia devuelve la primera
//   derivarla del contenido     -> el reintento la repite, un pedido nuevo no
//
// El server la trata como opcional: un cliente que no la manda sigue
// funcionando, pero pierde la garantia. Ver platform/migrations/0040.

const _claves = new Map();   // scope -> { firma, clave }

/** UUID v4, o null donde el navegador no lo tenga (la garantia se pierde, la
 *  operacion no: el server ignora una clave que no sea UUID). */
function nuevoUuid() {
  try {
    return globalThis.crypto?.randomUUID?.() || null;
  } catch {
    return null;
  }
}

/**
 * Clave estable mientras el contenido no cambie.
 *
 * @param {string} scope  Que operacion es: 'checkout', 'merma', 'compra'.
 * @param {unknown} contenido  Lo que define que esta operacion es "la misma".
 *                             Tiene que ser serializable.
 * @returns {string|null}
 */
export function claveDeIdempotencia(scope, contenido) {
  const firma = JSON.stringify(contenido);
  const previa = _claves.get(scope);
  if (previa && previa.firma === firma) return previa.clave;
  const clave = nuevoUuid();
  _claves.set(scope, { firma, clave });
  return clave;
}

/**
 * Olvida la clave de un scope. Se usa cuando el usuario empieza una operacion
 * nueva a proposito y quiere que sea otra aunque el contenido coincida —
 * cargar dos veces la misma merma del mismo insumo, por ejemplo, que es
 * legitimo: se rompieron dos.
 */
export function reiniciarClave(scope) {
  _claves.delete(scope);
}
