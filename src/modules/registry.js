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
  caja: {
    id: 'caja',
    label: 'Caja',
    implementado: false,     // payment_methods + cash_sessions + payments (0004)
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
    modulos: ['products', 'orders', 'stock', 'finanzas', 'caja'],
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
    modulos: ['products', 'orders', 'agenda', 'finanzas', 'caja'],
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
    modulos: ['products', 'orders', 'variants', 'stock', 'finanzas', 'caja'],
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
 * Modulos que este rubro tiene Y que existen de verdad.
 * `todos: true` incluye los que faltan implementar — sirve para hojas de
 * ruta, no para armar la navegacion.
 */
export function modulosDe(vertical, { todos = false } = {}) {
  return getRubro(vertical).modulos
    .map(id => MODULOS[id])
    .filter(m => m && (todos || m.implementado));
}

/** ¿Este rubro tiene este modulo disponible hoy? */
export function tieneModulo(vertical, moduloId) {
  return modulosDe(vertical).some(m => m.id === moduloId);
}

/** Lista de rubros para un selector de alta. */
export function rubrosDisponibles() {
  return Object.values(RUBROS).map(r => ({ id: r.id, label: r.label }));
}
