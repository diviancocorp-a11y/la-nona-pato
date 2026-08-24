/**
 * El panel del fundador: dónde poner el tiempo hoy.
 *
 * ── SÓLO LEE LO QUE EL SISTEMA YA SABE ──
 * Nada de prospectos ni demos cargados a mano. Esos datos no tienen sistema de
 * registro —los tipearía una persona— y una pantalla para tipear lo que ya
 * sabés es exactamente el trabajo que el plan prohíbe. Con doce prospectos eso
 * es una planilla.
 *
 * La regla operativa: **el día que una fila de este panel pida que la cargues,
 * el panel se rompió.** Todo lo de acá sale de `tenants` y `plans`, que se
 * llenan solos.
 *
 * ── PRIMER VALOR, NO PRIMER PEDIDO ──
 * `first_order_at` marca el primer pedido CREADO: alguien probó. `first_value_at`
 * marca el primero COBRADO: a alguien le sirvió. Son dos hitos distintos y
 * confundirlos hace que un negocio que probó una vez y se fue figure como
 * activado.
 *
 * El rubro no cambia cómo se detecta —un turno de barbería ya es un pedido con
 * recurso— sino cómo se lo nombra en pantalla.
 *
 * ── PURO ──
 * Sin fechas implícitas ni consultas: recibe `ahora` para que los tests no
 * dependan del reloj de quien los corra.
 */

const DIA = 86400000;

/** Cómo se llama el primer valor en cada rubro. */
export function nombreDelPrimerValor(vertical) {
  return ({
    gastro: 'primer pedido cobrado',
    barber: 'primer turno cobrado',
    retail: 'primera venta',
  })[vertical] || 'primera operación cobrada';
}

function dias(desde, hasta) {
  if (!desde) return null;
  return Math.floor((hasta.getTime() - new Date(desde).getTime()) / DIA);
}

/** Lo que este negocio le debería costar a Dico por mes, según su plan y ciclo. */
export function mensualDe(negocio, planes) {
  const plan = (planes || []).find((p) => p.id === negocio.plan_id);
  if (!plan) return 0;
  // El ciclo anual se normaliza a mes: el MRR compara peras con peras, y un
  // cliente anual que pagó por adelantado sigue valiendo su parte cada mes.
  return Number(
    negocio.ciclo === 'anual'
      ? (plan.precio_anual_por_mes ?? plan.precio_mensual)
      : plan.precio_mensual,
  ) || 0;
}

/** Si hoy está pagando: tiene plan y la fecha hasta la que pagó no venció. */
export function estaPago(negocio, ahora) {
  if (!negocio.plan_id || negocio.status === 'cancelado') return false;
  return !!negocio.paga_hasta && new Date(negocio.paga_hasta) > ahora;
}

/**
 * Lo que hay que resolver, ordenado por urgencia.
 *
 * Cada fila dice QUÉ pasa y HACE CUÁNTO. El número de días es lo que convierte
 * "este negocio está flojo" en algo sobre lo que se puede actuar.
 */
export function pendientesDe(negocios, ahora) {
  const filas = [];

  for (const n of negocios || []) {
    const sinActividad = dias(n.last_activity_at, ahora);
    const desdeElAlta = dias(n.activated_at || n.created_at, ahora);
    const paraVencer = n.paga_hasta
      ? Math.ceil((new Date(n.paga_hasta).getTime() - ahora.getTime()) / DIA)
      : null;

    if (n.status === 'cancelado') continue;

    // Mora: lo más urgente que hay, porque es plata vendida que no entró.
    if (n.plan_id && paraVencer !== null && paraVencer < 0) {
      filas.push({
        slug: n.slug, nombre: n.name, urgencia: 'alta',
        que: 'en mora', dias: Math.abs(paraVencer),
        detalle: `venció hace ${Math.abs(paraVencer)} ${Math.abs(paraVencer) === 1 ? 'día' : 'días'}`,
      });
    } else if (n.plan_id && paraVencer !== null && paraVencer <= 7) {
      filas.push({
        slug: n.slug, nombre: n.name, urgencia: 'media',
        que: 'por vencer', dias: paraVencer,
        detalle: paraVencer === 0 ? 'vence hoy' : `vence en ${paraVencer} días`,
      });
    }

    // Sin llegar al primer valor. Es la señal más importante del arranque: un
    // negocio que no cobró nada todavía no sabe para qué sirve Dico.
    if (!n.first_value_at && desdeElAlta !== null && desdeElAlta >= 3) {
      filas.push({
        slug: n.slug, nombre: n.name,
        urgencia: desdeElAlta >= 14 ? 'alta' : 'media',
        que: 'sin primer valor', dias: desdeElAlta,
        detalle: `${desdeElAlta} días sin ${nombreDelPrimerValor(n.vertical)}`,
      });
    }

    // Se apagó. Sólo cuenta para los que ya habían arrancado: un negocio que
    // nunca operó no "dejó de operar", y mezclarlos esconde a los dos.
    if (n.first_value_at && sinActividad !== null && sinActividad >= 14) {
      filas.push({
        slug: n.slug, nombre: n.name,
        urgencia: sinActividad >= 30 ? 'alta' : 'media',
        que: 'sin actividad', dias: sinActividad,
        detalle: `${sinActividad} días sin operar`,
      });
    }
  }

  const peso = { alta: 0, media: 1 };
  return filas.sort((a, b) => (peso[a.urgencia] - peso[b.urgencia]) || (b.dias - a.dias));
}

/**
 * Los seis números.
 *
 * `medianaAlPrimerValor` va en mediana y no en promedio: con pocos negocios, uno
 * que tardó seis meses corre el promedio y hace parecer que el producto no se
 * entiende, cuando el resto arrancó en dos días.
 */
export function cifrasDe(negocios, planes, ahora) {
  const vivos = (negocios || []).filter((n) => n.status !== 'cancelado');
  const conValor = vivos.filter((n) => n.first_value_at);

  const demoras = conValor
    .map((n) => dias(n.activated_at || n.created_at, new Date(n.first_value_at)))
    .filter((d) => d !== null && d >= 0)
    .sort((a, b) => a - b);

  const medio = demoras.length
    ? (demoras.length % 2
      ? demoras[(demoras.length - 1) / 2]
      : Math.round((demoras[demoras.length / 2 - 1] + demoras[demoras.length / 2]) / 2))
    : null;

  const pagos = vivos.filter((n) => estaPago(n, ahora));

  return {
    negocios: vivos.length,
    llegaronAlPrimerValor: conValor.length,
    medianaAlPrimerValor: medio,
    clientesPagos: pagos.length,
    mrr: pagos.reduce((t, n) => t + mensualDe(n, planes), 0),
    enMora: vivos.filter((n) => (
      n.plan_id && n.paga_hasta && new Date(n.paga_hasta) <= ahora
    )).length,
  };
}

/** Todo junto, que es como lo consume la pantalla. */
export function panelDeHoy(negocios, planes, ahora = new Date()) {
  return {
    cifras: cifrasDe(negocios, planes, ahora),
    pendientes: pendientesDe(negocios, ahora),
  };
}
