// src/modules/paises.js
// Donde opera el negocio. Tercer eje del alta, junto a rubro y modo (6a).
//
// El pais NO es un selector decorativo: es el punto de entrada del adaptador
// fiscal. Define moneda, zona horaria, como se llama el identificador fiscal
// y que IVA se propone. Todo lo demas del sistema le pregunta a este archivo
// en vez de asumir Argentina.
//
// LA DISTINCION QUE IMPORTA
// Elegir el pais es barato: son constantes. Facturar en ese pais es caro: es
// una integracion completa y distinta por pais (ARCA en AR, SII en CL, DIAN
// en CO, SAT en MX). Por eso `fiscal` es null en casi todos: el pais se puede
// elegir, pero el modulo de facturacion solo aparece donde hay adaptador de
// verdad. Anunciar "multi-pais" sin esto es vender un sistema que no factura
// en ningun lado.
//
// Los ids son ISO 3166-1 alfa-2 y son los mismos que el CHECK de
// `tenants.country` (platform/migrations/0039).

export const PAISES = {
  AR: {
    id: 'AR',
    label: 'Argentina',
    currency: 'ARS',
    timezone: 'America/Argentina/Buenos_Aires',
    // Como se llama el numero que identifica a una empresa. Cambia la etiqueta
    // de un campo que el dueño ve todos los dias.
    idFiscal: 'CUIT',
    ivaDefault: 21,
    // El unico con integracion real. Ver supabase/functions/afip-invoice.
    fiscal: 'arca',
  },
  UY: { id: 'UY', label: 'Uruguay',  currency: 'UYU', timezone: 'America/Montevideo',   idFiscal: 'RUT',  ivaDefault: 22, fiscal: null },
  CL: { id: 'CL', label: 'Chile',    currency: 'CLP', timezone: 'America/Santiago',     idFiscal: 'RUT',  ivaDefault: 19, fiscal: null },
  PY: { id: 'PY', label: 'Paraguay', currency: 'PYG', timezone: 'America/Asuncion',     idFiscal: 'RUC',  ivaDefault: 10, fiscal: null },
  BO: { id: 'BO', label: 'Bolivia',  currency: 'BOB', timezone: 'America/La_Paz',       idFiscal: 'NIT',  ivaDefault: 13, fiscal: null },
  PE: { id: 'PE', label: 'Perú',     currency: 'PEN', timezone: 'America/Lima',         idFiscal: 'RUC',  ivaDefault: 18, fiscal: null },
  CO: { id: 'CO', label: 'Colombia', currency: 'COP', timezone: 'America/Bogota',       idFiscal: 'NIT',  ivaDefault: 19, fiscal: null },
  MX: { id: 'MX', label: 'México',   currency: 'MXN', timezone: 'America/Mexico_City',  idFiscal: 'RFC',  ivaDefault: 16, fiscal: null },
  ES: { id: 'ES', label: 'España',   currency: 'EUR', timezone: 'Europe/Madrid',        idFiscal: 'NIF',  ivaDefault: 21, fiscal: null },
};

export const PAIS_POR_DEFECTO = 'AR';

/**
 * El pais de un tenant. Cae en Argentina ante un valor desconocido: es el
 * pais con el que nacio la plataforma y el unico con adaptador fiscal. Un
 * pais invalido no deberia llegar (hay CHECK en la DB), pero si llega, un
 * panel usable es mejor que una pantalla en blanco.
 */
export function getPais(country) {
  return PAISES[String(country || '').toUpperCase()] || PAISES[PAIS_POR_DEFECTO];
}

/** Moneda que propone este pais. El negocio la puede cambiar: hay rubros que
 *  costean en dolares y venden en moneda local. */
export function monedaDe(country) {
  return getPais(country).currency;
}

/** Zona horaria del pais. En 6b la de la sucursal tiene prioridad sobre esta. */
export function zonaDe(country) {
  return getPais(country).timezone;
}

/** Como se llama el identificador fiscal aca: CUIT, RUT, RFC, NIT... */
export function idFiscalDe(country) {
  return getPais(country).idFiscal;
}

/** ¿Este pais puede emitir comprobantes hoy? Solo donde hay adaptador real. */
export function facturaEn(country) {
  return getPais(country).fiscal != null;
}

/** Que adaptador fiscal usar, o null si en este pais todavia no se factura. */
export function adaptadorFiscal(country) {
  return getPais(country).fiscal;
}

/** Lista para el selector del alta. `factura` permite avisar en la UI que en
 *  ese pais todavia no se emiten comprobantes, en vez de prometerlo. */
export function paisesDisponibles() {
  return Object.values(PAISES).map(p => ({
    id: p.id, label: p.label, currency: p.currency, factura: p.fiscal != null,
  }));
}
