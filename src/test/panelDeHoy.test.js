// El panel del fundador.
//
// Lo que importa que sea cierto:
//   - que PRIMER PEDIDO y PRIMER VALOR no se confundan. Un negocio que creó un
//     pedido y no lo cobró probó, no arrancó — y contarlo como arrancado
//     esconde justo al que hay que llamar;
//   - que "se apagó" no se le aplique a quien nunca prendió: mezclar los dos
//     esconde a los dos;
//   - que la mora gane siempre, porque es plata vendida que no entró;
//   - que la demora al primer valor sea MEDIANA. Con pocos negocios, uno que
//     tardó medio año corre el promedio y hace parecer que el producto no se
//     entiende;
//   - que el ciclo anual se normalice a mes en el MRR.

import { describe, it, expect } from 'vitest';
import {
  panelDeHoy, cifrasDe, pendientesDe, mensualDe, estaPago, nombreDelPrimerValor,
} from '../modules/panelDeHoy';

const HOY = new Date('2026-08-24T12:00:00Z');
const haceDias = (d) => new Date(HOY.getTime() - d * 86400000).toISOString();
const enDias = (d) => new Date(HOY.getTime() + d * 86400000).toISOString();

const PLANES = [
  { id: 'digital', precio_mensual: 29000, precio_anual_por_mes: 23200 },
  { id: 'local', precio_mensual: 59000, precio_anual_por_mes: 47200 },
];

const negocio = (extra) => ({
  slug: 'n', name: 'Negocio', vertical: 'gastro', status: 'active',
  activated_at: haceDias(30), last_activity_at: haceDias(1),
  first_order_at: null, first_value_at: null,
  plan_id: null, ciclo: 'mensual', paga_hasta: null,
  ...extra,
});

describe('probó no es lo mismo que arrancó', () => {
  it('crear un pedido sin cobrarlo no cuenta como primer valor', () => {
    const n = negocio({ first_order_at: haceDias(20), first_value_at: null });
    expect(cifrasDe([n], PLANES, HOY).llegaronAlPrimerValor).toBe(0);
  });

  it('y sigue apareciendo como pendiente de arrancar', () => {
    const n = negocio({ first_order_at: haceDias(20), first_value_at: null });
    const p = pendientesDe([n], HOY);
    expect(p.find((x) => x.que === 'sin primer valor')).toBeTruthy();
  });

  it('cobrarlo sí cuenta', () => {
    const n = negocio({ first_value_at: haceDias(5) });
    expect(cifrasDe([n], PLANES, HOY).llegaronAlPrimerValor).toBe(1);
    expect(pendientesDe([n], HOY).find((x) => x.que === 'sin primer valor')).toBeUndefined();
  });
});

describe('apagarse y no haber prendido nunca son cosas distintas', () => {
  it('el que arrancó y se apagó aparece como sin actividad', () => {
    const n = negocio({ first_value_at: haceDias(60), last_activity_at: haceDias(20) });
    const p = pendientesDe([n], HOY);
    expect(p.find((x) => x.que === 'sin actividad')?.dias).toBe(20);
  });

  it('el que nunca arrancó NO aparece como sin actividad', () => {
    // Aparece como "sin primer valor", que es otro problema y otra llamada.
    const n = negocio({ first_value_at: null, last_activity_at: haceDias(40) });
    const p = pendientesDe([n], HOY);
    expect(p.find((x) => x.que === 'sin actividad')).toBeUndefined();
    expect(p.find((x) => x.que === 'sin primer valor')).toBeTruthy();
  });
});

describe('la mora manda', () => {
  it('un vencido aparece primero, por encima de todo lo demás', () => {
    const vencido = negocio({
      slug: 'debe', plan_id: 'digital', paga_hasta: haceDias(9),
      first_value_at: haceDias(90),
    });
    const flojo = negocio({ slug: 'flojo', first_value_at: null, activated_at: haceDias(5) });
    const p = pendientesDe([flojo, vencido], HOY);
    expect(p[0].slug).toBe('debe');
    expect(p[0].que).toBe('en mora');
    expect(p[0].urgencia).toBe('alta');
  });

  it('por vencer avisa con una semana', () => {
    const n = negocio({ plan_id: 'digital', paga_hasta: enDias(4), first_value_at: haceDias(50) });
    expect(pendientesDe([n], HOY).find((x) => x.que === 'por vencer')?.detalle).toMatch(/4 días/);
  });

  it('un negocio sin plan no puede estar en mora', () => {
    // No le vendiste nada: no te debe nada.
    const n = negocio({ plan_id: null, paga_hasta: haceDias(30), first_value_at: haceDias(50) });
    expect(pendientesDe([n], HOY).find((x) => x.que === 'en mora')).toBeUndefined();
  });
});

describe('los cancelados no molestan', () => {
  it('no cuentan ni aparecen', () => {
    const n = negocio({ status: 'cancelado', plan_id: 'digital', paga_hasta: haceDias(40) });
    expect(cifrasDe([n], PLANES, HOY).negocios).toBe(0);
    expect(pendientesDe([n], HOY)).toEqual([]);
  });
});

describe('la demora al primer valor', () => {
  it('es mediana y no promedio', () => {
    // Uno tardó 180 días; el resto, dos. El promedio diría 46, la mediana 2.
    const ns = [
      negocio({ activated_at: haceDias(200), first_value_at: haceDias(20) }),
      negocio({ activated_at: haceDias(10), first_value_at: haceDias(8) }),
      negocio({ activated_at: haceDias(9), first_value_at: haceDias(7) }),
    ];
    expect(cifrasDe(ns, PLANES, HOY).medianaAlPrimerValor).toBe(2);
  });

  it('sin nadie que haya llegado, es null y no cero', () => {
    // Cero días diría "arrancan al instante", que es lo contrario de la verdad.
    expect(cifrasDe([negocio()], PLANES, HOY).medianaAlPrimerValor).toBe(null);
  });
});

describe('el MRR', () => {
  it('el ciclo anual se normaliza a mes', () => {
    const anual = negocio({ plan_id: 'digital', ciclo: 'anual', paga_hasta: enDias(200) });
    expect(mensualDe(anual, PLANES)).toBe(23200);
  });

  it('sólo suma a los que están pagos hoy', () => {
    const ns = [
      negocio({ slug: 'a', plan_id: 'local', paga_hasta: enDias(10) }),
      negocio({ slug: 'b', plan_id: 'local', paga_hasta: haceDias(10) }), // vencido
      negocio({ slug: 'c', plan_id: null, paga_hasta: enDias(10) }),      // sin plan
    ];
    const c = cifrasDe(ns, PLANES, HOY);
    expect(c.clientesPagos).toBe(1);
    expect(c.mrr).toBe(59000);
    expect(c.enMora).toBe(1);
  });

  it('un plan que no existe no rompe la cuenta', () => {
    expect(mensualDe(negocio({ plan_id: 'inventado' }), PLANES)).toBe(0);
  });

  it('estar pago exige plan Y fecha vigente', () => {
    expect(estaPago(negocio({ plan_id: 'digital', paga_hasta: enDias(1) }), HOY)).toBe(true);
    expect(estaPago(negocio({ plan_id: 'digital', paga_hasta: haceDias(1) }), HOY)).toBe(false);
    expect(estaPago(negocio({ plan_id: null, paga_hasta: enDias(1) }), HOY)).toBe(false);
  });
});

describe('cómo se llama el primer valor', () => {
  it('cambia con el rubro', () => {
    expect(nombreDelPrimerValor('gastro')).toBe('primer pedido cobrado');
    expect(nombreDelPrimerValor('barber')).toBe('primer turno cobrado');
    expect(nombreDelPrimerValor('retail')).toBe('primera venta');
  });

  it('un rubro nuevo no deja el texto vacío', () => {
    expect(nombreDelPrimerValor('kiosco')).toBe('primera operación cobrada');
  });
});

describe('el estado real de Dico hoy', () => {
  it('siete negocios, ninguno con primer valor, cero pagos', () => {
    // La foto del 24/ago/2026, que es la que hizo cambiar el plan.
    const ns = Array.from({ length: 7 }, (_, i) => negocio({ slug: `n${i}` }));
    const { cifras, pendientes } = panelDeHoy(ns, PLANES, HOY);
    expect(cifras.negocios).toBe(7);
    expect(cifras.llegaronAlPrimerValor).toBe(0);
    expect(cifras.clientesPagos).toBe(0);
    expect(cifras.mrr).toBe(0);
    // Los siete pendientes de arrancar: eso es el trabajo de hoy.
    expect(pendientes).toHaveLength(7);
    expect(pendientes.every((p) => p.que === 'sin primer valor')).toBe(true);
  });
});
