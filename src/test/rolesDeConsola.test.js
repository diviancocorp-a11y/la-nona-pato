// Los puestos de la consola de Dico.
//
// Lo que importa que sea cierto:
//   - que marketing NO vea la lista de negocios. Es el dato mas delicado de la
//     consola —quien es cliente y cuanto paga— y no hace falta para comunicar
//     precios;
//   - que soporte VEA los negocios y no los toque: tiene que poder atender sin
//     poder dejar a alguien sin cobrar;
//   - que solo administrador edite precios, que es lo que ademas esta en RLS;
//   - que "repartir accesos" siga siendo del DUENIO y no del puesto: si un
//     administrador pudiera nombrar administradores, el acceso volveria a ser
//     transitivo, que es lo que 0053 cerro;
//   - que una seccion nueva nazca OCULTA. La matriz declara solo lo que se ve,
//     asi el olvido es seguro.

import { describe, it, expect } from 'vitest';
import {
  PUESTOS, ACCESO, accesoDe, puedeVer, puedeEditar, seccionesDe,
  pantallaInicial, etiquetaDePuesto,
} from '../modules/rolesDeConsola';

const ids = (puesto, opts) => seccionesDe(puesto, opts).map((s) => s.id);

describe('quién ve qué', () => {
  it('marketing no ve la lista de negocios', () => {
    expect(puedeVer('marketing', 'negocios')).toBe(false);
    expect(ids('marketing')).toEqual(['planes']);
  });

  it('soporte ve los negocios y no los toca', () => {
    expect(accesoDe('soporte', 'negocios')).toBe(ACCESO.LECTURA);
    expect(puedeVer('soporte', 'negocios')).toBe(true);
    expect(puedeEditar('soporte', 'negocios')).toBe(false);
  });

  it('ventas mueve suscripciones y lee precios', () => {
    expect(puedeEditar('ventas', 'negocios')).toBe(true);
    expect(puedeEditar('ventas', 'planes')).toBe(false);
    expect(puedeVer('ventas', 'planes')).toBe(true);
  });

  it('solo administrador edita precios', () => {
    for (const p of Object.keys(PUESTOS)) {
      expect(puedeEditar(p, 'planes'), p).toBe(p === 'administrador');
    }
  });
});

describe('repartir accesos es del dueño, no del puesto', () => {
  it('ningún puesto trae Equipo por sí solo', () => {
    for (const p of Object.keys(PUESTOS)) {
      expect(ids(p), p).not.toContain('equipo');
    }
  });

  it('el dueño sí lo ve, sea cual sea su puesto', () => {
    for (const p of Object.keys(PUESTOS)) {
      expect(ids(p, { esDuenio: true }), p).toContain('equipo');
    }
  });
});

describe('una sección que no se declaró queda oculta', () => {
  it('lo que no está en la matriz es nada', () => {
    // El dia que se agregue una pestania nueva, esto es lo que hace que nazca
    // invisible en vez de visible para los cuatro puestos.
    for (const p of Object.keys(PUESTOS)) {
      expect(accesoDe(p, 'seccion_que_no_existe'), p).toBe(ACCESO.NADA);
    }
  });

  it('un puesto inventado no habilita nada', () => {
    expect(accesoDe('jefe_supremo', 'planes')).toBe(ACCESO.NADA);
    expect(ids('jefe_supremo')).toEqual([]);
    expect(pantallaInicial('jefe_supremo')).toBe(null);
  });
});

describe('dónde cae cada uno al entrar', () => {
  it('en su pantalla', () => {
    // Administrador y ventas abren en «Hoy»: son los dos que tienen que hacer
    // algo con la lista de pendientes. Soporte abre en la lista de clientes,
    // que es donde trabaja, y marketing en precios, que es lo único que ve.
    expect(pantallaInicial('administrador')).toBe('hoy');
    expect(pantallaInicial('ventas')).toBe('hoy');
    expect(pantallaInicial('soporte')).toBe('negocios');
    expect(pantallaInicial('marketing')).toBe('planes');
  });

  it('marketing no ve el panel: son datos de clientes', () => {
    expect(puedeVer('marketing', 'hoy')).toBe(false);
  });

  it('nunca en una pantalla que no puede ver', () => {
    for (const p of Object.keys(PUESTOS)) {
      const destino = pantallaInicial(p);
      expect(ids(p), p).toContain(destino);
    }
  });
});

describe('cómo se llama en pantalla', () => {
  it('traduce el puesto', () => {
    expect(etiquetaDePuesto('administrador')).toBe('Administrador');
    expect(etiquetaDePuesto('ventas')).toBe('Ventas');
  });

  it('lo que no conoce no rompe la pantalla', () => {
    expect(etiquetaDePuesto(null)).toBe('—');
    expect(etiquetaDePuesto('raro')).toBe('raro');
  });
});
