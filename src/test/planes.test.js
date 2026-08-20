// Los planes de Dico.
//
// Lo que importa que sea cierto:
//   - que el cronograma de la promo de un plan sea EL MISMO numero en la
//     pagina de precios, en el panel y en el cobro. Tres lugares calculando lo
//     mismo terminan diciendo tres cosas distintas, y una de ellas se factura;
//   - que la promo de cada plan sea la que se decidio: Digital solo el mes
//     gratis, Local ademas 3 meses al 50%;
//   - que el salon este en Local y no en Digital, que es lo que separa un plan
//     del otro.

import { describe, it, expect } from 'vitest';
import {
  PLANES, planTieneModulo, planMinimoPara, limiteDe, alcanzoElLimite,
  planSugerido, cronogramaDeAlta, totalPrimerAnio,
} from '../modules/planes';

// Como vienen en la tabla `plans` tras la migracion 0052.
const DIGITAL = {
  id: 'digital', nombre: 'Digital', precio_mensual: 29000,
  precio_anual_por_mes: 23200, meses_gratis: 1, meses_descuento: 0, descuento_pct: 0,
};
const LOCAL = {
  id: 'local', nombre: 'Local', precio_mensual: 59000,
  precio_anual_por_mes: 47200, meses_gratis: 1, meses_descuento: 3, descuento_pct: 50,
};

describe('que incluye cada plan', () => {
  it('el salon es lo que separa Local de Digital', () => {
    for (const m of ['mesas', 'caja', 'personal', 'agenda']) {
      expect(planTieneModulo('digital', m), `digital no deberia traer ${m}`).toBe(false);
      expect(planTieneModulo('local', m), `local deberia traer ${m}`).toBe(true);
    }
  });

  it('Digital si trae con que vender a distancia', () => {
    for (const m of ['products', 'orders', 'stock', 'ventas']) {
      expect(planTieneModulo('digital', m)).toBe(true);
    }
  });

  it('dice cual es el plan minimo para un modulo', () => {
    // Es lo que deja decir "Salón está en el plan Local" en vez de "no tenés
    // permiso", que no le dice a nadie que hacer.
    expect(planMinimoPara('mesas')).toBe('local');
    expect(planMinimoPara('products')).toBe('digital');
    expect(planMinimoPara('modulo_inventado')).toBe(null);
  });

  it('un plan que no existe no habilita nada', () => {
    expect(planTieneModulo('no_existe', 'products')).toBe(false);
    expect(planTieneModulo(null, 'products')).toBe(false);
  });
});

describe('limites', () => {
  it('Digital es de un solo local', () => {
    expect(limiteDe('digital', 'sucursales')).toBe(1);
    expect(limiteDe('cadena', 'sucursales')).toBeGreaterThan(1);
  });

  it('avisa cuando llego al tope', () => {
    expect(alcanzoElLimite('digital', 'usuarios', 3)).toBe(true);
    expect(alcanzoElLimite('digital', 'usuarios', 2)).toBe(false);
  });

  it('un limite que el plan no declara no bloquea', () => {
    // Sin esto, agregar un limite nuevo dejaria a todos los planes viejos en
    // cero y bloquearia a clientes que estaban trabajando.
    expect(limiteDe('local', 'limite_que_no_existe')).toBe(Infinity);
    expect(alcanzoElLimite('local', 'limite_que_no_existe', 99999)).toBe(false);
  });
});

describe('el plan que se sugiere en el alta', () => {
  it('quien vende solo a distancia arranca en Digital', () => {
    expect(planSugerido('virtual')).toBe('digital');
  });

  it('quien tiene salon arranca en Local', () => {
    expect(planSugerido('fisico')).toBe('local');
    expect(planSugerido('hibrido')).toBe('local');
  });

  it('sin modo, cae en el de entrada', () => {
    expect(planSugerido(null)).toBe('digital');
    expect(planSugerido('lo_que_sea')).toBe('digital');
  });
});

describe('la promo, mes a mes', () => {
  it('Digital: solo el primer mes gratis', () => {
    const c = cronogramaDeAlta(DIGITAL, 12);
    expect(c[0].importe).toBe(0);
    expect(c[1].importe).toBe(29000);
    expect(c[2].importe).toBe(29000);
  });

  it('Local: mes gratis y despues 3 meses a mitad de precio', () => {
    const c = cronogramaDeAlta(LOCAL, 12);
    expect(c[0].importe).toBe(0);          // gratis
    expect(c[1].importe).toBe(29500);      // 50% de 59000
    expect(c[2].importe).toBe(29500);
    expect(c[3].importe).toBe(29500);
    expect(c[4].importe).toBe(59000);      // ya sin promo
  });

  it('el primer anio de Local da la cuenta que se decidio', () => {
    // 0 + 3 meses a 29500 + 8 meses a 59000
    expect(totalPrimerAnio(LOCAL)).toBe(29500 * 3 + 59000 * 8);
  });

  it('el primer anio de Digital resigna un solo mes', () => {
    expect(totalPrimerAnio(DIGITAL)).toBe(29000 * 11);
  });

  it('sin promo cobra todos los meses', () => {
    const sinPromo = { ...LOCAL, meses_gratis: 0, meses_descuento: 0, descuento_pct: 0 };
    expect(totalPrimerAnio(sinPromo)).toBe(59000 * 12);
  });

  it('un plan sin datos no rompe la pantalla', () => {
    expect(cronogramaDeAlta(null)).toEqual([]);
    expect(totalPrimerAnio(null)).toBe(0);
  });
});

describe('el plan Total queda modelado y sin vender', () => {
  it('existe y declara lo que le falta', () => {
    expect(PLANES.total).toBeTruthy();
    expect(PLANES.total.pendiente).toContain('facturacion-electronica');
    expect(PLANES.total.pendiente).toContain('soporte-24h-ia');
  });

  it('los planes que se venden no tienen pendientes', () => {
    for (const id of ['digital', 'local', 'cadena']) {
      expect(PLANES[id].pendiente, `${id} no deberia tener pendientes`).toBeUndefined();
    }
  });
});
