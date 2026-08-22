// El correo de trabajo del equipo de Divianco.
//
// Lo que importa que sea cierto:
//   - que un destino SIN CONFIRMAR cuente como "no le llega". Es el bug caro:
//     la regla existe, se ve en el panel de Cloudflare, y no entrega nada. Si
//     esto diera true, la invitacion sale, se pierde y vence en 24 horas;
//   - que el catch-all cuente, porque las cuentas fundadoras andan por ahi y
//     tratarlas como "sin correo" seria bloquear a quien administra todo;
//   - que una regla apagada no cuente;
//   - que el alias que se sugiere desde un nombre sea una direccion valida,
//     tildes y todo.

import { describe, it, expect } from 'vitest';
import {
  aliasDesde, aliasValido, recibeMail, viaDe, estadoDelCorreo,
} from '../modules/correoDeEquipo';

const CONFIRMADO = { email: 'juan@gmail.com', confirmado: true };
const SIN_CONFIRMAR = { email: 'ana@gmail.com', confirmado: false };

const estado = ({ reglas = [], destinos = [CONFIRMADO, SIN_CONFIRMAR], catchAll = null } = {}) =>
  ({ reglas, destinos, catchAll });

const regla = (alias, destino, activa = true) =>
  ({ alias, destinos: [destino], activa });

describe('a quien le llega el correo', () => {
  it('una regla a un destino confirmado entrega', () => {
    const e = estado({ reglas: [regla('juan@grupodivianco.com', 'juan@gmail.com')] });
    expect(recibeMail('juan@grupodivianco.com', e)).toBe(true);
    expect(viaDe('juan@grupodivianco.com', e)).toBe('regla');
  });

  it('una regla a un destino SIN CONFIRMAR no entrega', () => {
    // El caso que motiva todo esto. La regla existe; el correo se pierde.
    const e = estado({ reglas: [regla('ana@grupodivianco.com', 'ana@gmail.com')] });
    expect(recibeMail('ana@grupodivianco.com', e)).toBe(false);
    expect(estadoDelCorreo('ana@grupodivianco.com', e)).toEqual({
      estado: 'sin_confirmar', via: null, personal: 'ana@gmail.com',
    });
  });

  it('una regla apagada no entrega aunque el destino este confirmado', () => {
    const e = estado({ reglas: [regla('juan@grupodivianco.com', 'juan@gmail.com', false)] });
    expect(recibeMail('juan@grupodivianco.com', e)).toBe(false);
  });

  it('sin regla ni catch-all no le llega nada', () => {
    expect(estadoDelCorreo('nadie@grupodivianco.com', estado())).toEqual({
      estado: 'sin_correo', via: null, personal: null,
    });
  });
});

describe('el catch-all', () => {
  it('alcanza para cualquier alias que no tenga regla propia', () => {
    const e = estado({ catchAll: { activo: true, destinos: ['juan@gmail.com'] } });
    expect(viaDe('lo.que.sea@grupodivianco.com', e)).toBe('catch-all');
  });

  it('no tapa una regla propia rota', () => {
    // Si el alias TIENE regla, manda la regla: el catch-all sólo agarra lo que
    // no matchea ninguna. Decir que le llega porque hay catch-all seria mentir.
    const e = estado({
      reglas: [regla('ana@grupodivianco.com', 'ana@gmail.com')],
      catchAll: { activo: true, destinos: ['juan@gmail.com'] },
    });
    expect(recibeMail('ana@grupodivianco.com', e)).toBe(false);
  });

  it('apagado o a un destino sin confirmar no cuenta', () => {
    expect(recibeMail('x@grupodivianco.com',
      estado({ catchAll: { activo: false, destinos: ['juan@gmail.com'] } }))).toBe(false);
    expect(recibeMail('x@grupodivianco.com',
      estado({ catchAll: { activo: true, destinos: ['ana@gmail.com'] } }))).toBe(false);
  });
});

describe('mayusculas y espacios', () => {
  it('la direccion se compara en minusculas', () => {
    const e = estado({ reglas: [regla('juan@grupodivianco.com', 'juan@gmail.com')] });
    expect(recibeMail('Juan@GrupoDivianco.com', e)).toBe(true);
  });
});

describe('el alias que se sugiere', () => {
  it('saca tildes, espacios y mayusculas', () => {
    expect(aliasDesde('José Pérez')).toBe('jose.perez');
    expect(aliasDesde('  Ana  María  Gómez ')).toBe('ana.maria.gomez');
  });

  it('lo que sugiere siempre es un alias valido', () => {
    for (const n of ['José Pérez', 'Ñoño', 'a', 'Juan-Carlos O\'Brien']) {
      expect(aliasValido(aliasDesde(n)), `${n} -> ${aliasDesde(n)}`).toBe(true);
    }
  });

  it('un nombre vacio no da un alias', () => {
    expect(aliasValido(aliasDesde(''))).toBe(false);
    expect(aliasValido(aliasDesde('  '))).toBe(false);
  });

  it('rechaza lo que no puede ir antes de la arroba', () => {
    expect(aliasValido('juan@perez')).toBe(false);
    expect(aliasValido('.juan')).toBe(false);
    expect(aliasValido('juan.')).toBe(false);
    expect(aliasValido('Juan')).toBe(false); // ya viene normalizado o no va
    expect(aliasValido('a'.repeat(65))).toBe(false);
  });
});
