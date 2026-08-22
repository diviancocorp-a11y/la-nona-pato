// El legajo de quien se incorpora al equipo de Dico.
//
// Lo que importa que sea cierto:
//   - que un PASAPORTE no pida dorso. Es el caso que trababa a alguien sin
//     manera de destrabarse: no hay foto que sacar;
//   - que a quien FACTURA su servicio no se le pida domicilio ni telefono. Son
//     datos personales que la empresa no necesita, y frenan un alta de dos
//     minutos;
//   - que la identificacion fiscal se llame como corresponde en cada pais:
//     pedir "CUIL" a alguien de Chile es pedirle un dato que no existe;
//   - que la lista de obligatorios del MODULO y la de la MIGRACION digan lo
//     mismo. Si se separan, alguien completa el formulario, ve todo en verde y
//     no puede entrar.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  obligatoriosDe, faltantesDelLegajo, legajoCompleto, titularSugerido,
  campoDeCobro, MODALIDADES,
} from '../modules/legajo';
import {
  paisesParaLegajo, erroresDeFormato, tieneDorso, etiquetaFiscal,
  documentosDe,
} from '../modules/documentacionPorPais';

const MIGRACION = 'platform/migrations/0055_legajo_por_pais_y_modalidad.sql';

/** Un legajo con todo lo que ese caso pide. */
const lleno = (base, modalidad) => {
  const l = { ...base };
  for (const campo of Object.keys(obligatoriosDe(l, modalidad))) {
    if (!l[campo]) l[campo] = campo === 'fecha_nacimiento' ? '1990-01-01' : 'x';
  }
  return l;
};

const AR_DNI = { pais: 'AR', tipo_documento: 'dni' };
const AR_PASAPORTE = { pais: 'AR', tipo_documento: 'pasaporte' };

describe('el dorso sólo cuando el documento lo tiene', () => {
  it('un DNI argentino lo pide', () => {
    expect(tieneDorso('AR', 'dni')).toBe(true);
    expect(obligatoriosDe(AR_DNI)).toHaveProperty('doc_dorso_path');
  });

  it('un pasaporte NO lo pide', () => {
    expect(tieneDorso('AR', 'pasaporte')).toBe(false);
    expect(obligatoriosDe(AR_PASAPORTE)).not.toHaveProperty('doc_dorso_path');
    expect(legajoCompleto(lleno(AR_PASAPORTE))).toBe(true);
  });

  it('sin tipo de documento elegido tampoco lo pide', () => {
    // Si lo pidiera, el formulario arrancaría exigiendo la foto del dorso de
    // un documento que todavía no se eligió.
    expect(obligatoriosDe({ pais: 'AR' })).not.toHaveProperty('doc_dorso_path');
  });
});

describe('empleado y contratista', () => {
  it('al empleado se le pide domicilio y teléfono', () => {
    const o = obligatoriosDe(AR_DNI, 'empleado');
    for (const c of ['calle', 'altura', 'localidad', 'provincia', 'codigo_postal', 'telefono']) {
      expect(o, c).toHaveProperty(c);
    }
  });

  it('al que factura NO', () => {
    const o = obligatoriosDe(AR_DNI, 'contratista');
    for (const c of ['calle', 'altura', 'localidad', 'provincia', 'codigo_postal', 'telefono']) {
      expect(o, c).not.toHaveProperty(c);
    }
    // Pero sí lo que hace falta para facturarle y pagarle.
    expect(o).toHaveProperty('identificacion_fiscal');
    expect(o).toHaveProperty('cuenta_numero');
  });

  it('un contratista completo entra; al mismo legajo como empleado le falta', () => {
    const l = lleno(AR_DNI, 'contratista');
    expect(legajoCompleto(l, 'contratista')).toBe(true);
    expect(legajoCompleto(l, 'empleado')).toBe(false);
  });

  it('las dos modalidades están declaradas', () => {
    expect(Object.keys(MODALIDADES).sort()).toEqual(['contratista', 'empleado']);
  });
});

describe('cada país pide lo suyo', () => {
  it('la identificación fiscal se llama distinto', () => {
    expect(etiquetaFiscal('AR')).toBe('CUIL');
    expect(etiquetaFiscal('CL')).toBe('RUT');
    // Un pais sin regla propia usa el identificador que declara `paises.js`.
    expect(etiquetaFiscal('MX')).toBe('RFC');
  });

  it('afuera hacen falta banco y SWIFT; en Argentina no', () => {
    expect(obligatoriosDe({ pais: 'AR' })).not.toHaveProperty('cuenta_banco');
    const otro = obligatoriosDe({ pais: 'MX' });
    expect(otro).toHaveProperty('cuenta_banco');
    expect(otro).toHaveProperty('cuenta_swift');
  });

  it('el alias argentino es opcional', () => {
    expect(obligatoriosDe({ pais: 'AR' })).not.toHaveProperty('cuenta_alias');
  });

  it('un país desconocido no deja el formulario en blanco', () => {
    // Cae en la regla generica en vez de romper: un codigo viejo o mal tipeado
    // no puede dejar a alguien sin pantalla.
    expect(obligatoriosDe({ pais: 'XX' })).toHaveProperty('cuenta_swift');
  });
});

describe('validación de formato', () => {
  it('el CUIL argentino son 11 dígitos', () => {
    expect(erroresDeFormato({ pais: 'AR', identificacion_fiscal: '20304050607' }))
      .not.toHaveProperty('identificacion_fiscal');
    expect(erroresDeFormato({ pais: 'AR', identificacion_fiscal: '123' }))
      .toHaveProperty('identificacion_fiscal');
  });

  it('el CBU son 22 dígitos', () => {
    expect(erroresDeFormato({ pais: 'AR', cuenta_numero: '2'.repeat(22) }))
      .not.toHaveProperty('cuenta_numero');
    expect(erroresDeFormato({ pais: 'AR', cuenta_numero: '2'.repeat(20) }))
      .toHaveProperty('cuenta_numero');
  });

  it('los espacios y guiones no invalidan un número correcto', () => {
    // La gente pega el CBU como se lo dio el banco. Rechazarlo por el formato
    // es rechazar un dato correcto mal tipeado.
    expect(erroresDeFormato({ pais: 'AR', cuenta_numero: '2850590940090418135201' }))
      .not.toHaveProperty('cuenta_numero');
    expect(erroresDeFormato({ pais: 'AR', cuenta_numero: '285-0590 9400 9041 8135 201' }))
      .not.toHaveProperty('cuenta_numero');
  });

  it('un campo vacío no es un error de formato', () => {
    // Que falte lo dice "faltan datos"; decirlo dos veces con dos redacciones
    // distintas confunde más de lo que ayuda.
    expect(erroresDeFormato({ pais: 'AR', cuenta_numero: '' })).toEqual({});
  });

  it('un país sin largo declarado no valida largo', () => {
    expect(erroresDeFormato({ pais: 'MX', cuenta_numero: '123' })).toEqual({});
  });
});

describe('el titular de la cuenta', () => {
  it('se arma con el nombre de la persona', () => {
    expect(titularSugerido({ nombre: 'Camila', apellido: 'González' }))
      .toBe('Camila González');
  });

  it('con datos a medias no deja espacios sueltos', () => {
    expect(titularSugerido({ nombre: 'Camila' })).toBe('Camila');
    expect(titularSugerido({})).toBe('');
  });
});

describe('el módulo y la migración dicen lo mismo', () => {
  const sql = readFileSync(MIGRACION, 'utf8');

  it('los documentos con dorso son los mismos', () => {
    const cuerpo = sql.slice(
      sql.indexOf('function public.documento_tiene_dorso'),
      sql.indexOf('function public.cobro_completo'));

    // Cada rama del CASE: los tipos que lista y si da true o false.
    const ramas = [...cuerpo.matchAll(/when p_tipo in \(([^)]+)\) then (true|false)/g)];
    expect(ramas.length, 'no pude leer el CASE de la migración').toBeGreaterThan(0);

    for (const [, lista, resultado] of ramas) {
      const tipos = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      for (const tipo of tipos) {
        const enSql = resultado === 'true';
        // Contra todos los países declarados MAS la regla genérica: 'ci'
        // sólo existe en algunos, y 'documento_nacional' sólo en la genérica
        // —que es un camino real: lo toma cualquier código de país que no
        // tenga regla propia—. Mirar sólo Argentina daba falsos negativos.
        const enJs = [...paisesParaLegajo().map((p) => p.id), 'XX']
          .some((cod) => tieneDorso(cod, tipo));
        expect(enJs, `${tipo}: la migración dice ${enSql}`).toBe(enSql);
      }
    }
  });

  it('los campos que la migración exige siempre son los del módulo', () => {
    const cuerpo = sql.slice(
      sql.indexOf('-- Identidad: se pide siempre.'),
      sql.indexOf('-- El dorso, solo si ese documento lo tiene.'));
    const enSql = new Set([...cuerpo.matchAll(/\bl\.([a-z_]+)\b/g)].map((m) => m[1]));
    // El módulo, para el caso mínimo (pasaporte, contratista): identidad + cobro.
    const enJs = new Set(Object.keys(obligatoriosDe(AR_PASAPORTE, 'contratista')));

    const soloSql = [...enSql].filter((c) => !enJs.has(c));
    expect(soloSql, 'la migración exige campos que el módulo no pide').toEqual([]);
  });

  it('el domicilio es lo que separa empleado de contratista, en los dos lados', () => {
    const cuerpo = sql.slice(
      sql.indexOf("if v_ok and v_modalidad = 'empleado' then"),
      sql.indexOf('if v_ok then v_ok := public.cobro_completo(l); end if;'));
    const enSql = new Set([...cuerpo.matchAll(/\bl\.([a-z_]+)\b/g)].map((m) => m[1]));

    const soloEmpleado = new Set(Object.keys(obligatoriosDe(AR_DNI, 'empleado')));
    for (const c of Object.keys(obligatoriosDe(AR_DNI, 'contratista'))) soloEmpleado.delete(c);

    expect([...enSql].sort()).toEqual([...soloEmpleado].sort());
  });
});

describe('el mapa de campos de cobro', () => {
  it('traduce el id del país a la columna', () => {
    expect(campoDeCobro('numero')).toBe('cuenta_numero');
    expect(campoDeCobro('swift')).toBe('cuenta_swift');
  });

  it('un id nuevo no rompe: cae en una columna con el mismo prefijo', () => {
    expect(campoDeCobro('sucursal')).toBe('cuenta_sucursal');
  });
});

describe('qué falta se dice con nombre humano', () => {
  it('usa la etiqueta y no el nombre de la columna', () => {
    expect(faltantesDelLegajo({ ...lleno(AR_DNI), doc_dorso_path: null }))
      .toEqual(['foto del documento (dorso)']);
  });

  it('un espacio no cuenta como cargado', () => {
    expect(legajoCompleto({ ...lleno(AR_DNI), cuenta_numero: '   ' })).toBe(false);
  });
});
