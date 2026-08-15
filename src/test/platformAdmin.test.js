import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateProduct, categoriesFrom,
  nextOrderStatus, PlatformOrderStatus, PLATFORM_ORDER_STATUSES, OPEN_ORDER_STATUSES,
} from '../services/platformAdmin';

describe('validateProduct', () => {
  const ok = { name: 'Milanesa', price: 8500 };

  it('acepta lo minimo: nombre + precio', () => {
    expect(validateProduct(ok)).toEqual([]);
  });

  it('rechaza nombre vacio o solo espacios', () => {
    expect(validateProduct({ ...ok, name: '' })).toHaveLength(1);
    expect(validateProduct({ ...ok, name: '   ' })).toHaveLength(1);
  });

  it('acepta precio 0 (algo puede ser gratis) pero no negativo', () => {
    expect(validateProduct({ ...ok, price: 0 })).toEqual([]);
    expect(validateProduct({ ...ok, price: -1 })).toHaveLength(1);
  });

  it('rechaza precio no numerico', () => {
    expect(validateProduct({ ...ok, price: 'gratis' })).toHaveLength(1);
    expect(validateProduct({ ...ok, price: '' })).toHaveLength(1);
  });

  it('la duracion es opcional, pero si viene tiene que ser > 0', () => {
    expect(validateProduct({ ...ok, duration_min: '' })).toEqual([]);
    expect(validateProduct({ ...ok, duration_min: null })).toEqual([]);
    expect(validateProduct({ ...ok, duration_min: 30 })).toEqual([]);
    expect(validateProduct({ ...ok, duration_min: 0 })).toHaveLength(1);
  });

  it('junta todos los problemas, no solo el primero', () => {
    expect(validateProduct({ name: '', price: -5 })).toHaveLength(2);
  });

  it('no explota con undefined', () => {
    expect(validateProduct(undefined).length).toBeGreaterThan(0);
  });
});

describe('categoriesFrom', () => {
  it('deduplica, saca vacios y ordena en español', () => {
    const products = [
      { category: 'Postres' }, { category: 'Bebidas' }, { category: 'Postres' },
      { category: null }, { category: '' }, { category: 'Ñoquis' }, { category: 'Zapallo' },
    ];
    expect(categoriesFrom(products)).toEqual(['Bebidas', 'Ñoquis', 'Postres', 'Zapallo']);
  });

  it('catalogo vacio -> lista vacia', () => {
    expect(categoriesFrom([])).toEqual([]);
  });
});

describe('ciclo de vida del pedido', () => {
  it('avanza en el orden esperado hasta completado', () => {
    const camino = [];
    let s = PlatformOrderStatus.PENDING_PAYMENT;
    while (s) { camino.push(s); s = nextOrderStatus(s); }
    expect(camino).toEqual(['pending_payment', 'new', 'preparing', 'active', 'completed']);
  });

  it('los estados terminales no avanzan', () => {
    expect(nextOrderStatus(PlatformOrderStatus.COMPLETED)).toBeNull();
    expect(nextOrderStatus(PlatformOrderStatus.CANCELLED)).toBeNull();
  });

  it('un estado desconocido no avanza en vez de romper', () => {
    expect(nextOrderStatus('pending')).toBeNull();
    expect(nextOrderStatus(undefined)).toBeNull();
  });

  it('abiertos y cerrados particionan el vocabulario completo', () => {
    const cerrados = PLATFORM_ORDER_STATUSES.filter(s => !OPEN_ORDER_STATUSES.includes(s));
    expect(cerrados).toEqual(['completed', 'cancelled']);
  });
});

// Mismo patron que reservedSlugsSync: un vocabulario que vive en dos lenguajes
// (JS y el CHECK de SQL) solo se mantiene sincronizado con un test que los
// compare. Si divergen, el sintoma es un update que muere contra el CHECK
// recien en produccion, con el pedido ya en pantalla.
const MIGRACION = resolve(__dirname, '../../platform/migrations/0022_order_status_check.sql');

function estadosDelSql() {
  const sql = readFileSync(MIGRACION, 'utf-8').replace(/--[^\n]*/g, '');
  const m = sql.match(/constraint\s+orders_status_check[\s\S]*?\bin\s*\(([\s\S]*?)\)/i);
  if (!m) throw new Error('No se encontro el IN (...) de orders_status_check en 0022');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

describe('estados de pedido: JS vs SQL', () => {
  it('la lista JS y el CHECK de la migracion son identicos', () => {
    const sql = estadosDelSql();
    expect([...PLATFORM_ORDER_STATUSES].sort()).toEqual([...sql].sort());
  });

  it('el default de la migracion es un estado valido', () => {
    const sql = readFileSync(MIGRACION, 'utf-8');
    const m = sql.match(/alter\s+column\s+status\s+set\s+default\s+'([^']+)'/i);
    expect(m).not.toBeNull();
    expect(estadosDelSql()).toContain(m[1]);
  });
});
