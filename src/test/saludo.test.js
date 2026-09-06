// El saludo de la barra de arriba.
//
// Lo que importa que sea cierto: que la franja siga a la hora del usuario, que
// se salude por el PRIMER nombre, y que sin nombre no salude en vez de saludar
// a nadie — "Buenos días undefined" es peor que no saludar.

import { describe, it, expect } from 'vitest';
import { saludoDe, nombreDe } from '../modules/saludo';

const aLas = (h) => new Date(2026, 8, 5, h, 30, 0);

describe('la franja del dia', () => {
  it('la mañana va de 6 a 12:59', () => {
    expect(saludoDe(aLas(6))).toBe('Buenos días');
    expect(saludoDe(aLas(12))).toBe('Buenos días');
  });

  it('la tarde va de 13 a 19:59', () => {
    expect(saludoDe(aLas(13))).toBe('Buenas tardes');
    expect(saludoDe(aLas(19))).toBe('Buenas tardes');
  });

  it('la noche arranca a las 20', () => {
    expect(saludoDe(aLas(20))).toBe('Buenas noches');
    expect(saludoDe(aLas(23))).toBe('Buenas noches');
  });

  it('la madrugada tambien es "buenas noches", como en la calle', () => {
    expect(saludoDe(aLas(1))).toBe('Buenas noches');
    expect(saludoDe(aLas(5))).toBe('Buenas noches');
  });
});

describe('a quien se saluda', () => {
  const sesion = (user) => ({ user });

  it('el primer nombre, no el completo', () => {
    expect(nombreDe(sesion({ user_metadata: { full_name: 'Ricardo Rodriguez' } })))
      .toBe('Ricardo');
  });

  it('sin full_name cae al usuario del correo', () => {
    expect(nombreDe(sesion({ email: 'ricardo.r@grupodivianco.com' }))).toBe('Ricardo');
    expect(nombreDe(sesion({ email: 'dueno.parrilla-smoke@local.test' }))).toBe('Dueno');
  });

  it('lo capitaliza: el correo viene en minuscula', () => {
    expect(nombreDe(sesion({ user_metadata: { full_name: 'ricardo' } }))).toBe('Ricardo');
  });

  it('sin nada devuelve null y la barra pone otra cosa', () => {
    expect(nombreDe(null)).toBeNull();
    expect(nombreDe(sesion({}))).toBeNull();
    expect(nombreDe(sesion({ email: '' }))).toBeNull();
  });
});
