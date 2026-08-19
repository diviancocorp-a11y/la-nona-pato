// src/modules/registry.js
// Que es cada rubro: como se llama lo que vende, que campos carga y que
// modulos tiene.
//
// La regla: NINGUN componente pregunta `vertical === 'barber'`. Preguntan
// aca. Antes de este archivo la logica por rubro eran tres lineas sueltas
// dentro de ProductEditor; el problema no era esa version, era la de dentro
// de seis meses repartida en veinte archivos, donde saber que ve una
// barberia exige leer todo el codigo y agregar un rubro exige encontrar cada
// `if` sin olvidarse de ninguno.
//
// Es DATA, no UI: sin JSX ni imports de React. Los iconos y los componentes
// se mapean por id del lado del panel. Asi esto se puede leer desde un
// service, un test o un script sin arrastrar el arbol de React.
//
// Los ids de rubro son los mismos que el CHECK de `tenants.vertical`
// (platform/migrations/0001): gastro | barber | retail.

/* ───────────────────────────── Modulos ───────────────────────────── */

// Catalogo de todo lo que la plataforma puede tener. `implementado` es la
// unica fuente de verdad de que existe DE VERDAD hoy: el panel filtra por
// eso, asi que un modulo declarado pero a medio hacer no aparece en la nav
// de nadie. Cuando un modulo sale, se cambia el false por true en un solo
// lugar. De paso, la lista sirve de hoja de ruta legible.
export const MODULOS = {
  products: {
    id: 'products',
    label: 'Productos',      // lo pisa la terminologia del rubro
    implementado: true,
  },
  orders: {
    id: 'orders',
    label: 'Pedidos',
    implementado: true,
  },
  agenda: {
    id: 'agenda',
    label: 'Agenda',
    implementado: false,     // tablas staff + appointments listas (migracion 0005)
  },
  variants: {
    id: 'variants',
    label: 'Variantes',
    implementado: false,     // tabla product_variants lista (migracion 0007)
  },
  stock: {
    id: 'stock',
    label: 'Stock',
    implementado: true,      // Etapa 1 del PLAN-ERP (migracion 0026)
  },
  finanzas: {
    id: 'finanzas',
    label: 'Gastos',
    implementado: true,      // Etapa 3 del PLAN-ERP (migracion 0030)
  },
  ventas: {
    id: 'ventas',
    label: 'Ventas',
    implementado: true,      // Etapa 4 del PLAN-ERP (migracion 0032)
  },
  caja: {
    id: 'caja',
    label: 'Caja',
    implementado: true,      // Etapa 6d (migracion 0046)
    // Turno de caja, arqueo y cierre. Un negocio que solo vende a distancia
    // cobra, pero no abre ni cierra una caja fisica.
    requiereSalon: true,
  },
  mesas: {
    id: 'mesas',
    label: 'Salón',
    implementado: true,      // Etapa 6c (migracion 0045)
    requiereSalon: true,
  },
};

/* ───────────────────────────── Campos ────────────────────────────── */

// Campos del producto que son comunes a todos los rubros.
const CAMPOS_BASE = ['name', 'price', 'category', 'description', 'image_url', 'active'];

/* ───────────────────────────── Rubros ────────────────────────────── */

export const RUBROS = {
  gastro: {
    id: 'gastro',
    label: 'Gastronomía',
    // Como se llama lo que vende este rubro. Un plato no es un "servicio" y
    // un corte de pelo no es un "producto": la palabra cambia toda la pantalla.
    terminologia: {
      plural: 'Productos',
      singular: 'producto',
      nuevo: 'Nuevo producto',
      buscar: 'Buscar producto...',
      ejemplo: 'Milanesa napolitana',
      ejemploCategoria: 'Principales',
    },
    productType: 'simple',
    campos: [...CAMPOS_BASE, 'requires_age_gate'],
    // Un plato se arma con insumos y por eso tiene costo real. Un corte de
    // pelo y una remera no: su costo no sale de una receta.
    receta: true,
    // USAR (Uniform System of Accounts for Restaurants) es el plan de cuentas
    // de la gastronomia: separa comida, packaging y personal de cocina. A una
    // barberia no se le pide clasificar un gasto en "Comida — Lacteos".
    contabilidadUsar: true,
    modulos: ['products', 'orders', 'stock', 'finanzas', 'ventas', 'caja', 'mesas'],
  },

  barber: {
    id: 'barber',
    label: 'Barbería y salones',
    terminologia: {
      plural: 'Servicios',
      singular: 'servicio',
      nuevo: 'Nuevo servicio',
      buscar: 'Buscar servicio...',
      ejemplo: 'Corte de pelo',
      ejemploCategoria: 'Cortes',
    },
    // Un turno no es un producto: el tipo lo distingue en la misma tabla.
    productType: 'service',
    // Sin requires_age_gate: un corte de pelo no se restringe por edad.
    campos: [...CAMPOS_BASE, 'duration_min'],
    // Stock SI, receta no. Una barberia compra gel, toallas y repuestos, y
    // necesita saber cuando se le acaban — eso es una compra que ingresa
    // mercaderia, no un gasto suelto. Lo que no tiene es una receta que diga
    // cuanto gel lleva un corte: por eso `receta` sigue sin estar.
    modulos: ['products', 'orders', 'agenda', 'stock', 'finanzas', 'ventas', 'caja'],
  },

  retail: {
    id: 'retail',
    label: 'Indumentaria y retail',
    terminologia: {
      plural: 'Artículos',
      singular: 'artículo',
      nuevo: 'Nuevo artículo',
      buscar: 'Buscar artículo...',
      ejemplo: 'Remera oversize',
      ejemploCategoria: 'Remeras',
    },
    productType: 'simple',
    campos: [...CAMPOS_BASE, 'stock', 'requires_age_gate'],
    modulos: ['products', 'orders', 'variants', 'stock', 'finanzas', 'ventas', 'caja'],
  },
};

export const RUBRO_POR_DEFECTO = 'gastro';

/* ──────────────────────────── Helpers ────────────────────────────── */

/**
 * El rubro de un tenant. Cae en gastro ante un valor desconocido: es el rubro
 * con el que nacio la plataforma y el unico que no deja la UI vacia. Un
 * vertical invalido no deberia llegar (hay CHECK en la DB), pero si llega, un
 * panel usable es mejor que una pantalla en blanco.
 */
export function getRubro(vertical) {
  return RUBROS[vertical] || RUBROS[RUBRO_POR_DEFECTO];
}

/** Como se llaman las cosas en este rubro. */
export function terminologia(vertical) {
  return getRubro(vertical).terminologia;
}

/** Tipo de producto por defecto al crear uno nuevo. */
export function tipoPorDefecto(vertical) {
  return getRubro(vertical).productType;
}

/** ¿Este rubro carga este campo? */
export function usaCampo(vertical, campo) {
  return getRubro(vertical).campos.includes(campo);
}

/** ¿Los productos de este rubro se arman con insumos? */
export function usaReceta(vertical) {
  return getRubro(vertical).receta === true;
}

/** ¿Este rubro clasifica sus gastos con el plan de cuentas USAR? */
export function usaContabilidadUsar(vertical) {
  return getRubro(vertical).contabilidadUsar === true;
}

export function camposDe(vertical) {
  return getRubro(vertical).campos;
}

/**
 * Modulos que este negocio tiene Y que existen de verdad.
 *
 * Cruza los dos ejes: el rubro dice que modulos le corresponden, el modo
 * apaga los que necesitan salon. `modo` es opcional para no romper a quien
 * todavia llama con un solo argumento; sin el, no se filtra por salon.
 *
 * `todos: true` incluye los que faltan implementar — sirve para hojas de
 * ruta, no para armar la navegacion.
 */
export function modulosDe(vertical, modo, { todos = false } = {}) {
  // Firma vieja: modulosDe(vertical, { todos: true }).
  if (modo && typeof modo === 'object') {
    todos = modo.todos === true;
    modo = null;
  }
  const sinSalon = modo != null && getModo(modo).id === 'virtual';
  return getRubro(vertical).modulos
    .map(id => MODULOS[id])
    .filter(m => m && (todos || m.implementado))
    .filter(m => !(sinSalon && m.requiereSalon));
}

/** ¿Este negocio tiene este modulo disponible hoy? */
export function tieneModulo(vertical, moduloId, modo) {
  return modulosDe(vertical, modo).some(m => m.id === moduloId);
}

/** Lista de rubros para un selector de alta. */
export function rubrosDisponibles() {
  return Object.values(RUBROS).map(r => ({ id: r.id, label: r.label }));
}

/* ─────────────────────── Modo de operacion (6a) ───────────────────────
 *
 * El rubro dice QUE vende el negocio. El modo dice COMO opera: si hay un
 * salon con gente adentro o si todo pasa a distancia. Son ejes distintos y
 * por eso son dos campos: una barberia y un restaurante son rubros distintos
 * con el mismo modo, y dos gastro pueden ser dark kitchen o parrilla.
 *
 * Un dark kitchen que ve "Mapa de mesas" es el mismo problema que la
 * barberia que ve "Recetas".
 */

export const MODOS = {
  fisico: {
    id: 'fisico',
    label: 'Local a la calle',
    hint: 'Recibis gente en el local',
    // Lo que solo tiene sentido con salon.
    modulos: ['mesas', 'caja'],
  },
  virtual: {
    id: 'virtual',
    label: 'Solo a distancia',
    hint: 'Pedidos por delivery, retiro o encargo',
    modulos: [],
  },
  hibrido: {
    id: 'hibrido',
    label: 'Las dos cosas',
    hint: 'Atendes en el local y tambien a distancia',
    modulos: ['mesas', 'caja'],
  },
};

export const MODO_POR_DEFECTO = 'fisico';

/* ───────────────────────────── Canales (6a) ───────────────────────────
 *
 * Por donde entra la demanda. A diferencia del modo, son VARIOS a la vez:
 * una barberia recibe turnos, gente sin turno y reservas online al mismo
 * tiempo. Meter esto en el modo obligaria a inventar valores como
 * 'fisico_con_delivery_y_reservas'.
 *
 * Los ids son los mismos que el CHECK de `tenants.channels`
 * (platform/migrations/0039) y los mismos que usa `orders.channel`.
 */

export const CANALES = {
  // Los tres que exigen que la persona entre al local.
  walk_in:        { id: 'walk_in',        label: 'Sin turno',        modos: ['fisico', 'hibrido'] },
  counter:        { id: 'counter',        label: 'Mostrador',        modos: ['fisico', 'hibrido'] },
  table_service:  { id: 'table_service',  label: 'Servicio de mesa', modos: ['fisico', 'hibrido'] },
  // Turno y reserva NO exigen salon: un barbero a domicilio agenda igual, y el
  // servicio se presta en la casa del cliente.
  appointment:    { id: 'appointment',    label: 'Con turno',        modos: ['fisico', 'virtual', 'hibrido'] },
  online_booking: { id: 'online_booking', label: 'Reserva online',   modos: ['fisico', 'virtual', 'hibrido'] },
  delivery:       { id: 'delivery',       label: 'Delivery',         modos: ['fisico', 'virtual', 'hibrido'] },
  pickup:         { id: 'pickup',         label: 'Retiro',           modos: ['fisico', 'virtual', 'hibrido'] },
  ecommerce:      { id: 'ecommerce',      label: 'Tienda online',    modos: ['fisico', 'virtual', 'hibrido'] },
  whatsapp:       { id: 'whatsapp',       label: 'WhatsApp',         modos: ['fisico', 'virtual', 'hibrido'] },
  marketplace:    { id: 'marketplace',    label: 'Marketplace',      modos: ['fisico', 'virtual', 'hibrido'] },
};

// Que canales propone el alta segun rubro y modo. Es una sugerencia para no
// arrancar con la lista vacia, no una restriccion: el negocio marca y desmarca
// lo que quiera de `canalesPosibles()`.
const CANALES_SUGERIDOS = {
  gastro: {
    fisico:  ['table_service', 'counter', 'delivery', 'pickup'],
    virtual: ['delivery', 'pickup', 'whatsapp'],
    hibrido: ['table_service', 'delivery', 'pickup', 'whatsapp'],
  },
  barber: {
    fisico:  ['appointment', 'walk_in'],
    virtual: ['online_booking'],
    hibrido: ['appointment', 'walk_in', 'online_booking'],
  },
  retail: {
    fisico:  ['counter'],
    virtual: ['ecommerce', 'whatsapp'],
    hibrido: ['counter', 'ecommerce', 'whatsapp'],
  },
};

/** El modo, cayendo en el default ante un valor desconocido. */
export function getModo(modo) {
  return MODOS[modo] || MODOS[MODO_POR_DEFECTO];
}

/** Canales que tienen sentido en este modo. */
export function canalesPosibles(modo) {
  const m = getModo(modo).id;
  return Object.values(CANALES).filter(c => c.modos.includes(m));
}

/** Canales que el alta propone marcados para este rubro y modo. */
export function canalesSugeridos(vertical, modo) {
  const porRubro = CANALES_SUGERIDOS[getRubro(vertical).id] || {};
  return porRubro[getModo(modo).id] || [];
}

/** ¿Este negocio vende por este canal? */
export function tieneCanal(channels, canalId) {
  return Array.isArray(channels) && channels.includes(canalId);
}

/** Lista de modos para el selector del alta. */
export function modosDisponibles() {
  return Object.values(MODOS).map(m => ({ id: m.id, label: m.label, hint: m.hint }));
}
