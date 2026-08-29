// src/test/suscripcion.test.js
//
// Cubre el paso 1 de la monetizacion: LEER el estado, sin bloquear nada.
// Lo que mas importa de estos tests no es que los estados se calculen bien
// —eso es aritmetica de fechas— sino los dos casos que la auditoria del 29/ago
// encontro en produccion y que van a seguir apareciendo un tiempo:
//
//   - los 7 negocios actuales tienen `paga_hasta` en null  -> 'sin_fecha'
//   - el alta self-service no asigna plan_id                -> 'sin_plan'
//
// Si alguien cablea el bloqueo antes de tiempo, estos tests son los que avisan
// que estaria dejando afuera a todos los clientes que hay hoy.

import { describe, it, expect } from 'vitest';
import {
  estadoDeSuscripcion, puedeOperar, resumenDeSuscripcion, DIAS_DE_AVISO,
} from '../modules/suscripcion';

const enDias = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const negocio = (extra = {}) => ({
  id: 't1', slug: 'x', status: 'active', plan_id: 'local', ciclo: 'mensual',
  paga_hasta: enDias(30), ...extra,
});

describe('estadoDeSuscripcion', () => {
  it('al dia cuando falta bastante', () => {
    expect(estadoDeSuscripcion(negocio())).toBe('al_dia');
  });

  it('por vencer dentro de la ventana de aviso', () => {
    expect(estadoDeSuscripcion(negocio({ paga_hasta: enDias(DIAS_DE_AVISO - 1) })))
      .toBe('por_vencer');
  });

  it('vencida cuando la fecha ya paso', () => {
    expect(estadoDeSuscripcion(negocio({ paga_hasta: enDias(-3) }))).toBe('vencida');
  });

  it('suspendida SOLO si lo dice la base, no la fecha', () => {
    // Vencida hace 60 dias pero el server no la suspendio: sigue 'vencida'.
    // El front no inventa suspensiones.
    expect(estadoDeSuscripcion(negocio({ paga_hasta: enDias(-60) }))).toBe('vencida');
    expect(estadoDeSuscripcion(negocio({ status: 'suspendido' }))).toBe('suspendida');
  });

  it('el status suspendido gana sobre cualquier fecha futura', () => {
    expect(estadoDeSuscripcion(negocio({ status: 'suspendido', paga_hasta: enDias(300) })))
      .toBe('suspendida');
  });

  // ── Los dos casos reales de produccion al 29/ago ──

  it('sin_fecha: es el caso de los 7 negocios de hoy', () => {
    // La 0052 les asigno plan de forma retroactiva y nadie cargo paga_hasta.
    expect(estadoDeSuscripcion(negocio({ paga_hasta: null }))).toBe('sin_fecha');
  });

  it('sin_plan: es lo que va a pasarle a toda alta self-service', () => {
    // signup_tenant no asigna plan_id. Hasta que lo haga, todo negocio nuevo
    // nace asi.
    expect(estadoDeSuscripcion(negocio({ plan_id: null }))).toBe('sin_plan');
  });

  it('sin tenant no explota', () => {
    expect(estadoDeSuscripcion(null)).toBe('sin_plan');
    expect(estadoDeSuscripcion(undefined)).toBe('sin_plan');
  });

  it('una fecha invalida cae en sin_fecha, no en vencida', () => {
    // Tratar basura como "vencida" es lo que suspenderia a alguien por un dato
    // mal cargado.
    expect(estadoDeSuscripcion(negocio({ paga_hasta: 'no-es-fecha' }))).toBe('sin_fecha');
  });
});

describe('puedeOperar: hoy NADIE queda afuera salvo por status', () => {
  it('deja operar sin plan', () => {
    expect(puedeOperar(negocio({ plan_id: null }))).toBe(true);
  });

  it('deja operar sin fecha de pago', () => {
    expect(puedeOperar(negocio({ paga_hasta: null }))).toBe(true);
  });

  it('deja operar con la suscripcion vencida (hay gracia por diseno)', () => {
    expect(puedeOperar(negocio({ paga_hasta: enDias(-10) }))).toBe(true);
  });

  it('corta solo si la base dice suspendido', () => {
    expect(puedeOperar(negocio({ status: 'suspendido' }))).toBe(false);
  });
});

describe('resumenDeSuscripcion', () => {
  it('arma lo que consume el hook', () => {
    const r = resumenDeSuscripcion(negocio({ ciclo: 'anual', paga_hasta: enDias(45) }));
    expect(r.planId).toBe('local');
    expect(r.ciclo).toBe('anual');
    expect(r.estado).toBe('al_dia');
    expect(r.puedeOperar).toBe(true);
    expect(r.necesitaAtencion).toBe(false);
    expect(r.diasRestantes).toBeGreaterThan(40);
  });

  it('marca necesitaAtencion en los estados de produccion de hoy', () => {
    expect(resumenDeSuscripcion(negocio({ paga_hasta: null })).necesitaAtencion).toBe(true);
    expect(resumenDeSuscripcion(negocio({ plan_id: null })).necesitaAtencion).toBe(true);
  });

  it('sin tenant devuelve algo usable en vez de romper el panel', () => {
    const r = resumenDeSuscripcion(null);
    expect(r.planId).toBe(null);
    expect(r.ciclo).toBe('mensual');
    expect(r.estado).toBe('sin_plan');
    // Sin tenant todavia no hay a quien bloquear: el gate real es `status`.
    expect(r.puedeOperar).toBe(true);
  });
});
