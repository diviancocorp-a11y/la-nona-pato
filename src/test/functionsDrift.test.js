// src/test/functionsDrift.test.js
//
// Prueba el parser de check-functions-drift.mjs SIN base.
//
// Por que importa testear esto y no solo el script entero: si el parser no
// encuentra el cuerpo de una funcion en las migraciones, el chequeo no falla —
// reporta "ninguna migracion la define", o peor, si fallara al revés, compara
// contra una version vieja y da verde. Un guard que se rompe callado es
// exactamente el problema que este guard vino a resolver.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import {
  normalizar, cuerpoSegunElRepo, primeraDiferencia, overloadsDe, CRITICAS,
} from '../../scripts/check-functions-drift.mjs';

const tmps = [];
function migracionesFalsas(archivos) {
  const dir = mkdtempSync(join(tmpdir(), 'drift-'));
  tmps.push(dir);
  for (const [nombre, sql] of Object.entries(archivos)) {
    writeFileSync(join(dir, nombre), sql, 'utf8');
  }
  return dir;
}
afterAll(() => {
  for (const d of tmps) { try { rmSync(d, { recursive: true, force: true }); } catch { /* noop */ } }
});

describe('normalizar', () => {
  it('reindentar no cuenta como drift', () => {
    expect(normalizar('select   1;\n\n  select 2;')).toBe(normalizar('select 1; select 2;'));
  });

  it('cambiar un comentario no cuenta como drift', () => {
    expect(normalizar('-- viejo\nselect 1;')).toBe(normalizar('-- nuevo y mas largo\nselect 1;'));
    expect(normalizar('/* bloque */ select 1;')).toBe(normalizar('select 1;'));
  });

  it('cambiar el CODIGO si cuenta', () => {
    expect(normalizar("v := meta->>'biz_name';"))
      .not.toBe(normalizar("v := meta->>'business_name';"));
  });
});

describe('cuerpoSegunElRepo', () => {
  it('se queda con la ULTIMA migracion que la define, no la primera', () => {
    const dir = migracionesFalsas({
      '0001_a.sql': 'create or replace function public.f() returns int language sql as $$ select 1 $$;',
      '0009_b.sql': 'create or replace function public.f() returns int language sql as $$ select 2 $$;',
      '0010_c.sql': 'create or replace function public.f() returns int language sql as $$ select 3 $$;',
    });
    const r = cuerpoSegunElRepo('f', dir);
    expect(r.archivo).toBe('0010_c.sql');
    expect(normalizar(r.cuerpo)).toBe('select 3');
  });

  it('ordena 0009 antes que 0010 (lexicografico == cronologico con padding)', () => {
    const dir = migracionesFalsas({
      '0010_nueva.sql': 'create or replace function public.g() returns int language sql as $$ select 10 $$;',
      '0009_vieja.sql': 'create or replace function public.g() returns int language sql as $$ select 9 $$;',
    });
    expect(cuerpoSegunElRepo('g', dir).archivo).toBe('0010_nueva.sql');
  });

  it('acepta delimitadores $$ y $function$', () => {
    const dir = migracionesFalsas({
      '0001_a.sql': 'create or replace function public.h() returns int language plpgsql as $function$ begin return 1; end $function$;',
    });
    expect(normalizar(cuerpoSegunElRepo('h', dir).cuerpo)).toBe('begin return 1; end');
  });

  it('acepta la funcion escrita sin el prefijo public.', () => {
    const dir = migracionesFalsas({
      '0001_a.sql': 'create or replace function i() returns int language sql as $$ select 1 $$;',
    });
    expect(cuerpoSegunElRepo('i', dir)).not.toBeNull();
  });

  it('devuelve null si ninguna migracion la define', () => {
    const dir = migracionesFalsas({ '0001_a.sql': 'select 1;' });
    expect(cuerpoSegunElRepo('no_existe', dir)).toBeNull();
  });

  it('no confunde un nombre que es prefijo de otro', () => {
    const dir = migracionesFalsas({
      '0001_a.sql': 'create or replace function public.signup_tenant_extra() returns int language sql as $$ select 99 $$;',
    });
    // `signup_tenant` no deberia matchear `signup_tenant_extra`.
    const r = cuerpoSegunElRepo('signup_tenant', dir);
    expect(r === null || normalizar(r.cuerpo) !== 'select 99').toBe(true);
  });
});

describe('el caso real: el drift de signup_tenant', () => {
  it('detecta biz_name vs business_name como cuerpos distintos', () => {
    const repo = "v_name := coalesce(nullif(trim(v_meta->>'biz_name'), ''), v_slug);";
    const desplegado = "v_name := coalesce(nullif(trim(v_meta->>'business_name'), ''), v_slug);";
    expect(normalizar(repo)).not.toBe(normalizar(desplegado));

    const d = primeraDiferencia(normalizar(repo), normalizar(desplegado));
    expect(d.repo).toContain('biz_name');
    expect(d.desplegado).toContain('business_name');
  });

  it('la 0060 es la ultima que define signup_tenant en el repo real', () => {
    const r = cuerpoSegunElRepo('signup_tenant');
    expect(r).not.toBeNull();
    expect(r.archivo).toBe('0060_signup_tenant_lee_biz_name.sql');
    // Y ya lee el campo correcto.
    expect(r.cuerpo).toContain("v_meta->>'biz_name'");
  });

  it('encuentra en el repo real el cuerpo de todas las criticas que deberia', () => {
    // `tenant_puede_operar` y `suspender_impagos` viven en la 0052; el resto en
    // las suyas. Si alguna deja de encontrarse, el guard dejo de mirarla.
    const sinCuerpo = CRITICAS.filter((fn) => cuerpoSegunElRepo(fn) === null);
    expect(sinCuerpo).toEqual([]);
  });
});

describe('overloads: el caso sumar_staff', () => {
  // En produccion hay DOS sumar_staff: la 0054 creo la de dos argumentos y
  // nadie dropeo la de uno, porque `create or replace` con una firma distinta
  // no reemplaza, crea. Si el snapshot agrupara por nombre a secas, una
  // pisaria a la otra sin error — el guard tendria el mismo agujero silencioso
  // que vino a detectar.
  const snapshot = {
    'sumar_staff(p_email text)': {
      name: 'sumar_staff', args: 'p_email text', body: 'begin return 1; end',
    },
    'sumar_staff(p_email text, p_puesto text)': {
      name: 'sumar_staff', args: 'p_email text, p_puesto text', body: 'begin return 2; end',
    },
    'slug_available(p_slug text)': {
      name: 'slug_available', args: 'p_slug text', body: 'select true',
    },
  };

  it('junta las dos firmas, no se queda con una', () => {
    expect(overloadsDe(snapshot, 'sumar_staff')).toHaveLength(2);
  });

  it('no confunde funciones distintas', () => {
    expect(overloadsDe(snapshot, 'slug_available')).toHaveLength(1);
    expect(overloadsDe(snapshot, 'no_existe')).toHaveLength(0);
  });

  it('alcanza con que UNA firma coincida con el repo', () => {
    const cuerpos = overloadsDe(snapshot, 'sumar_staff').map((o) => normalizar(o.body));
    expect(cuerpos.includes(normalizar('begin  return 2;  end'))).toBe(true);
  });

  it('si ninguna coincide, es drift', () => {
    const cuerpos = overloadsDe(snapshot, 'sumar_staff').map((o) => normalizar(o.body));
    expect(cuerpos.includes(normalizar('begin return 99; end'))).toBe(false);
  });

  it('tolera un snapshot vacio o nulo', () => {
    expect(overloadsDe(null, 'sumar_staff')).toEqual([]);
    expect(overloadsDe({}, 'sumar_staff')).toEqual([]);
  });
});
