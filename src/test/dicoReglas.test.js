import { describe, it, expect } from 'vitest';
import { avisosDe, contarAlertas, MAX_AVISOS } from '../modules/dico/reglas';

// Dico capa 2 son funciones puras: estos tests son la garantia de que no
// afirma cosas que no puede saber. Lo que se cuida no es "que aparezca el
// aviso" sino los dos errores que lo harian inutil o daniino:
//   - decir algo falso (ej: "cargá tu primer producto" a quien tiene 40);
//   - decir demasiado (veinte avisos son cero avisos).

const prod = (over = {}) => ({ id: 'p1', name: 'Milanesa', price: 5000, active: true, ...over });
const ing = (over = {}) => ({ id: 'i1', name: 'Harina', cost: 100, stock: 10, min_stock: 0, food_category: 'dry', ...over });
const receta = (pares) => new Map(pares);

const ids = (avisos) => avisos.map(a => a.id);

// Contexto sano: un negocio sin nada para reclamar.
const sano = {
  vertical: 'gastro',
  productos: [prod()],
  insumos: [ing()],
  recetas: receta([['p1', [{ ingredient_id: 'i1', qty: 1 }]]]),
  gastos: [{ date: '2026-08-05' }],
  settings: { waste_pct: 0, expense_pct: 0 },
  hoy: new Date('2026-08-16T12:00:00Z'),
};

describe('no inventa', () => {
  it('mientras carga no dice nada', () => {
    // Con listo:false las listas vacias son "todavia no se", no "no hay".
    expect(avisosDe({ ...sano, productos: [], insumos: [], recetas: null, listo: false })).toEqual([]);
  });

  it('un negocio sin nada para reclamar no recibe avisos', () => {
    expect(avisosDe(sano)).toEqual([]);
  });

  it('nunca muestra mas de MAX_AVISOS', () => {
    const roto = {
      ...sano,
      productos: [prod({ price: 0 }), prod({ id: 'p2', name: 'Tarta', price: 0 })],
      insumos: [ing({ cost: 0, min_stock: 20, stock: 1, food_category: null })],
      recetas: receta([['p1', [{ ingredient_id: 'i1', qty: 1 }]]]),
      gastos: [],
    };
    const avisos = avisosDe(roto);
    expect(avisos.length).toBeLessThanOrEqual(MAX_AVISOS);
    // Y lo que sobrevive al corte es lo mas grave.
    expect(avisos[0].nivel).toBe('alerta');
  });

  it('cada aviso dice que hacer, no solo que esta mal', () => {
    const avisos = avisosDe({ ...sano, productos: [] });
    expect(avisos.length).toBeGreaterThan(0);
    for (const a of avisos) {
      expect(a.titulo, a.id).toBeTruthy();
      expect(a.detalle, a.id).toBeTruthy();
      expect(a.ir?.tab, a.id).toBeTruthy();
    }
  });
});

describe('catalogo', () => {
  it('sin productos avisa, y lo dice en el idioma del rubro', () => {
    expect(avisosDe({ ...sano, productos: [], recetas: receta([]) })[0].id).toBe('catalogo-vacio');
    const barber = avisosDe({ ...sano, vertical: 'barber', productos: [], recetas: null })[0];
    expect(barber.titulo).toMatch(/servicio/);
    const retail = avisosDe({ ...sano, vertical: 'retail', productos: [], recetas: null })[0];
    expect(retail.titulo).toMatch(/artículo/);
  });

  it('con todo apagado avisa que la pagina se ve vacia', () => {
    const avisos = avisosDe({ ...sano, productos: [prod({ active: false })] });
    expect(ids(avisos)).toContain('nada-visible');
  });

  // Number('') y Number(null) son 0: sin el corte explicito, un precio sin
  // cargar y un precio de $0 son indistinguibles. Los dos son un problema
  // igual, pero por eso el chequeo tiene que ser `> 0` y no `!= null`.
  it('precio vacio, null o 0 cuentan todos como sin precio', () => {
    for (const price of [0, '', null, undefined]) {
      const avisos = avisosDe({ ...sano, productos: [prod({ price })] });
      expect(ids(avisos), String(price)).toContain('sin-precio');
    }
  });

  it('un producto apagado sin precio no molesta: no se puede pedir', () => {
    const avisos = avisosDe({ ...sano, productos: [prod({ price: 0, active: false })] });
    expect(ids(avisos)).not.toContain('sin-precio');
  });
});

describe('plata', () => {
  it('avisa cuando el costo supera al precio', () => {
    const avisos = avisosDe({
      ...sano,
      productos: [prod({ price: 50 })],
      insumos: [ing({ cost: 100 })],
    });
    expect(ids(avisos)).toContain('margen-negativo');
    expect(avisosDe(sano).find(a => a.id === 'margen-negativo')).toBeUndefined();
  });

  it('sin receta no opina del margen en vez de suponer costo 0', () => {
    // Con costo 0 el margen daria 100% y todo pareceria rentabilisimo. La
    // misma decision que ya se tomo en platformRecipes: mejor sin dato.
    const avisos = avisosDe({ ...sano, productos: [prod({ price: 1 })], recetas: receta([]) });
    expect(ids(avisos)).not.toContain('margen-negativo');
    expect(ids(avisos)).toContain('sin-receta');
  });

  it('un insumo en $0 usado en recetas avisa que el margen se ve mejor de lo que es', () => {
    const avisos = avisosDe({ ...sano, insumos: [ing({ cost: 0 })] });
    const a = avisos.find(x => x.id === 'insumo-sin-costo');
    expect(a).toBeTruthy();
    expect(a.detalle).toMatch(/mejor de lo que son/);
  });

  it('un insumo en $0 que no esta en ninguna receta no molesta', () => {
    const avisos = avisosDe({ ...sano, insumos: [ing(), ing({ id: 'i2', name: 'Sal', cost: 0 })] });
    expect(ids(avisos)).not.toContain('insumo-sin-costo');
  });
});

describe('stock', () => {
  it('avisa cuando el stock toca el minimo', () => {
    const avisos = avisosDe({ ...sano, insumos: [ing({ stock: 2, min_stock: 2 })] });
    expect(ids(avisos)).toContain('stock-bajo');
  });

  it('sin minimo cargado no reclama nada', () => {
    // Con min_stock 0 todo insumo estaria "bajo el minimo" y el aviso seria
    // permanente, que es la forma mas rapida de que lo dejen de mirar.
    const avisos = avisosDe({ ...sano, insumos: [ing({ stock: 0, min_stock: 0 })] });
    expect(ids(avisos)).not.toContain('stock-bajo');
  });
});

describe('gastos', () => {
  it('avisa recien pasados 10 dias del mes sin gastos', () => {
    const temprano = avisosDe({ ...sano, gastos: [], hoy: new Date('2026-08-05T12:00:00Z') });
    expect(ids(temprano)).not.toContain('mes-sin-gastos');

    const tarde = avisosDe({ ...sano, gastos: [], hoy: new Date('2026-08-20T12:00:00Z') });
    expect(ids(tarde)).toContain('mes-sin-gastos');
  });

  it('los gastos del mes pasado no cuentan como los de este', () => {
    const avisos = avisosDe({ ...sano, gastos: [{ date: '2026-07-28' }], hoy: new Date('2026-08-20T12:00:00Z') });
    expect(ids(avisos)).toContain('mes-sin-gastos');
  });
});

describe('por rubro', () => {
  it('a una barberia no le habla de recetas ni de tipo de comida', () => {
    const avisos = avisosDe({
      ...sano,
      vertical: 'barber',
      productos: [prod({ name: 'Corte' })],
      insumos: [ing({ name: 'Gel', cost: 0, food_category: null })],
      recetas: receta([]),
    });
    for (const prohibido of ['sin-receta', 'margen-negativo', 'insumo-sin-costo', 'insumo-sin-clasificar']) {
      expect(ids(avisos), prohibido).not.toContain(prohibido);
    }
  });

  it('a una cocina si le avisa del insumo sin clasificar', () => {
    const avisos = avisosDe({ ...sano, insumos: [ing({ food_category: null })] });
    expect(ids(avisos)).toContain('insumo-sin-clasificar');
  });
});

describe('contarAlertas', () => {
  it('cuenta solo las alertas, no los avisos ni las sugerencias', () => {
    const avisos = avisosDe({ ...sano, productos: [], recetas: null });
    expect(contarAlertas(avisos)).toBe(1);
    expect(contarAlertas(avisosDe(sano))).toBe(0);
    expect(contarAlertas(null)).toBe(0);
  });
});
