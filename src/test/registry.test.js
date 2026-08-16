import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RUBROS, MODULOS, getRubro, terminologia, tipoPorDefecto,
  usaCampo, camposDe, modulosDe, tieneModulo, rubrosDisponibles,
  usaContabilidadUsar,
} from '../modules/registry';

describe('rubros', () => {
  it('los ids coinciden con el CHECK de tenants.vertical en la migracion 0001', () => {
    // Si alguien agrega un rubro al registry y no a la DB, el alta de ese
    // tenant muere contra el CHECK. Y al reves, un rubro en la DB sin entrada
    // aca cae silenciosamente en gastro.
    const sql = readFileSync(
      resolve(__dirname, '../../platform/migrations/0001_multitenant_foundation.sql'), 'utf-8'
    ).replace(/--[^\n]*/g, '');
    const m = sql.match(/vertical\s+text\s+not\s+null\s+check\s*\(\s*vertical\s+in\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    const enSql = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    expect(Object.keys(RUBROS).sort()).toEqual(enSql);
  });

  it('cada rubro declara terminologia completa', () => {
    for (const [id, r] of Object.entries(RUBROS)) {
      for (const clave of ['plural', 'singular', 'nuevo', 'buscar', 'ejemplo', 'ejemploCategoria']) {
        expect(r.terminologia[clave], `${id}.terminologia.${clave}`).toBeTruthy();
      }
    }
  });

  it('cada rubro declara solo modulos que existen en MODULOS', () => {
    for (const [id, r] of Object.entries(RUBROS)) {
      for (const mod of r.modulos) {
        expect(MODULOS[mod], `${id} declara el modulo inexistente "${mod}"`).toBeDefined();
      }
    }
  });

  it('todos los rubros pueden cargar y vender algo', () => {
    for (const [id, r] of Object.entries(RUBROS)) {
      expect(r.campos, `${id} sin nombre`).toContain('name');
      expect(r.campos, `${id} sin precio`).toContain('price');
      expect(r.modulos, `${id} sin catalogo`).toContain('products');
      expect(r.modulos, `${id} sin pedidos`).toContain('orders');
    }
  });
});

describe('getRubro', () => {
  it('un vertical desconocido cae en gastro en vez de romper', () => {
    // Hay CHECK en la DB, asi que no deberia pasar. Pero si pasa, un panel
    // usable es mejor que una pantalla en blanco.
    expect(getRubro('veterinaria').id).toBe('gastro');
    expect(getRubro(undefined).id).toBe('gastro');
    expect(getRubro(null).id).toBe('gastro');
  });
});

describe('campos por rubro', () => {
  it('la barberia carga duracion y no stock', () => {
    expect(usaCampo('barber', 'duration_min')).toBe(true);
    expect(usaCampo('barber', 'stock')).toBe(false);
  });

  it('el retail carga stock y no duracion', () => {
    expect(usaCampo('retail', 'stock')).toBe(true);
    expect(usaCampo('retail', 'duration_min')).toBe(false);
  });

  it('gastro no carga ninguno de los dos', () => {
    expect(usaCampo('gastro', 'duration_min')).toBe(false);
    expect(usaCampo('gastro', 'stock')).toBe(false);
  });

  it('un corte de pelo no se restringe por edad', () => {
    expect(usaCampo('barber', 'requires_age_gate')).toBe(false);
    expect(usaCampo('gastro', 'requires_age_gate')).toBe(true);
  });

  it('camposDe devuelve la lista completa', () => {
    expect(camposDe('gastro')).toContain('name');
    expect(camposDe('barber')).toContain('duration_min');
  });
});

describe('terminologia', () => {
  it('cada rubro llama distinto a lo que vende', () => {
    expect(terminologia('gastro').plural).toBe('Productos');
    expect(terminologia('barber').plural).toBe('Servicios');
    expect(terminologia('retail').plural).toBe('Artículos');
  });
});

describe('tipoPorDefecto', () => {
  it('una barberia vende servicios, no productos', () => {
    expect(tipoPorDefecto('barber')).toBe('service');
  });

  it('el resto arranca en simple', () => {
    for (const v of ['gastro', 'retail', undefined]) {
      expect(tipoPorDefecto(v)).toBe('simple');
    }
  });

  it('los tipos son los que acepta el CHECK de products.type', () => {
    const validos = ['composite', 'simple', 'variant_parent', 'service'];
    for (const r of Object.values(RUBROS)) {
      expect(validos).toContain(r.productType);
    }
  });
});

describe('modulos', () => {
  it('solo devuelve los implementados', () => {
    const ids = modulosDe('barber').map(m => m.id);
    expect(ids).toEqual(['products', 'orders', 'finanzas']);
    // agenda y caja estan declaradas para barberia pero todavia no existen
    expect(ids).not.toContain('agenda');
    expect(ids).not.toContain('caja');
  });

  // Stock es de insumos: una barberia no ingresa mercaderia, y por eso su
  // pestaña de Finanzas no muestra la solapa de Compra.
  it('stock es de gastro y retail, no de barberia', () => {
    expect(tieneModulo('gastro', 'stock')).toBe(true);
    expect(tieneModulo('retail', 'stock')).toBe(true);
    expect(tieneModulo('barber', 'stock')).toBe(false);
  });

  it('gastos y proveedores los tiene cualquier rubro', () => {
    for (const id of Object.keys(RUBROS)) {
      expect(tieneModulo(id, 'finanzas'), id).toBe(true);
    }
  });

  // USAR es el plan de cuentas de la gastronomia. A una barberia no se le
  // pide clasificar un gasto en "Comida — Lacteos".
  it('la contabilidad USAR es solo gastronomica', () => {
    expect(usaContabilidadUsar('gastro')).toBe(true);
    expect(usaContabilidadUsar('barber')).toBe(false);
    expect(usaContabilidadUsar('retail')).toBe(false);
  });

  it('con todos:true aparece la hoja de ruta completa', () => {
    const ids = modulosDe('barber', { todos: true }).map(m => m.id);
    expect(ids).toContain('agenda');
    expect(ids).toContain('caja');
  });

  it('tieneModulo responde por lo que existe hoy', () => {
    expect(tieneModulo('barber', 'products')).toBe(true);
    expect(tieneModulo('barber', 'agenda')).toBe(false);
    expect(tieneModulo('gastro', 'agenda')).toBe(false);
  });

  it('todos los rubros tienen al menos un modulo usable', () => {
    for (const id of Object.keys(RUBROS)) {
      expect(modulosDe(id).length, `${id} sin modulos implementados`).toBeGreaterThan(0);
    }
  });
});

describe('rubrosDisponibles', () => {
  it('devuelve id + label para un selector de alta', () => {
    const lista = rubrosDisponibles();
    expect(lista).toHaveLength(Object.keys(RUBROS).length);
    for (const r of lista) {
      expect(r.id).toBeTruthy();
      expect(r.label).toBeTruthy();
    }
  });
});
