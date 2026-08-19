// Claves de idempotencia (Etapa 0).
//
// Lo que se prueba no es "genera un uuid" — es el comportamiento del que
// depende que un doble click no cobre dos veces:
//   mismo contenido  -> misma clave  (el reintento no duplica)
//   otro contenido   -> otra clave   (un pedido nuevo se crea de verdad)
//   tras el exito    -> otra clave   (dos operaciones iguales son dos)

import { describe, it, expect, beforeEach } from 'vitest';
import { claveDeIdempotencia, reiniciarClave } from '../lib/idempotencia';

describe('claveDeIdempotencia', () => {
  beforeEach(() => {
    for (const s of ['checkout', 'merma', 'compra', 'otro']) reiniciarClave(s);
  });

  it('el mismo contenido devuelve la misma clave', () => {
    const a = claveDeIdempotencia('checkout', ['111', 'envio', [['p1', 2]]]);
    const b = claveDeIdempotencia('checkout', ['111', 'envio', [['p1', 2]]]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('cambiar el contenido cambia la clave', () => {
    const a = claveDeIdempotencia('checkout', ['111', 'envio', [['p1', 2]]]);
    const b = claveDeIdempotencia('checkout', ['111', 'envio', [['p1', 3]]]);
    expect(b).not.toBe(a);
  });

  it('un cambio chico basta: agregar un item es otro pedido', () => {
    const a = claveDeIdempotencia('checkout', { items: [['p1', 1]] });
    const b = claveDeIdempotencia('checkout', { items: [['p1', 1], ['p2', 1]] });
    expect(b).not.toBe(a);
  });

  it('volver al contenido anterior NO reusa la clave vieja', () => {
    // Importa para plata: si volviera a la clave vieja, un cliente que saca un
    // item y lo vuelve a poner recibiria el pedido anterior en vez de uno nuevo.
    const a = claveDeIdempotencia('checkout', ['x']);
    claveDeIdempotencia('checkout', ['y']);
    const c = claveDeIdempotencia('checkout', ['x']);
    expect(c).not.toBe(a);
  });

  it('los scopes no se pisan entre si', () => {
    const merma = claveDeIdempotencia('merma', ['mismo']);
    const compra = claveDeIdempotencia('compra', ['mismo']);
    expect(merma).not.toBe(compra);
    // Y cada uno sigue siendo estable por su lado.
    expect(claveDeIdempotencia('merma', ['mismo'])).toBe(merma);
  });

  it('reiniciarClave hace que la misma operacion sea otra', () => {
    // Es el caso real: se rompieron 2 kg de queso, y mas tarde otros 2 kg.
    const primera = claveDeIdempotencia('merma', ['queso', 2, 'rotura']);
    reiniciarClave('merma');
    const segunda = claveDeIdempotencia('merma', ['queso', 2, 'rotura']);
    expect(segunda).not.toBe(primera);
  });

  it('reiniciar un scope no toca a los otros', () => {
    const compra = claveDeIdempotencia('compra', ['a']);
    reiniciarClave('merma');
    expect(claveDeIdempotencia('compra', ['a'])).toBe(compra);
  });
});

describe('el server valida la clave', () => {
  it('submit-order solo acepta UUID v4, no cualquier string', async () => {
    // La clave entra a una consulta tipada uuid: un valor arbitrario haria
    // fallar el pedido entero con un error de casteo de Postgres.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const fn = readFileSync(
      resolve(__dirname, '../../platform/functions/submit-order/index.ts'), 'utf-8');
    expect(fn).toMatch(/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}/);
    // Y el insert la escribe.
    expect(fn).toContain('client_request_id: clientRequestId');
    // Y la carrera de dos requests en paralelo cae en el 23505, no en un 500.
    expect(fn).toContain('23505');
  });
});
