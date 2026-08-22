// El legajo del empleado de Dico.
//
// Lo que importa que sea cierto:
//   - que la lista de obligatorios del MODULO y la de la MIGRACION digan lo
//     mismo. Estan escritas dos veces a proposito —la pantalla dice que falta,
//     el servidor sella `completado_at`— y si se separan, alguien completa el
//     formulario, ve todo en verde y no puede entrar. Este test es la unica
//     cosa que las mantiene atadas;
//   - que un campo con espacios no cuente como cargado, porque un espacio pasa
//     cualquier validacion de "no vacio" y no es un dato;
//   - que lo opcional siga siendo opcional: piso/depto no lo tiene todo el
//     mundo, y el banco se deduce del CBU.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { OBLIGATORIOS, faltantesDelLegajo, legajoCompleto } from '../modules/legajo';

const MIGRACION = 'platform/migrations/0054_puestos_y_legajo.sql';

const completo = () =>
  Object.fromEntries(Object.keys(OBLIGATORIOS).map((k) => [k, 'x']));

describe('el módulo y la migración dicen lo mismo', () => {
  it('los obligatorios de `legajo_completo()` son exactamente los del módulo', () => {
    const sql = readFileSync(MIGRACION, 'utf8');
    const cuerpo = sql.slice(
      sql.indexOf('create or replace function public.legajo_completo'),
      sql.indexOf('create or replace function public.marcar_legajo_completo'),
    );
    expect(cuerpo, 'no encontré legajo_completo() en la migración').not.toBe('');

    // Los campos que la funcion SQL exige: `l.<campo>`.
    const enSql = new Set([...cuerpo.matchAll(/\bl\.([a-z_]+)\b/g)].map((m) => m[1]));
    const enJs = new Set(Object.keys(OBLIGATORIOS));

    const soloSql = [...enSql].filter((c) => !enJs.has(c));
    const soloJs = [...enJs].filter((c) => !enSql.has(c));

    expect(soloSql, 'la migración exige campos que el módulo no pide').toEqual([]);
    expect(soloJs, 'el módulo pide campos que la migración no exige').toEqual([]);
  });
});

describe('qué falta', () => {
  it('un legajo vacío los pide todos', () => {
    expect(faltantesDelLegajo({})).toHaveLength(Object.keys(OBLIGATORIOS).length);
    expect(legajoCompleto({})).toBe(false);
  });

  it('con todo cargado no falta nada', () => {
    expect(faltantesDelLegajo(completo())).toEqual([]);
    expect(legajoCompleto(completo())).toBe(true);
  });

  it('un espacio no es un dato', () => {
    // Sin el trim, escribir un espacio en el CBU alcanzaria para "completar" el
    // legajo y quedar sin numero de cuenta a la hora de pagar.
    expect(legajoCompleto({ ...completo(), cbu: '   ' })).toBe(false);
    expect(faltantesDelLegajo({ ...completo(), cbu: '' })).toEqual(['CBU']);
  });

  it('lo dice con el nombre que ve la persona, no con el de la columna', () => {
    expect(faltantesDelLegajo({ ...completo(), doc_dorso_path: null }))
      .toEqual(['foto del documento (dorso)']);
  });

  it('null y undefined cuentan como vacío', () => {
    expect(legajoCompleto({ ...completo(), telefono: null })).toBe(false);
    expect(legajoCompleto({ ...completo(), telefono: undefined })).toBe(false);
  });
});

describe('lo opcional sigue siendo opcional', () => {
  it('piso, banco, alias y fecha de ingreso no frenan a nadie', () => {
    const l = completo();
    delete l.piso_depto; delete l.banco; delete l.alias_bancario; delete l.fecha_ingreso;
    expect(legajoCompleto(l)).toBe(true);
  });
});
