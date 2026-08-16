import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import {
  fetchProductIngredients, saveProductIngredients, agruparPorProducto,
  factorDeCosto, indexarInsumos, costoBruto, costoReceta, margen,
  validateLineas, SELECT_COLS,
} from '../services/platformRecipes';
import { chain } from './_chain.js';

beforeEach(() => vi.clearAllMocks());

const TENANT = '11111111-1111-1111-1111-111111111111';

const INSUMOS = [
  { id: 'harina', name: 'Harina', cost: 1000 },
  { id: 'queso', name: 'Queso', cost: 8000 },
];
const PORID = indexarInsumos(INSUMOS);

describe('columnas', () => {
  it('todas existen en el snapshot del edificio', () => {
    const snap = JSON.parse(readFileSync(
      resolve(__dirname, '../../scripts/platform-schema.json'), 'utf-8'
    ));
    const reales = new Set(snap.tables.product_ingredients);
    for (const col of SELECT_COLS.split(',').map(s => s.trim())) {
      expect(reales.has(col), `"${col}" no existe`).toBe(true);
    }
  });
});

describe('factorDeCosto', () => {
  it('merma 5% + gastos 12% da 1.17', () => {
    expect(factorDeCosto({ waste_pct: 5, expense_pct: 12 })).toBeCloseTo(1.17);
  });

  it('sin configuracion usa el default del legacy: 5% de merma', () => {
    expect(factorDeCosto(null)).toBeCloseTo(1.05);
    expect(factorDeCosto({})).toBeCloseTo(1.05);
  });

  it('valores invalidos caen al default en vez de dar NaN', () => {
    // Un NaN acá se propaga a todos los costos de la pantalla sin decir por qué.
    expect(factorDeCosto({ waste_pct: 'mucho', expense_pct: null })).toBeCloseTo(1.05);
  });

  it('recorta arriba de 100 y descarta negativos', () => {
    expect(factorDeCosto({ waste_pct: 500, expense_pct: 0 })).toBeCloseTo(2);
    expect(factorDeCosto({ waste_pct: -10, expense_pct: 0 })).toBeCloseTo(1.05);
  });
});

describe('costeo', () => {
  const lineas = [
    { ingredient_id: 'harina', qty: 0.5 },  // 500
    { ingredient_id: 'queso', qty: 0.25 },  // 2000
  ];

  it('el costo bruto suma cantidad x costo', () => {
    expect(costoBruto(lineas, PORID)).toBe(2500);
  });

  it('un insumo que ya no existe suma 0 en vez de romper', () => {
    // Pasa de verdad: se archiva un insumo que estaba en recetas.
    const conFantasma = [...lineas, { ingredient_id: 'borrado', qty: 3 }];
    expect(costoBruto(conFantasma, PORID)).toBe(2500);
  });

  it('receta vacia cuesta 0', () => {
    expect(costoBruto([], PORID)).toBe(0);
    expect(costoBruto(null, PORID)).toBe(0);
  });

  it('el costo final aplica el colchon', () => {
    expect(costoReceta(lineas, PORID, { waste_pct: 10, expense_pct: 0 })).toBeCloseTo(2750);
  });
});

describe('margen', () => {
  const lineas = [{ ingredient_id: 'queso', qty: 0.25 }]; // bruto 2000
  const sinColchon = { waste_pct: 0, expense_pct: 0 };

  it('calcula ganancia y porcentaje', () => {
    const m = margen({ price: 5000 }, lineas, PORID, sinColchon);
    expect(m.costo).toBe(2000);
    expect(m.ganancia).toBe(3000);
    expect(m.pct).toBeCloseTo(60);
  });

  it('SIN receta devuelve null, no 100% de margen', () => {
    // Con costo 0 el margen daria 100%: una mentira comoda que haria creer
    // que todo el catalogo es rentabilisimo.
    expect(margen({ price: 5000 }, [], PORID, sinColchon)).toBeNull();
    expect(margen({ price: 5000 }, null, PORID, sinColchon)).toBeNull();
  });

  it('sin precio devuelve null en vez de dividir por cero', () => {
    expect(margen({ price: 0 }, lineas, PORID, sinColchon)).toBeNull();
  });

  it('avisa cuando se vende a perdida', () => {
    const m = margen({ price: 1000 }, lineas, PORID, sinColchon);
    expect(m.ganancia).toBe(-1000);
    expect(m.pct).toBeLessThan(0);
  });
});

describe('validateLineas', () => {
  it('acepta lineas completas', () => {
    expect(validateLineas([{ ingredient_id: 'harina', qty: 1 }])).toEqual([]);
  });

  it('rechaza el mismo insumo dos veces', () => {
    // La PK es (product_id, ingredient_id): el duplicado moriria en la DB.
    const errs = validateLineas([
      { ingredient_id: 'harina', qty: 1 },
      { ingredient_id: 'harina', qty: 2 },
    ]);
    expect(errs.length).toBe(1);
    expect(errs[0]).toMatch(/dos veces/);
  });

  it('rechaza cantidad 0 o negativa', () => {
    expect(validateLineas([{ ingredient_id: 'harina', qty: 0 }])).toHaveLength(1);
    expect(validateLineas([{ ingredient_id: 'harina', qty: -1 }])).toHaveLength(1);
  });

  it('rechaza linea sin insumo elegido', () => {
    expect(validateLineas([{ ingredient_id: '', qty: 1 }])).toHaveLength(1);
  });

  it('no repite el mismo mensaje por cada linea mala', () => {
    const errs = validateLineas([
      { ingredient_id: 'a', qty: 0 },
      { ingredient_id: 'b', qty: 0 },
    ]);
    expect(errs).toHaveLength(1);
  });
});

describe('agruparPorProducto', () => {
  it('arma un mapa por producto', () => {
    const mapa = agruparPorProducto([
      { product_id: 'p1', ingredient_id: 'harina', qty: 1 },
      { product_id: 'p1', ingredient_id: 'queso', qty: 2 },
      { product_id: 'p2', ingredient_id: 'harina', qty: 3 },
    ]);
    expect(mapa.get('p1')).toHaveLength(2);
    expect(mapa.get('p2')).toHaveLength(1);
    expect(mapa.get('p3')).toBeUndefined();
  });
});

describe('alcance por tenant', () => {
  it('fetchProductIngredients filtra por tenant', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);
    await fetchProductIngredients(TENANT);
    expect(c.eq).toHaveBeenCalledWith('tenant_id', TENANT);
  });

  it('sin tenantId no consulta', async () => {
    await expect(fetchProductIngredients()).rejects.toThrow(/tenantId/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('saveProductIngredients manda tenant_id en cada fila', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);
    await saveProductIngredients(TENANT, 'p1', [{ ingredient_id: 'harina', qty: 2 }]);
    expect(c.insert).toHaveBeenCalledWith([
      { tenant_id: TENANT, product_id: 'p1', ingredient_id: 'harina', qty: 2 },
    ]);
  });

  it('una receta invalida no toca la base', async () => {
    const r = await saveProductIngredients(TENANT, 'p1', [{ ingredient_id: 'x', qty: 0 }]);
    expect(r.__error).toBe('validation');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('vaciar la receta borra y no inserta nada', async () => {
    const c = chain({ data: [], error: null });
    mockFrom.mockReturnValue(c);
    const r = await saveProductIngredients(TENANT, 'p1', []);

    // Ojo: el helper `chain` usa UN solo vi.fn() para todos los metodos
    // encadenados, asi que c.insert y c.delete son la MISMA funcion y
    // `expect(c.insert).not.toHaveBeenCalled()` seria siempre falso. Hay que
    // mirar los argumentos: el unico que recibe un array de filas es insert.
    const insertoFilas = c.insert.mock.calls.some(args => Array.isArray(args[0]));
    expect(insertoFilas).toBe(false);
    expect(r).toEqual([]);
  });
});
