import { describe, it, expect } from 'vitest';
import { slugify, validateSlug, RESERVED, SLUG_RE } from '../lib/slugify';

describe('slugify', () => {
  it('convierte un nombre real', () => {
    expect(slugify('Pizzería Doña Rosa')).toBe('pizzeria-dona-rosa');
  });

  it('saca tildes y ñ (un subdominio no-ASCII se vuelve punycode)', () => {
    expect(slugify('Café Ñandú')).toBe('cafe-nandu');
    expect(slugify('Almacén Único')).toBe('almacen-unico');
  });

  it('colapsa separadores y limpia los bordes', () => {
    expect(slugify('  ¡¡La   Nona!!  ')).toBe('la-nona');
    expect(slugify('--raro--')).toBe('raro');
  });

  it('no deja guion colgando al recortar a 40', () => {
    const s = slugify('a'.repeat(38) + ' b');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });

  it('tolera vacio y basura', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
    expect(slugify('!!!')).toBe('');
  });

  it('lo que produce siempre pasa el regex del server (salvo vacio)', () => {
    for (const n of ['Cochi', 'Mala Miga', 'La Nona Pato', 'Bar 24hs', 'Ñoquis del 29']) {
      expect(SLUG_RE.test(slugify(n))).toBe(true);
    }
  });
});

describe('validateSlug', () => {
  it('acepta slugs validos', () => {
    expect(validateSlug('mi-parrilla').ok).toBe(true);
    expect(validateSlug('bar24').ok).toBe(true);
  });

  it('rechaza vacio y demasiado corto', () => {
    expect(validateSlug('').ok).toBe(false);
    expect(validateSlug('a').ok).toBe(false);
  });

  it('rechaza mayusculas, espacios y simbolos', () => {
    expect(validateSlug('Mi Local').ok).toBe(false);
    expect(validateSlug('mi_local').ok).toBe(false);
    expect(validateSlug('miló').ok).toBe(false);
  });

  it('rechaza guiones en los bordes', () => {
    expect(validateSlug('-malo').ok).toBe(false);
    expect(validateSlug('malo-').ok).toBe(false);
  });

  it('rechaza mas de 40', () => {
    expect(validateSlug('a'.repeat(41)).ok).toBe(false);
  });

  it('rechaza TODOS los reservados', () => {
    for (const r of RESERVED) {
      expect(validateSlug(r).ok).toBe(false);
    }
  });

  it('siempre explica por que', () => {
    for (const bad of ['', 'a', 'Mi Local', '-malo', 'www']) {
      expect(validateSlug(bad).reason).toBeTruthy();
    }
  });
});
