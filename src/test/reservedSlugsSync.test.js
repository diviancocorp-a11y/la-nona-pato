import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RESERVED_SUBDOMAINS } from '../lib/tenantHost';
import { RESERVED } from '../lib/slugify';

// La lista de slugs reservados existe en DOS lenguajes: JS (tenantHost.js) y
// SQL (public.is_reserved_slug, migracion 0020). No hay forma de tener una
// sola fuente cruzando ese limite, asi que la proteccion es este test.
//
// Si divergen, el danio es concreto: el formulario de alta dice "disponible",
// el dueño completa todo, y el INSERT muere contra el CHECK. O peor al reves:
// se registra un slug que el resolver de hostname no reconoce como tenant y
// el local queda inaccesible.

const MIGRACION = resolve(__dirname, '../../platform/migrations/0020_reserved_slugs_unificado.sql');

function reservadosDelSql() {
  // Los comentarios se despojan PRIMERO: el archivo menciona la funcion en su
  // encabezado y buscar sin limpiar engancha esa mencion en vez del cuerpo.
  const sql = readFileSync(MIGRACION, 'utf-8').replace(/--[^\n]*/g, '');
  const m = sql.match(
    /create\s+or\s+replace\s+function\s+public\.is_reserved_slug[\s\S]*?\bin\s*\(([\s\S]*?)\)\s*;/i
  );
  if (!m) throw new Error('No se encontro el IN (...) de is_reserved_slug en 0020');
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

describe('slugs reservados: JS vs SQL', () => {
  it('slugify reexporta la lista de tenantHost, no una copia', () => {
    expect(RESERVED).toBe(RESERVED_SUBDOMAINS);
  });

  it('la lista JS y la SQL son identicas', () => {
    const sql = reservadosDelSql();
    const js = RESERVED_SUBDOMAINS;

    const faltanEnJs = [...sql].filter((s) => !js.has(s));
    const faltanEnSql = [...js].filter((s) => !sql.has(s));

    expect({ faltanEnJs, faltanEnSql }).toEqual({ faltanEnJs: [], faltanEnSql: [] });
  });

  it('reserva los subdominios de correo (el dominio de envio vive ahi)', () => {
    for (const s of ['mail', 'send', 'smtp', 'email', 'noreply', 'bounces']) {
      expect(RESERVED_SUBDOMAINS.has(s)).toBe(true);
    }
  });

  it('reserva las rutas propias de la plataforma', () => {
    for (const s of ['registro', 'bienvenido', 'admin', 'api']) {
      expect(RESERVED_SUBDOMAINS.has(s)).toBe(true);
    }
  });
});
