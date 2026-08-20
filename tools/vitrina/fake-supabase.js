/**
 * El cliente de Supabase de mentira que usa la vitrina.
 *
 * POR QUE SE INTERCEPTA EL CLIENTE Y NO CADA SERVICE
 * Stubear `platformCaja`, `platformSalon`, etc. obliga a escribir un stub por
 * pantalla y —peor— saltea el service real, que es donde vive la traduccion de
 * errores de la base a castellano y el armado de las claves de idempotencia.
 * Una vitrina que no ejecuta eso muestra una pantalla que no existe.
 *
 * Interceptando el cliente, la pantalla corre SU service de verdad y lo unico
 * falso son las filas. Una escena es datos, no codigo.
 *
 * NO ES UN POSTGRES
 * Aplica `eq` y ordena, y con eso alcanza para dibujar. Si una pantalla
 * necesita algo que esto no hace, la respuesta correcta es probarla contra la
 * base, no agrandar este archivo hasta que sea un motor de consultas peor.
 */

// Lo que la escena activa cargo. Se llena desde main.jsx antes de montar.
let TABLAS = {};
let RPCS = {};
let FUNCIONES = {};
let SESION = null;

export function cargarEscena({ tablas = {}, rpc = {}, functions = {}, sesion = null } = {}) {
  // Copia profunda barata: las escenas mutan sus filas (cobrar agrega un pago)
  // y al cambiar de escena hay que volver al estado inicial.
  TABLAS = JSON.parse(JSON.stringify(tablas));
  RPCS = rpc;
  FUNCIONES = functions;
  // Pantallas como la consola preguntan "quien soy" antes de dibujar. Sin
  // sesion se comportan como si no tuvieras permiso, y eso parece un bug del
  // componente cuando es de la vitrina.
  SESION = sesion;
}

export function filasDe(tabla) {
  TABLAS[tabla] = TABLAS[tabla] || [];
  return TABLAS[tabla];
}

function coincide(fila, filtros) {
  return filtros.every(([col, val]) => fila[col] === val);
}

class Consulta {
  constructor(tabla) {
    this.tabla = tabla;
    this.filtros = [];
    this.orden = null;
    this.tope = null;
  }

  select() { return this; }
  eq(col, val) { this.filtros.push([col, val]); return this; }
  in(col, vals) { this.filtros.push([col, vals?.[0]]); return this; }
  order(col, opts) { this.orden = { col, asc: opts?.ascending !== false }; return this; }
  limit(n) { this.tope = n; return this; }

  resolver() {
    let filas = filasDe(this.tabla).filter(f => coincide(f, this.filtros));
    if (this.orden) {
      const { col, asc } = this.orden;
      filas = [...filas].sort((a, b) => (
        a[col] === b[col] ? 0 : ((a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1))
      ));
    }
    if (this.tope != null) filas = filas.slice(0, this.tope);
    return filas;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.resolver()[0] || null, error: null });
  }

  single() {
    const f = this.resolver()[0];
    return Promise.resolve(
      f ? { data: f, error: null } : { data: null, error: { message: 'no_rows' } },
    );
  }

  then(ok, mal) {
    return Promise.resolve({ data: this.resolver(), error: null }).then(ok, mal);
  }
}

export const supabase = {
  from(tabla) {
    const q = new Consulta(tabla);
    return {
      select: (...a) => q.select(...a),
      insert: (filas) => {
        const arr = Array.isArray(filas) ? filas : [filas];
        arr.forEach(f => filasDe(tabla).push({ id: `x${Date.now()}`, ...f }));
        return Promise.resolve({ data: arr, error: null });
      },
      update: () => Promise.resolve({ data: null, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
    };
  },

  async rpc(nombre, args) {
    const fn = RPCS[nombre];
    if (fn === undefined) {
      // Silencioso seria peor: una pantalla que no anda y no dice por que.
      return { data: null, error: { message: `la escena no define la RPC ${nombre}` } };
    }
    const salida = typeof fn === 'function' ? await fn(args) : fn;
    if (salida && salida.__error) return { data: null, error: { message: salida.__error } };
    return { data: salida, error: null };
  },

  // Las edge functions se declaran como DATO de la escena, igual que las
  // tablas. Antes cada escena le asignaba `supabase.functions` a mano, y como
  // el glob evalua TODAS al cargar, la ultima en hacerlo le pisaba el fake a
  // las demas: la pantalla de cobros recibia el router de la de equipo y
  // contestaba "accion desconocida".
  functions: {
    async invoke(nombre, opciones = {}) {
      const fn = FUNCIONES[nombre];
      if (!fn) {
        return {
          data: { error: `la escena no define la edge function ${nombre}` },
          error: null,
        };
      }
      return { data: await fn(opciones.body || {}), error: null };
    },
  },

  auth: {
    getSession: async () => ({ data: { session: SESION }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

export default supabase;
