// src/modules/dico/reglas.js
// Dico, capa 2: lo que el negocio ya sabe pero nadie le esta preguntando.
// Ver platform/PLAN-DICO.md.
//
// SIN IA y sin consultas nuevas: son funciones PURAS sobre los datos que el
// panel ya tiene en memoria, igual que `useFinancials` en el legacy y que el
// costeo de recetas. Eso no es una limitacion, son las tres garantias que
// hacen que esto se pueda mostrar sin miedo:
//   - no puede alucinar: cada aviso sale de una cuenta que se puede leer aca;
//   - no puede filtrar entre negocios: no consulta nada, recibe lo que el
//     panel ya acoto por tenant_id;
//   - no cuesta un peso por uso.
//
// Reglas de estilo de los avisos, que importan mas que el codigo:
//   1. Cada aviso dice QUE HACER, no solo que esta mal. Un tablero que
//      enumera problemas sin salida se deja de mirar a la semana.
//   2. Se ordenan por gravedad y se cortan. Veinte avisos son cero avisos.
//   3. Nunca se afirma lo que no se puede calcular. Si falta el dato, el
//      aviso es "falta el dato", no una estimacion.
//   4. Hablan el idioma del rubro: lo dice el registry, no un if por vertical.

import { terminologia, usaReceta, usaContabilidadUsar } from '../registry';
import { indexarInsumos, costoReceta } from '../../services/platformRecipes';

/* Gravedad. El numero solo existe para ordenar. */
export const PESO_NIVEL = { alerta: 3, aviso: 2, sugerencia: 1 };

/** Cuantos se muestran de una. Ver regla 2. */
export const MAX_AVISOS = 4;

/**
 * Numero "de verdad": null, undefined y '' NO son 0.
 * Es el bug que ya costo dos veces en este repo (el colchon de merma que no
 * se aplicaba, el precio vacio): `Number(null)` es 0, asi que un campo sin
 * cargar se lee como un cero explicito y la cuenta sale mal sin fallar.
 */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function crear(nivel, id, titulo, detalle, ir) {
  return { id, nivel, titulo, detalle, ir: ir || null };
}

const plural = (n, singular, plural_) => `${n} ${n === 1 ? singular : plural_}`;

/* ───────────────────────────── Las reglas ───────────────────────────── */
//
// Cada una recibe el contexto entero y devuelve un aviso o null. Se agregan
// aca y nada mas: el orden final lo decide la gravedad, no la posicion.

const REGLAS = [
  /* ── Catalogo vacio: el caso del tenant recien creado ── */
  function catalogoVacio({ productos, vertical }) {
    if (productos.length > 0) return null;
    const t = terminologia(vertical);
    return crear(
      'alerta', 'catalogo-vacio',
      `Todavía no cargaste ningún ${t.singular}`,
      'Sin catálogo tu página no muestra nada y no podés recibir pedidos.',
      { tab: 'products', texto: t.nuevo },
    );
  },

  /* ── Todo el catalogo apagado ── */
  function nadaVisible({ productos, vertical }) {
    if (productos.length === 0) return null;
    if (productos.some(p => p.active !== false)) return null;
    const t = terminologia(vertical);
    return crear(
      'alerta', 'nada-visible',
      `Ninguno de tus ${t.plural.toLowerCase()} está visible`,
      'Están todos apagados, así que tu página se ve vacía para el cliente.',
      { tab: 'products', texto: 'Revisar' },
    );
  },

  /* ── Visible y sin precio: se puede pedir gratis ── */
  function sinPrecio({ productos, vertical }) {
    const rotos = productos.filter(p => p.active !== false && !(num(p.price) > 0));
    if (rotos.length === 0) return null;
    const t = terminologia(vertical);
    return crear(
      'alerta', 'sin-precio',
      `${plural(rotos.length, `${t.singular} está`, `${t.plural.toLowerCase()} están`)} sin precio`,
      `Se pueden pedir en $0: ${listar(rotos.map(p => p.name))}.`,
      { tab: 'products', texto: 'Poner precio' },
    );
  },

  /* ── Margen negativo: perdes plata en cada venta ── */
  function margenNegativo({ productos, insumos, recetas, settings, vertical }) {
    if (!usaReceta(vertical) || !recetas) return null;
    const porId = indexarInsumos(insumos);
    const perdida = productos.filter(p => {
      const lineas = recetas.get?.(p.id);
      if (!lineas?.length) return false;
      const precio = num(p.price);
      if (precio === null || precio <= 0) return false;   // ya lo dice sinPrecio
      return costoReceta(lineas, porId, settings) > precio;
    });
    if (perdida.length === 0) return null;
    return crear(
      'alerta', 'margen-negativo',
      `${plural(perdida.length, 'producto te cuesta', 'productos te cuestan')} más de lo que cobrás`,
      `Perdés plata en cada venta de ${listar(perdida.map(p => p.name))}.`,
      { tab: 'products', texto: 'Ver costos' },
    );
  },

  /* ── Insumo en receta con costo 0: el costeo miente para abajo ── */
  function insumoSinCosto({ insumos, recetas, vertical }) {
    if (!usaReceta(vertical) || !recetas) return null;
    const enUso = new Set();
    for (const lineas of recetas.values?.() || []) {
      for (const l of lineas) enUso.add(l.ingredient_id);
    }
    const sinCosto = insumos.filter(i => enUso.has(i.id) && !(num(i.cost) > 0));
    if (sinCosto.length === 0) return null;
    return crear(
      'aviso', 'insumo-sin-costo',
      `${plural(sinCosto.length, 'insumo está', 'insumos están')} en $0 y se usa${sinCosto.length === 1 ? '' : 'n'} en recetas`,
      // Lo importante no es el 0: es que el margen que ves es mentira, y para
      // el lado peligroso (parece que ganás más de lo que ganás).
      `El costo y el margen de esos productos dan mejor de lo que son: ${listar(sinCosto.map(i => i.name))}.`,
      { tab: 'stock', texto: 'Cargar costos' },
    );
  },

  /* ── Stock bajo minimo ── */
  function stockBajo({ insumos }) {
    // Mismo criterio que `bajoMinimo` en platformInventory: sin minimo
    // cargado no hay nada que avisar (todo estaria "bajo").
    const bajos = insumos.filter(i => {
      const min = num(i.min_stock);
      const stock = num(i.stock) ?? 0;
      return min !== null && min > 0 && stock <= min;
    });
    if (bajos.length === 0) return null;
    return crear(
      'aviso', 'stock-bajo',
      `${plural(bajos.length, 'insumo está', 'insumos están')} en el mínimo o por debajo`,
      `Conviene reponer: ${listar(bajos.map(i => i.name))}.`,
      { tab: 'finanzas', texto: 'Registrar compra' },
    );
  },

  /* ── Producto sin receta: el margen no se puede calcular ── */
  function sinReceta({ productos, recetas, vertical }) {
    if (!usaReceta(vertical) || !recetas) return null;
    const activos = productos.filter(p => p.active !== false);
    if (activos.length === 0) return null;
    const sin = activos.filter(p => !recetas.get?.(p.id)?.length);
    if (sin.length === 0) return null;
    return crear(
      'sugerencia', 'sin-receta',
      `${plural(sin.length, 'producto no tiene', 'productos no tienen')} receta cargada`,
      'Sin receta no se puede saber cuánto te cuestan ni si te conviene el precio.',
      { tab: 'products', texto: 'Cargar receta' },
    );
  },

  /* ── Mes sin gastos: el P&L va a mentir ── */
  function mesSinGastos({ gastos, hoy }) {
    const diaDelMes = hoy.getDate();
    // Antes del 10 no hay nada que reclamar: puede ser simplemente temprano.
    if (diaDelMes < 10) return null;
    const mes = hoy.toISOString().slice(0, 7);
    if (gastos.some(g => String(g.date || '').startsWith(mes))) return null;
    return crear(
      'aviso', 'mes-sin-gastos',
      `Van ${diaDelMes} días del mes sin un solo gasto cargado`,
      'Si faltan gastos, cualquier número de ganancia que veas va a estar inflado.',
      { tab: 'finanzas', texto: 'Registrar gasto' },
    );
  },

  /* ── Insumos sin clasificar (solo gastronomia) ── */
  function insumoSinClasificar({ insumos, vertical }) {
    if (!usaContabilidadUsar(vertical)) return null;
    const sin = insumos.filter(i => !i.food_category);
    if (sin.length === 0) return null;
    return crear(
      'sugerencia', 'insumo-sin-clasificar',
      `${plural(sin.length, 'insumo no tiene', 'insumos no tienen')} tipo de comida`,
      'Se cuentan como "secos", así que el desglose de tu costo de comida sale corrido.',
      { tab: 'stock', texto: 'Clasificar' },
    );
  },
];

/** Nombres en texto, cortando la lista para que el aviso siga siendo legible. */
function listar(nombres, tope = 3) {
  const vistos = nombres.slice(0, tope).join(', ');
  const resto = nombres.length - tope;
  return resto > 0 ? `${vistos} y ${resto} más` : vistos;
}

/* ─────────────────────────── Entrada unica ──────────────────────────── */

/**
 * Los avisos de este negocio, ordenados por gravedad y cortados en MAX_AVISOS.
 *
 * Todo es opcional: mientras el panel esta cargando, las listas llegan vacias
 * y `recetas` llega en null. En ese estado NO se inventa nada — devolver
 * "cargá tu primer producto" a alguien que tiene cuarenta, porque todavia no
 * llego la respuesta, es peor que no decir nada.
 */
export function avisosDe({
  vertical,
  productos = [],
  insumos = [],
  recetas = null,
  gastos = [],
  settings = null,
  hoy = new Date(),
  listo = true,
} = {}) {
  if (!listo) return [];

  const ctx = { vertical, productos, insumos, recetas, gastos, settings, hoy };

  return REGLAS
    .map(regla => {
      try {
        return regla(ctx);
      } catch {
        // Una regla rota no puede tirar abajo el panel entero: Dico es
        // acompañamiento, no infraestructura.
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel])
    .slice(0, MAX_AVISOS);
}

/** Cuantas alertas hay (para el punto rojo de la nav). */
export function contarAlertas(avisos) {
  return (avisos || []).filter(a => a.nivel === 'alerta').length;
}
