import { vi } from 'vitest';

// Metodos del query builder que devuelven el propio builder (encadenables).
const ENCADENABLES = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not', 'is',
  'order', 'limit',
];

/**
 * Doble del query builder de Supabase.
 *
 * CADA METODO ES SU PROPIO vi.fn. Parece un detalle y no lo es: antes todos
 * compartian UNA sola funcion, asi que `c.eq` acumulaba tambien las llamadas
 * de `.order` y `.limit`, `c.update` registraba los `.upsert`, y un
 * `expect(c.update).not.toHaveBeenCalled()` no podia pasar NUNCA aunque el
 * codigo estuviera bien. Un test que no puede fallar por la razon correcta
 * es peor que no tener test.
 *
 * Siguen devolviendo el mismo objeto, asi que encadenar funciona igual.
 */
export function chain(resolvedValue = { data: null, error: null }) {
  const self = {};
  for (const metodo of ENCADENABLES) {
    self[metodo] = vi.fn(() => self);
  }
  Object.assign(self, {
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
    then(resolve) { return resolve(resolvedValue); },
  });
  return self;
}
