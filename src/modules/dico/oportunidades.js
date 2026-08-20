/**
 * Dico, capa 3 — oportunidades (Etapa 6g del PLAN-LOCAL-Y-ROLES).
 *
 * LA DIFERENCIA CON `reglas.js`
 * Aquellas son de HIGIENE: "te falta el precio", "no cargaste nada". Dicen que
 * algo esta roto y el negocio ya sabe que lo esta. Estas son la segunda
 * familia: plata que se esta yendo sin que nadie la mire. Stock que no rota,
 * clientes que dejaron de venir, horas que quedaron sin vender.
 *
 *     detecta -> explica -> recomienda -> puede ejecutar
 *
 * EXPLICAR NO ES OPCIONAL
 * Cada oportunidad trae `porque` con los numeros que la produjeron: "vendio 83
 * en 4 semanas, quedan 29". Sin eso es una caja negra, y a una caja negra no
 * se le entrega un negocio. El producto es el copiloto, no el piloto: Dico
 * dice el numero y la decision la toma el duenio.
 *
 * Por eso `crear()` EXIGE `porque`. Una oportunidad sin cuenta que mostrar es
 * una corazonada, y una corazonada con cara de dato es peor que nada.
 *
 * MISMAS TRES GARANTIAS QUE LA CAPA 2
 * Funciones puras sobre lo que el panel ya tiene: no alucinan, no pueden
 * filtrar entre negocios, y no cuestan un peso por uso.
 *
 * LO QUE NO ENTRA Y POR QUE
 * "Sucursales desbalanceadas" figura en el plan y NO esta: hoy cada negocio
 * tiene una sola sucursal, asi que seria una regla que no puede dispararse
 * nunca. Entra cuando exista el segundo local.
 */

import { terminologia } from '../registry';

/** Cuantas se muestran. Menos que los avisos de higiene: lo roto va primero. */
export const MAX_OPORTUNIDADES = 2;

/** Debajo de esto no hay muestra suficiente para afirmar nada. */
const MINIMO_PARA_HABLAR = { ventas: 8, clientes: 4 };

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;

const dias = (n) => `${Math.round(n)} ${Math.round(n) === 1 ? 'día' : 'días'}`;

/**
 * `porque` es obligatorio: es la cuenta que produjo el aviso, en palabras.
 * `hacer` es la recomendacion concreta. Sin las dos, no es una oportunidad.
 */
function crear({ id, titulo, porque, hacer, impacto = null, ir = null }) {
  if (!porque || !hacer) return null;
  return { id, tipo: 'oportunidad', titulo, porque, hacer, impacto, ir };
}

function diasEntre(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 86400000;
}

/* ─────────────────────────── Las reglas ─────────────────────────── */

const REGLAS = [
  /**
   * Lo que ocupa lugar y no se vende.
   *
   * Se mira contra las ventas y no contra el stock porque el edificio todavia
   * no tiene modelo de costos por producto: lo que se puede afirmar sin
   * inventar es "esto esta publicado y nadie lo compra".
   */
  function noRota({ productos, ventas, hoy, vertical }) {
    if ((ventas || []).length < MINIMO_PARA_HABLAR.ventas) return null;
    const activos = (productos || []).filter(p => p.active !== false);
    if (activos.length < 3) return null;

    // Cuanto abarca la muestra: sin esto, un negocio de una semana se llevaria
    // un aviso diciendo que nada rota.
    const fechas = ventas.map(v => new Date(v.date || v.created_at)).filter(d => !isNaN(d));
    if (!fechas.length) return null;
    const desde = new Date(Math.min(...fechas));
    const ventana = diasEntre(hoy, desde);
    if (ventana < 21) return null;

    const vendidos = new Set(ventas.map(v => v.recipe_id).filter(Boolean));
    const quietos = activos.filter(p => !vendidos.has(p.id));
    if (!quietos.length) return null;

    const t = terminologia(vertical);
    const nombres = quietos.slice(0, 3).map(p => p.name).join(', ');
    return crear({
      id: 'no-rota',
      titulo: quietos.length === 1
        ? `${quietos[0].name} no se vendió ni una vez`
        : `${quietos.length} ${t.plural.toLowerCase()} no se venden`,
      porque: `En los últimos ${dias(ventana)} se vendieron ${vendidos.size} de tus `
        + `${activos.length} ${t.plural.toLowerCase()} publicados. Sin una sola venta: ${nombres}`
        + `${quietos.length > 3 ? ` y ${quietos.length - 3} más` : ''}.`,
      hacer: 'Revisá si vale la pena tenerlos publicados, cambiarles la foto o '
        + 'el precio. Ocupan lugar en la carta y le restan atención al resto.',
      ir: { tab: 'products', texto: 'Ver el catálogo' },
    });
  },

  /**
   * Plata parada en el deposito.
   *
   * Compara lo que vale el stock contra lo que el negocio consume por mes. Es
   * la cuenta que nadie hace y la que explica por que no hay caja aunque se
   * venda bien.
   */
  function capitalInmovilizado({ insumos, ventas, hoy }) {
    const conValor = (insumos || []).filter(i => num(i.stock) > 0 && num(i.cost) > 0);
    if (conValor.length < 3) return null;

    const valorStock = conValor.reduce((a, i) => a + num(i.stock) * num(i.cost), 0);
    if (valorStock <= 0) return null;

    // Costo de lo vendido en la ventana, para saber cuantos meses cubre.
    const conCosto = (ventas || []).filter(v => num(v.unit_cost) > 0);
    if (conCosto.length < MINIMO_PARA_HABLAR.ventas) return null;

    const fechas = conCosto.map(v => new Date(v.date || v.created_at)).filter(d => !isNaN(d));
    if (!fechas.length) return null;
    const ventana = diasEntre(hoy, new Date(Math.min(...fechas)));
    if (ventana < 21) return null;

    const consumido = conCosto.reduce((a, v) => a + num(v.unit_cost) * (num(v.qty) || 1), 0);
    const porDia = consumido / ventana;
    if (porDia <= 0) return null;

    const mesesDeStock = (valorStock / porDia) / 30;
    // Menos de dos meses de cobertura es operacion normal, no un problema.
    if (mesesDeStock < 2) return null;

    const masPesado = [...conValor]
      .sort((a, b) => (num(b.stock) * num(b.cost)) - (num(a.stock) * num(a.cost)))[0];

    return crear({
      id: 'capital-inmovilizado',
      titulo: `Tenés ${pesos(valorStock)} parados en stock`,
      porque: `A tu ritmo de consumo —${pesos(porDia * 30)} por mes— ese stock te `
        + `dura ${mesesDeStock.toFixed(1)} meses. Lo que más pesa es `
        + `${masPesado.name}: ${pesos(num(masPesado.stock) * num(masPesado.cost))}.`,
      hacer: 'Comprá menos y más seguido de lo que más pesa. Esa plata parada '
        + 'es plata que no está en la caja.',
      impacto: valorStock,
      ir: { tab: 'stock', texto: 'Ver el stock' },
    });
  },

  /**
   * Clientes que se estan yendo sin avisar.
   *
   * No es "hace mucho que no viene": es que ROMPIO SU PROPIA frecuencia. Un
   * cliente que compra cada tres meses no esta perdido al mes y medio, y
   * tratarlo como perdido es la forma mas rapida de mandar promociones que
   * molestan.
   */
  function fueraDeFrecuencia({ clientes, hoy }) {
    const recurrentes = (clientes || []).filter(c => (c.orders || 0) >= 3 && c.last_order);
    if (recurrentes.length < MINIMO_PARA_HABLAR.clientes) return null;

    const perdidos = [];
    for (const c of recurrentes) {
      const desdeUltima = diasEntre(hoy, c.last_order);
      // Frecuencia propia: cuantos dias suele pasar entre una compra y otra.
      const primera = c.first_order || null;
      const span = primera ? diasEntre(c.last_order, primera) : null;
      const frecuencia = span && c.orders > 1 ? span / (c.orders - 1) : null;
      if (!frecuencia || frecuencia <= 0) continue;
      if (desdeUltima > frecuencia * 2.5) {
        perdidos.push({ ...c, frecuencia, desdeUltima });
      }
    }
    if (!perdidos.length) return null;

    perdidos.sort((a, b) => (b.total || 0) - (a.total || 0));
    const p = perdidos[0];
    const enJuego = perdidos.reduce((a, c) => a + (c.total || 0), 0);

    return crear({
      id: 'fuera-de-frecuencia',
      titulo: perdidos.length === 1
        ? `${p.name || 'Un cliente habitual'} dejó de venir`
        : `${perdidos.length} clientes habituales dejaron de venir`,
      porque: `${p.name || 'El principal'} compraba cada ${dias(p.frecuencia)} y hace `
        + `${dias(p.desdeUltima)} que no vuelve. `
        + (perdidos.length === 1
          ? `Dejó ${pesos(enJuego)} en tu negocio.`
          : `Entre los ${perdidos.length} dejaron ${pesos(enJuego)} en tu negocio.`),
      hacer: 'Escribiles antes de que se acostumbren a otro lado. Son los que '
        + 'más barato sale recuperar: ya te conocen.',
      impacto: enJuego,
      ir: { tab: 'crm', texto: 'Ver clientes' },
    });
  },

  /**
   * Horas de salon que quedaron sin vender.
   *
   * Es la pregunta que ninguna pantalla de ventas contesta: lo vendido se ve,
   * lo que se pudo vender y no, no.
   */
  function ocupacionBaja({ utilizacion, vertical }) {
    const pct = num(utilizacion?.utilizacion_pct);
    const disponibles = num(utilizacion?.horas_disponibles);
    const vendidas = num(utilizacion?.horas_vendidas);
    if (pct === null || disponibles === null || vendidas === null) return null;
    if (disponibles <= 0) return null;
    if (pct >= 55) return null;

    const libres = Math.max(0, disponibles - vendidas);
    if (libres < 4) return null;

    const t = terminologia(vertical);
    return crear({
      id: 'ocupacion-baja',
      titulo: `Te quedaron ${Math.round(libres)} horas sin vender`,
      porque: `De ${Math.round(disponibles)} horas de capacidad vendiste `
        + `${Math.round(vendidas)}: ${Math.round(pct)}%.`,
      hacer: `Mirá en qué franjas se vacía el salón y movés ahí lo que quieras `
        + `empujar. Las ${t.plural.toLowerCase()} vacías no se guardan para mañana.`,
      ir: { tab: 'mesas', texto: 'Ver el salón' },
    });
  },

  /**
   * Gente que se fue sin que la atiendan.
   *
   * `waitlist_entries` con status 'left' es demanda que llego a la puerta y se
   * fue. Es el unico dato de demanda perdida que el negocio puede tener sin
   * adivinar.
   */
  function demandaPerdida({ esperaPerdida, hoy }) {
    const idas = (esperaPerdida || []).filter(w => w.status === 'left');
    if (idas.length < 3) return null;

    const fechas = idas.map(w => new Date(w.created_at)).filter(d => !isNaN(d));
    if (!fechas.length) return null;
    const ventana = Math.max(1, diasEntre(hoy, new Date(Math.min(...fechas))));
    const personas = idas.reduce((a, w) => a + (num(w.party_size) || 1), 0);

    return crear({
      id: 'demanda-perdida',
      titulo: `${personas} personas se fueron sin esperar`,
      porque: `${idas.length} grupos entraron a la lista de espera y se fueron `
        + `en los últimos ${dias(ventana)}.`,
      hacer: 'Fijate si es siempre la misma franja: puede ser cuestión de sumar '
        + 'una persona en ese turno, no de agrandar el local.',
      ir: { tab: 'mesas', texto: 'Ver el salón' },
    });
  },

  /**
   * Un producto que se vende mucho y deja poco.
   *
   * No es margen negativo —eso ya lo agarra la capa 2— sino el que trabaja
   * bien y rinde mal. Se compara contra la mediana del propio catalogo y no
   * contra un numero de manual, porque el margen sano de una parrilla no es
   * el de una barberia.
   */
  function margenFlaco({ ventas, productos, vertical }) {
    const conAmbos = (ventas || []).filter(v => num(v.unit_price) > 0 && num(v.unit_cost) > 0);
    if (conAmbos.length < MINIMO_PARA_HABLAR.ventas) return null;

    const porProducto = new Map();
    for (const v of conAmbos) {
      const id = v.recipe_id;
      if (!id) continue;
      const prev = porProducto.get(id) || { qty: 0, ingreso: 0, costo: 0 };
      const q = num(v.qty) || 1;
      prev.qty += q;
      prev.ingreso += num(v.unit_price) * q;
      prev.costo += num(v.unit_cost) * q;
      porProducto.set(id, prev);
    }
    if (porProducto.size < 3) return null;

    const filas = [...porProducto.entries()].map(([id, d]) => ({
      id,
      qty: d.qty,
      margen: d.ingreso > 0 ? ((d.ingreso - d.costo) / d.ingreso) * 100 : null,
      ganancia: d.ingreso - d.costo,
    })).filter(f => f.margen !== null);
    if (filas.length < 3) return null;

    const ordenados = [...filas].sort((a, b) => a.margen - b.margen);
    const mediana = ordenados[Math.floor(ordenados.length / 2)].margen;

    // El mas vendido de los que rinden bastante menos que la mediana.
    const flacos = filas
      .filter(f => f.margen < mediana - 15)
      .sort((a, b) => b.qty - a.qty);
    if (!flacos.length) return null;

    const f = flacos[0];
    const prod = (productos || []).find(p => p.id === f.id);
    if (!prod) return null;

    return crear({
      id: 'margen-flaco',
      titulo: `${prod.name} vende bien y deja poco`,
      porque: `Vendiste ${f.qty} y te dejan ${Math.round(f.margen)}% de margen, `
        + `cuando el resto de tu ${terminologia(vertical).plural.toLowerCase()} `
        + `deja ${Math.round(mediana)}%.`,
      hacer: 'Subile el precio o bajale el costo. Es el que más movés, así que '
        + 'cada punto de margen ahí vale más que en cualquier otro.',
      impacto: f.ganancia,
      ir: { tab: 'products', texto: 'Ver el catálogo' },
    });
  },
];

/**
 * Las oportunidades de este negocio, ordenadas por lo que hay en juego.
 *
 * Sin `listo` no devuelve nada: un panel a medio cargar produciria avisos que
 * desaparecen solos, y eso destruye la confianza mas rapido que no avisar.
 */
export function oportunidadesDe({
  vertical,
  productos = [],
  insumos = [],
  ventas = [],
  clientes = [],
  utilizacion = null,
  esperaPerdida = [],
  hoy = new Date(),
  listo = true,
} = {}) {
  if (!listo) return [];

  const ctx = {
    vertical, productos, insumos, ventas, clientes, utilizacion,
    esperaPerdida, hoy,
  };

  return REGLAS
    .map(regla => {
      try {
        return regla(ctx);
      } catch {
        // Una regla rota no puede tirar abajo el panel: Dico acompaña, no
        // sostiene. Mismo criterio que la capa 2.
        return null;
      }
    })
    .filter(Boolean)
    // Primero lo que mas plata mueve. Las que no saben cuanto van al final:
    // no se inventa un impacto para poder ordenar.
    .sort((a, b) => (b.impacto ?? -1) - (a.impacto ?? -1))
    .slice(0, MAX_OPORTUNIDADES);
}
