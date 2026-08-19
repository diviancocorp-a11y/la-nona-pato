// Los ejes del alta (6a): modo de operacion, canales y pais.
//
// El patron de los tres primeros casos es el mismo que ya usa registry.test.js
// con `vertical`: parsear el CHECK de la migracion y compararlo con el
// registry. Es la unica forma de que no se desincronicen — un valor que existe
// en el front y no en la DB mata el alta contra el CHECK, y uno que existe en
// la DB y no en el front cae silenciosamente en el default.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MODOS, CANALES, getModo, canalesPosibles, canalesSugeridos,
  tieneCanal, modulosDe, modosDisponibles, MODULOS,
} from '../modules/registry';
import {
  PAISES, getPais, monedaDe, zonaDe, idFiscalDe, facturaEn,
  adaptadorFiscal, paisesDisponibles, PAIS_POR_DEFECTO,
} from '../modules/paises';

const MIGRACION = resolve(__dirname, '../../platform/migrations/0039_ejes_del_alta.sql');
const sql = readFileSync(MIGRACION, 'utf-8').replace(/--[^\n]*/g, '');

/** Saca los literales de un `check (col in ('a','b'))` de la migracion. */
function valoresDelCheck(columna) {
  const re = new RegExp(`check\\s*\\(\\s*${columna}\\s+in\\s*\\(([^)]*)\\)`, 'i');
  const m = sql.match(re);
  expect(m, `no se encontro el CHECK de ${columna} en 0039`).not.toBeNull();
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
}

describe('modo de operacion', () => {
  it('los ids coinciden con el CHECK de tenants.operation_mode', () => {
    expect(Object.keys(MODOS).sort()).toEqual(valoresDelCheck('operation_mode'));
  });

  it('cada modo declara label y hint para el selector del alta', () => {
    for (const [id, m] of Object.entries(MODOS)) {
      expect(m.label, `${id}.label`).toBeTruthy();
      expect(m.hint, `${id}.hint`).toBeTruthy();
    }
    expect(modosDisponibles()).toHaveLength(Object.keys(MODOS).length);
  });

  it('un modo desconocido cae en el default en vez de romper', () => {
    expect(getModo('teletransportacion').id).toBe('fisico');
    expect(getModo(null).id).toBe('fisico');
  });
});

describe('canales', () => {
  it('los ids coinciden con el CHECK de tenants.channels', () => {
    // El de channels es `channels <@ array[...]`, no un `in (...)`.
    const m = sql.match(/channels\s*<@\s*array\s*\[([\s\S]*?)\]::text\[\]/i);
    expect(m).not.toBeNull();
    const enSql = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
    expect(Object.keys(CANALES).sort()).toEqual(enSql);
  });

  it('cada canal declara en que modos tiene sentido', () => {
    for (const [id, c] of Object.entries(CANALES)) {
      expect(c.label, `${id}.label`).toBeTruthy();
      expect(c.modos.length, `${id}.modos`).toBeGreaterThan(0);
      for (const modo of c.modos) expect(MODOS[modo], `${id} -> ${modo}`).toBeDefined();
    }
  });

  it('un negocio virtual no recibe gente: nada de mesa ni sin-turno', () => {
    const ids = canalesPosibles('virtual').map(c => c.id);
    expect(ids).not.toContain('table_service');
    expect(ids).not.toContain('walk_in');
    expect(ids).toContain('delivery');
  });

  it('las sugerencias del alta son siempre canales validos para ese modo', () => {
    for (const vertical of ['gastro', 'barber', 'retail']) {
      for (const modo of Object.keys(MODOS)) {
        const posibles = canalesPosibles(modo).map(c => c.id);
        const sugeridos = canalesSugeridos(vertical, modo);
        expect(sugeridos.length, `${vertical}/${modo} sin sugerencias`).toBeGreaterThan(0);
        for (const s of sugeridos) {
          expect(posibles, `${vertical}/${modo} sugiere ${s}, imposible en ese modo`).toContain(s);
        }
      }
    }
  });

  it('una dark kitchen no arranca con servicio de mesa', () => {
    expect(canalesSugeridos('gastro', 'virtual')).not.toContain('table_service');
    expect(canalesSugeridos('gastro', 'fisico')).toContain('table_service');
  });

  it('tieneCanal aguanta un tenant sin canales cargados', () => {
    expect(tieneCanal(null, 'delivery')).toBe(false);
    expect(tieneCanal([], 'delivery')).toBe(false);
    expect(tieneCanal(['delivery'], 'delivery')).toBe(true);
  });
});

describe('modulosDe cruza rubro y modo', () => {
  it('un negocio virtual no ve los modulos que necesitan salon', () => {
    const conSalon = modulosDe('gastro', 'fisico', { todos: true }).map(m => m.id);
    const sinSalon = modulosDe('gastro', 'virtual', { todos: true }).map(m => m.id);
    expect(conSalon).toContain('mesas');
    expect(conSalon).toContain('caja');
    expect(sinSalon).not.toContain('mesas');
    expect(sinSalon).not.toContain('caja');
    // Lo que no depende del salon sigue estando.
    expect(sinSalon).toContain('products');
    expect(sinSalon).toContain('orders');
  });

  it('hibrido ve lo del salon: atiende en el local ademas de a distancia', () => {
    expect(modulosDe('gastro', 'hibrido', { todos: true }).map(m => m.id)).toContain('mesas');
  });

  it('el mapa de mesas es de gastro: una barberia no lo tiene en ningun modo', () => {
    for (const modo of Object.keys(MODOS)) {
      expect(modulosDe('barber', modo, { todos: true }).map(m => m.id)).not.toContain('mesas');
      expect(modulosDe('retail', modo, { todos: true }).map(m => m.id)).not.toContain('mesas');
    }
  });

  it('sin modo no se filtra por salon: la firma vieja sigue andando', () => {
    // Hay llamadas con un solo argumento en el panel. Si esto rompe, la nav
    // del admin se vacia sin que ningun test lo note.
    expect(modulosDe('gastro').every(m => m.implementado)).toBe(true);
    expect(modulosDe('gastro', { todos: true }).map(m => m.id)).toContain('caja');
  });

  it('todo modulo marcado requiereSalon existe en MODULOS', () => {
    for (const m of Object.values(MODULOS)) {
      if (m.requiereSalon) expect(typeof m.id).toBe('string');
    }
  });
});

describe('paises', () => {
  it('los ids coinciden con el CHECK de tenants.country', () => {
    expect(Object.keys(PAISES).sort()).toEqual(valoresDelCheck('country'));
  });

  it('cada pais declara moneda, zona, identificador fiscal e IVA', () => {
    for (const [id, p] of Object.entries(PAISES)) {
      expect(p.currency, `${id}.currency`).toMatch(/^[A-Z]{3}$/);
      expect(p.timezone, `${id}.timezone`).toContain('/');
      expect(p.idFiscal, `${id}.idFiscal`).toBeTruthy();
      expect(typeof p.ivaDefault, `${id}.ivaDefault`).toBe('number');
    }
  });

  it('solo Argentina factura: el resto se puede elegir pero no emite', () => {
    // Si esto falla es porque alguien marco un pais como facturable sin
    // escribir su adaptador. Prometer eso es vender lo que no existe.
    const facturan = Object.values(PAISES).filter(p => p.fiscal != null).map(p => p.id);
    expect(facturan).toEqual(['AR']);
    expect(facturaEn('AR')).toBe(true);
    expect(adaptadorFiscal('AR')).toBe('arca');
    expect(facturaEn('MX')).toBe(false);
    expect(adaptadorFiscal('MX')).toBeNull();
  });

  it('un pais desconocido cae en el default en vez de romper', () => {
    expect(getPais('ZZ').id).toBe(PAIS_POR_DEFECTO);
    expect(getPais(null).id).toBe(PAIS_POR_DEFECTO);
    expect(getPais('ar').id).toBe('AR');   // tolera minusculas
  });

  it('los helpers devuelven lo del pais pedido', () => {
    expect(monedaDe('MX')).toBe('MXN');
    expect(zonaDe('CL')).toBe('America/Santiago');
    expect(idFiscalDe('MX')).toBe('RFC');
    expect(idFiscalDe('AR')).toBe('CUIT');
  });

  it('el selector del alta expone si ese pais factura', () => {
    const lista = paisesDisponibles();
    expect(lista.find(p => p.id === 'AR').factura).toBe(true);
    expect(lista.find(p => p.id === 'UY').factura).toBe(false);
  });
});

describe('signup_tenant acepta los ejes nuevos', () => {
  it('la migracion lee los ejes del user_metadata', () => {
    for (const campo of ['operation_mode', 'country', 'currency', 'timezone']) {
      expect(sql, `signup_tenant no lee ${campo}`).toContain(`v_meta->>'${campo}'`);
    }
    // channels es un array: se lee como jsonb (`->`), no como texto (`->>`).
    expect(sql, 'signup_tenant no lee channels').toContain("v_meta->'channels'");
  });

  it('filtra los canales invalidos en vez de tirar el alta', () => {
    // El CHECK de la tabla no perdona un canal mal escrito. Perder ese canal
    // es mejor que perder el negocio entero.
    expect(sql).toMatch(/where c in \(/);
  });

  it('sigue siendo idempotente: devuelve el tenant existente en vez de fallar', () => {
    // La garantia de 0019. Si alguien la saca al editar la funcion, el dueño
    // que recarga /bienvenido recibe un error en vez de entrar a su local.
    expect(sql).toContain('already_existed');
  });

  it('cae en defaults usables si el metadata no trae los ejes', () => {
    // Una cuenta creada antes de este deploy confirma el mail despues y tiene
    // que poder crear su negocio igual.
    expect(sql).toMatch(/v_modo\s*:=\s*'fisico'/);
    expect(sql).toMatch(/v_country\s*:=\s*'AR'/);
  });
});
