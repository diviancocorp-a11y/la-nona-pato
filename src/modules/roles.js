/**
 * Los siete roles y que ve cada uno (Etapa 6f, seccion 4 del plan).
 *
 * POR QUE ESTO ES CODIGO Y NO UNA TABLA
 * Un motor de permisos configurable es de las cosas que mas tiempo consumen y
 * menos piden los primeros veinte clientes. Declarados aca, los permisos se
 * versionan con el codigo, se revisan en un diff y se prueban con tests. La
 * tabla editable se hace cuando aparezca el cliente que la pida; para entonces
 * el alcance por sucursal ya va a estar en su lugar.
 *
 * ESTO NO ES LA SEGURIDAD
 * Es la navegacion. Toda restriccion que importe vive ademas en RLS
 * (migracion 0050): esconder el boton no protege la tabla. Si algo de aca se
 * contradice con una policy, la que manda es la policy — este archivo solo
 * decide que se dibuja.
 *
 * `attendant` ES UNA CAPACIDAD, NO UN PUESTO
 * Internamente es el operario del servicio; el rubro lo traduce a Mozo,
 * Barbero o Vendedor. El backend no se llena de vocabulario comercial.
 */

/** Cuanto de un modulo ve un rol. */
export const ACCESO = {
  COMPLETO: 'completo',   // ve y opera todo el modulo
  PROPIO: 'propio',       // solo lo suyo (sus mesas, sus ventas, su ficha)
  LECTURA: 'lectura',     // lo ve, no lo toca
  NADA: 'nada',
};

const { COMPLETO, PROPIO, LECTURA, NADA } = ACCESO;

export const ROLES = {
  owner: {
    id: 'owner',
    label: 'Dueño',
    descripcion: 'Ve y hace todo, en todas las sucursales.',
    abreEn: 'products',
    // El unico que no se puede quedar sin nadie: un negocio sin duenio no
    // tiene quien gestione el equipo.
    imprescindible: true,
  },
  manager: {
    id: 'manager',
    label: 'Encargado',
    descripcion: 'Maneja el dia a día de su sucursal. No ve lo fiscal.',
    abreEn: 'orders',
  },
  cashier: {
    id: 'cashier',
    label: 'Cajero',
    descripcion: 'Cobra y arquea su turno.',
    abreEn: 'caja',
  },
  attendant: {
    id: 'attendant',
    // Lo pisa la terminologia del rubro: Mozo, Barbero o Vendedor.
    label: 'Mozo',
    descripcion: 'Atiende lo suyo: sus mesas o sus turnos.',
    abreEn: 'mesas',
  },
  kitchen: {
    id: 'kitchen',
    label: 'Cocina',
    descripcion: 'Prepara y marca listo. No ve precios ni cobra.',
    abreEn: 'orders',
    // Solo tiene sentido en un local que cocina.
    soloVerticales: ['gastro'],
    requiereSalon: true,
  },
  marketer: {
    id: 'marketer',
    label: 'Marketing',
    descripcion: 'Campañas y audiencias. No ve la lista de teléfonos.',
    abreEn: 'products',
  },
  accountant: {
    id: 'accountant',
    label: 'Contador',
    descripcion: 'Lo fiscal y lo financiero. No ve la operación.',
    abreEn: 'ventas',
  },
};

export const ROL_POR_DEFECTO = 'attendant';

/**
 * La matriz de la seccion 4.3, en codigo.
 *
 * Lo que NO figura para un rol es `nada`: se declara solo lo que se ve, para
 * que agregar un modulo nuevo lo deje oculto por defecto en vez de visible
 * para todos. Es la unica forma de que el olvido sea seguro.
 */
const MATRIZ = {
  owner: {
    products: COMPLETO, orders: COMPLETO, mesas: COMPLETO, agenda: COMPLETO,
    caja: COMPLETO, stock: COMPLETO, finanzas: COMPLETO, ventas: COMPLETO,
    personal: COMPLETO, variants: COMPLETO,
  },
  manager: {
    products: COMPLETO, orders: COMPLETO, mesas: COMPLETO, agenda: COMPLETO,
    caja: COMPLETO, stock: COMPLETO,
    // Acotados a su sucursal: el encargado de una no mira los numeros de otra.
    finanzas: PROPIO, ventas: PROPIO, personal: PROPIO, variants: COMPLETO,
  },
  cashier: {
    products: LECTURA, orders: COMPLETO, mesas: LECTURA, agenda: LECTURA,
    caja: PROPIO,
  },
  attendant: {
    products: LECTURA, orders: PROPIO, mesas: PROPIO, agenda: PROPIO,
    stock: LECTURA,
    // Sus ventas, su comision y sus propinas. No el total del local.
    ventas: PROPIO, personal: PROPIO,
  },
  kitchen: {
    // Sin precio ni costo: la cocina necesita saber que preparar, no cuanto
    // sale. El recorte de columnas lo hace la pantalla.
    products: LECTURA, orders: PROPIO, stock: PROPIO, personal: PROPIO,
  },
  marketer: {
    products: LECTURA, ventas: LECTURA,
  },
  accountant: {
    // El unico rol que pertenece a varios negocios y no trabaja en ninguno.
    ventas: COMPLETO, finanzas: LECTURA, caja: LECTURA,
  },
};

/** Que acceso tiene un rol sobre un modulo. */
export function accesoDe(rol, moduloId) {
  return MATRIZ[rol]?.[moduloId] || NADA;
}

/**
 * El acceso de una persona con VARIOS roles: gana el mas amplio.
 *
 * Alguien que es barbero y cajero tiene que poder hacer las dos cosas; darle
 * la interseccion lo dejaria sin poder hacer ninguna.
 */
const ORDEN = [NADA, LECTURA, PROPIO, COMPLETO];

export function accesoDeRoles(roles = [], moduloId) {
  return (roles || []).reduce((mejor, rol) => {
    const a = accesoDe(rol, moduloId);
    return ORDEN.indexOf(a) > ORDEN.indexOf(mejor) ? a : mejor;
  }, NADA);
}

/** Si esta persona ve el modulo, en la medida que sea. */
export function puedeVer(roles, moduloId) {
  return accesoDeRoles(roles, moduloId) !== NADA;
}

/** Si puede modificar: `propio` tambien escribe, pero solo lo suyo. */
export function puedeEditar(roles, moduloId) {
  const a = accesoDeRoles(roles, moduloId);
  return a === COMPLETO || a === PROPIO;
}

/**
 * Donde cae la persona al entrar.
 *
 * El duenio abre en su negocio; el cajero en su caja; el mozo en sus mesas.
 * Con varios roles gana el primero de la lista que exista de verdad para ese
 * negocio: el orden de ROLES va de mas amplio a mas acotado.
 */
export function pantallaInicial(roles = [], modulosDisponibles = []) {
  const ids = modulosDisponibles.map(m => m.id || m);
  const orden = Object.keys(ROLES);
  const elegido = orden.find(r => (roles || []).includes(r));
  const preferida = ROLES[elegido]?.abreEn;
  if (preferida && ids.includes(preferida)) return preferida;
  // Si su pantalla no existe en este negocio (un cajero en un local sin caja),
  // cae en el primer modulo que si pueda ver, y no en una pantalla vacia.
  return ids.find(id => puedeVer(roles, id)) || null;
}

/**
 * Los roles que se pueden asignar en este negocio.
 *
 * Ofrecer "Cocina" en una barberia, o en un negocio que solo vende a
 * distancia, es ofrecer un rol que no abre ninguna pantalla.
 */
export function rolesAsignables(vertical, modo) {
  const esVirtual = modo === 'virtual';
  return Object.values(ROLES).filter(r => {
    if (r.soloVerticales && !r.soloVerticales.includes(vertical)) return false;
    if (r.requiereSalon && esVirtual) return false;
    return true;
  });
}

/**
 * Si esta persona ve los importes.
 *
 * Es la nota 1 de la matriz: la cocina prepara, no cobra, y mostrarle el
 * precio de cada plato no le sirve para nada y expone el margen del negocio a
 * mas gente de la necesaria.
 *
 * Se pregunta por lo que la persona NO es: alcanza con tener cualquier otro
 * rol para volver a ver los numeros. Alguien que cocina y ademas cobra es
 * cajero, y un cajero ve importes.
 */
export function vePrecios(roles = []) {
  const suyos = (roles || []).filter(Boolean);
  if (!suyos.length) return false;
  return !suyos.every(r => r === 'kitchen');
}

/** Como se llama este rol en este rubro. */
export function etiquetaDeRol(rol, terminos) {
  if (rol === 'attendant' && terminos?.operario) return terminos.operario;
  return ROLES[rol]?.label || rol;
}
