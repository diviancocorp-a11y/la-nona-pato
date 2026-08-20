// Dico capa 3 — oportunidades (Etapa 6g).
//
// Lo que importa que sea cierto:
//   - que NUNCA afirme sin muestra suficiente. Un aviso equivocado sobre la
//     plata del negocio se paga con que no se mire ninguno mas;
//   - que toda oportunidad traiga la CUENTA que la produjo;
//   - que "cliente perdido" mire la frecuencia propia de cada uno y no un
//     numero fijo de dias.

import { describe, it, expect } from 'vitest';
import { oportunidadesDe, MAX_OPORTUNIDADES } from '../modules/dico/oportunidades';

const HOY = new Date('2026-08-19T12:00:00Z');
const hace = (d) => new Date(HOY.getTime() - d * 86400000).toISOString();

const venta = (over = {}) => ({
  recipe_id: 'p1', qty: 1, unit_price: 1000, unit_cost: 400,
  date: hace(10), ...over,
});

// Muestra minima valida: 60 dias de ventas de tres productos.
const VENTAS_OK = [
  ...Array.from({ length: 6 }, (_, i) => venta({ recipe_id: 'p1', date: hace(60 - i * 8) })),
  ...Array.from({ length: 4 }, (_, i) => venta({ recipe_id: 'p2', date: hace(50 - i * 8) })),
];

const PRODUCTOS = [
  { id: 'p1', name: 'Milanesa', active: true },
  { id: 'p2', name: 'Ensalada', active: true },
  { id: 'p3', name: 'Flan', active: true },
];

describe('no habla sin muestra', () => {
  it('sin ventas no dice nada', () => {
    expect(oportunidadesDe({ productos: PRODUCTOS, ventas: [], hoy: HOY })).toEqual([]);
  });

  it('con pocas ventas tampoco', () => {
    const r = oportunidadesDe({ productos: PRODUCTOS, ventas: [venta(), venta()], hoy: HOY });
    expect(r).toEqual([]);
  });

  it('un negocio de dos semanas no recibe un aviso de que nada rota', () => {
    // La ventana es corta: todavia no hay con que afirmar.
    const cortas = Array.from({ length: 10 }, (_, i) => venta({ date: hace(12 - i) }));
    const ids = oportunidadesDe({ productos: PRODUCTOS, ventas: cortas, hoy: HOY })
      .map(o => o.id);
    expect(ids).not.toContain('no-rota');
  });

  it('sin datos no devuelve nada en vez de inventar', () => {
    expect(oportunidadesDe({})).toEqual([]);
    expect(oportunidadesDe({ listo: false, productos: PRODUCTOS, ventas: VENTAS_OK })).toEqual([]);
  });
});

describe('lo que no rota', () => {
  it('avisa del producto que nunca se vendio', () => {
    const r = oportunidadesDe({ productos: PRODUCTOS, ventas: VENTAS_OK, hoy: HOY });
    const o = r.find(x => x.id === 'no-rota');
    expect(o).toBeTruthy();
    expect(o.titulo).toContain('Flan');
    expect(o.porque).toMatch(/2 de tus 3/);
  });

  it('no cuenta los que estan apagados', () => {
    const productos = [...PRODUCTOS.slice(0, 2), { id: 'p3', name: 'Flan', active: false }];
    const ids = oportunidadesDe({ productos, ventas: VENTAS_OK, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('no-rota');
  });
});

describe('clientes fuera de frecuencia', () => {
  // Cuatro habituales; uno rompio SU propia frecuencia.
  const clientes = [
    {
      name: 'Vale', orders: 6, total: 60000,
      first_order: hace(120), last_order: hace(90),   // compraba cada 24d, hace 90
    },
    { name: 'Ana', orders: 5, total: 30000, first_order: hace(100), last_order: hace(6) },
    { name: 'Leo', orders: 4, total: 20000, first_order: hace(90), last_order: hace(10) },
    { name: 'Sol', orders: 3, total: 10000, first_order: hace(60), last_order: hace(8) },
  ];

  it('detecta al que rompio su propia frecuencia', () => {
    const r = oportunidadesDe({ clientes, hoy: HOY });
    const o = r.find(x => x.id === 'fuera-de-frecuencia');
    expect(o).toBeTruthy();
    expect(o.titulo).toContain('Vale');
    expect(o.porque).toMatch(/compraba cada \d+ días/);
  });

  it('el que compra cada tres meses NO esta perdido al mes', () => {
    // Es el falso positivo que manda promociones que molestan.
    const esporadicos = [
      { name: 'Juan', orders: 4, total: 40000, first_order: hace(360), last_order: hace(40) },
      { name: 'Ana', orders: 5, total: 30000, first_order: hace(100), last_order: hace(6) },
      { name: 'Leo', orders: 4, total: 20000, first_order: hace(90), last_order: hace(10) },
      { name: 'Sol', orders: 3, total: 10000, first_order: hace(60), last_order: hace(8) },
    ];
    const ids = oportunidadesDe({ clientes: esporadicos, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('fuera-de-frecuencia');
  });

  it('no habla con pocos clientes', () => {
    const ids = oportunidadesDe({ clientes: clientes.slice(0, 2), hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('fuera-de-frecuencia');
  });

  it('ignora a los que compraron una sola vez', () => {
    const unicos = clientes.map(c => ({ ...c, orders: 1 }));
    const ids = oportunidadesDe({ clientes: unicos, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('fuera-de-frecuencia');
  });
});

describe('ocupacion del salon', () => {
  it('dice cuantas horas quedaron sin vender', () => {
    const r = oportunidadesDe({
      utilizacion: { utilizacion_pct: 30, horas_disponibles: 48, horas_vendidas: 14 },
      hoy: HOY,
    });
    const o = r.find(x => x.id === 'ocupacion-baja');
    expect(o.titulo).toContain('34 horas');
    expect(o.porque).toContain('30%');
  });

  it('con buena ocupacion no molesta', () => {
    const ids = oportunidadesDe({
      utilizacion: { utilizacion_pct: 78, horas_disponibles: 48, horas_vendidas: 37 },
      hoy: HOY,
    }).map(o => o.id);
    expect(ids).not.toContain('ocupacion-baja');
  });

  it('sin el dato no inventa', () => {
    const ids = oportunidadesDe({ utilizacion: null, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('ocupacion-baja');
  });
});

describe('capital inmovilizado', () => {
  const insumos = [
    { name: 'Harina', stock: 200, cost: 100 },
    { name: 'Aceite', stock: 50, cost: 200 },
    { name: 'Sal', stock: 10, cost: 50 },
  ];

  it('avisa cuando el stock cubre muchos meses', () => {
    // 30500 en stock contra un consumo bajo.
    const pocas = Array.from({ length: 10 }, (_, i) => venta({
      unit_cost: 20, qty: 1, date: hace(60 - i * 6),
    }));
    const r = oportunidadesDe({ insumos, ventas: pocas, hoy: HOY });
    const o = r.find(x => x.id === 'capital-inmovilizado');
    expect(o).toBeTruthy();
    expect(o.porque).toContain('Harina');
    expect(o.porque).toMatch(/meses/);
  });

  it('con rotacion sana no dice nada', () => {
    const muchas = Array.from({ length: 40 }, (_, i) => venta({
      unit_cost: 400, qty: 3, date: hace(30 - (i % 30)),
    }));
    const ids = oportunidadesDe({ insumos, ventas: muchas, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('capital-inmovilizado');
  });

  it('un insumo sin costo cargado no cuenta como cero', () => {
    const sinCosto = [{ name: 'X', stock: 100, cost: null }];
    const ids = oportunidadesDe({ insumos: sinCosto, ventas: VENTAS_OK, hoy: HOY })
      .map(o => o.id);
    expect(ids).not.toContain('capital-inmovilizado');
  });
});

describe('demanda perdida', () => {
  it('cuenta las personas que se fueron sin esperar', () => {
    const espera = [
      { status: 'left', party_size: 4, created_at: hace(20) },
      { status: 'left', party_size: 2, created_at: hace(10) },
      { status: 'left', party_size: 2, created_at: hace(4) },
      { status: 'seated', party_size: 6, created_at: hace(3) },
    ];
    const o = oportunidadesDe({ esperaPerdida: espera, hoy: HOY })
      .find(x => x.id === 'demanda-perdida');
    expect(o.titulo).toContain('8 personas');
    expect(o.porque).toContain('3 grupos');
  });

  it('con uno o dos casos no saca conclusiones', () => {
    const ids = oportunidadesDe({
      esperaPerdida: [{ status: 'left', party_size: 2, created_at: hace(5) }],
      hoy: HOY,
    }).map(o => o.id);
    expect(ids).not.toContain('demanda-perdida');
  });
});

describe('margen flaco', () => {
  it('encuentra el que vende mucho y deja poco', () => {
    const productos = [
      { id: 'a', name: 'Gaseosa', active: true },
      { id: 'b', name: 'Milanesa', active: true },
      { id: 'c', name: 'Postre', active: true },
    ];
    const ventas = [
      // Gaseosa: mucho volumen, 10% de margen.
      ...Array.from({ length: 20 }, () => venta({
        recipe_id: 'a', unit_price: 1000, unit_cost: 900, date: hace(20),
      })),
      ...Array.from({ length: 5 }, () => venta({
        recipe_id: 'b', unit_price: 1000, unit_cost: 400, date: hace(20),
      })),
      ...Array.from({ length: 5 }, () => venta({
        recipe_id: 'c', unit_price: 1000, unit_cost: 300, date: hace(20),
      })),
    ];
    const o = oportunidadesDe({ productos, ventas, hoy: HOY })
      .find(x => x.id === 'margen-flaco');
    expect(o).toBeTruthy();
    expect(o.titulo).toContain('Gaseosa');
    expect(o.porque).toMatch(/10% de margen/);
  });

  it('con margenes parejos no señala a nadie', () => {
    const productos = [
      { id: 'a', name: 'A', active: true },
      { id: 'b', name: 'B', active: true },
      { id: 'c', name: 'C', active: true },
    ];
    const ventas = ['a', 'b', 'c'].flatMap(id => Array.from({ length: 5 }, () => venta({
      recipe_id: id, unit_price: 1000, unit_cost: 500, date: hace(20),
    })));
    const ids = oportunidadesDe({ productos, ventas, hoy: HOY }).map(o => o.id);
    expect(ids).not.toContain('margen-flaco');
  });
});

describe('la forma del aviso', () => {
  it('TODA oportunidad explica y recomienda', () => {
    // Es la regla que hace que esto no sea una caja negra.
    const r = oportunidadesDe({
      productos: PRODUCTOS, ventas: VENTAS_OK, hoy: HOY,
      insumos: [
        { name: 'Harina', stock: 200, cost: 100 },
        { name: 'Aceite', stock: 50, cost: 200 },
        { name: 'Sal', stock: 10, cost: 50 },
      ],
      utilizacion: { utilizacion_pct: 20, horas_disponibles: 40, horas_vendidas: 8 },
    });
    expect(r.length).toBeGreaterThan(0);
    for (const o of r) {
      expect(o.porque, `${o.id} sin porque`).toBeTruthy();
      expect(o.hacer, `${o.id} sin recomendacion`).toBeTruthy();
      expect(o.titulo).toBeTruthy();
    }
  });

  it('nunca muestra mas que el tope', () => {
    const r = oportunidadesDe({
      productos: PRODUCTOS, ventas: VENTAS_OK, hoy: HOY,
      insumos: [
        { name: 'Harina', stock: 900, cost: 500 },
        { name: 'Aceite', stock: 500, cost: 200 },
        { name: 'Sal', stock: 100, cost: 50 },
      ],
      utilizacion: { utilizacion_pct: 12, horas_disponibles: 40, horas_vendidas: 5 },
      esperaPerdida: [
        { status: 'left', party_size: 4, created_at: hace(20) },
        { status: 'left', party_size: 2, created_at: hace(10) },
        { status: 'left', party_size: 2, created_at: hace(4) },
      ],
    });
    expect(r.length).toBeLessThanOrEqual(MAX_OPORTUNIDADES);
  });

  it('una regla que explota no se lleva puesto al resto', () => {
    // `clientes` con forma invalida hace fallar a fueraDeFrecuencia.
    const r = oportunidadesDe({
      productos: PRODUCTOS, ventas: VENTAS_OK, hoy: HOY,
      clientes: [null, undefined],
    });
    expect(Array.isArray(r)).toBe(true);
  });
});
