// Sucursales, dia operativo y libro de inventario (Etapa 0 + 6b).
//
// Estos tests leen las migraciones. No reemplazan la prueba contra la base
// —eso se hizo aparte, con datos y limpieza— sino que evitan la regresion
// silenciosa: que alguien saque una garantia al editar una funcion y nadie se
// entere hasta que un dueño reclame que su stock no cierra.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (f) => readFileSync(resolve(__dirname, '../../platform/migrations/', f), 'utf-8');

const m40 = leer('0040_idempotencia.sql');
const m41 = leer('0041_sucursales_y_dia_operativo.sql');
const m42 = leer('0042_ledger_de_inventario.sql');
const m43 = leer('0043_audit_log.sql');

describe('idempotencia (0040)', () => {
  it('las tres rutas que faltaban tienen columna y unico parcial', () => {
    for (const tabla of ['orders', 'waste_log', 'expenses']) {
      expect(m40, `${tabla} sin columna`).toContain(`alter table public.${tabla}`);
    }
    // El unico parcial es lo que hace que las filas historicas —que no tienen
    // clave y no se les puede inventar— convivan con las nuevas.
    const parciales = m40.match(/where client_request_id is not null/g) || [];
    expect(parciales.length).toBeGreaterThanOrEqual(3);
  });

  it('las firmas viejas se eliminan', () => {
    // Si quedaran, una llamada sin clave las elegiria por resolucion de
    // sobrecarga y perderia la garantia sin que nadie lo note.
    expect(m40).toContain('drop function if exists public.register_waste(uuid, uuid, numeric, text, text)');
    expect(m40).toMatch(/drop function if exists public\.register_purchase\(\s*uuid, date, jsonb, text, uuid, text, text, text, boolean\)/);
  });

  it('el guard devuelve lo que ya existe en vez de fallar', () => {
    // Devolver error obligaria al front a distinguir "ya estaba" de "fallo",
    // que es exactamente lo que 0019 dejo de hacer por fragil.
    expect(m40).toContain('return next v_ya');
  });
});

describe('sucursales (0041)', () => {
  it('branches tiene RLS con el patron del edificio', () => {
    expect(m41).toContain('alter table public.branches enable row level security');
    expect(m41).toContain('tenant_id in (select private.current_user_tenants())');
  });

  it('una sola sucursal por defecto por negocio', () => {
    // Sin esto, un pedido sin branch_id no tendria donde caer.
    expect(m41).toMatch(/unique index[\s\S]{0,80}branches[\s\S]{0,60}where is_default/);
  });

  it('branch_id entra en lo que ocurre en un lugar, no en lo que es del negocio', () => {
    for (const t of ['orders', 'sales', 'cash_sessions', 'appointments', 'expenses', 'payments', 'staff']) {
      expect(m41, `${t} sin branch_id`).toContain(`alter table public.${t}        add column if not exists branch_id`.replace(/\s+add/, ' '.repeat(Math.max(1, 14 - t.length)) + 'add'));
    }
    // Los clientes y los productos NO llevan sucursal: un cliente que compra
    // en dos locales es un cliente, no dos.
    expect(m41).not.toMatch(/alter table public\.profiles\s+add column if not exists branch_id/);
    expect(m41).not.toMatch(/alter table public\.products\s+add column if not exists branch_id/);
  });

  it('el backfill no deja filas sin sucursal', () => {
    expect(m41).toContain('x.branch_id is null');
  });

  it('el dia operativo usa la zona del local y su hora de corte', () => {
    // Las dos cosas: sin la zona, un tenant en Mexico cuenta mal; sin el corte,
    // el bar que cierra a las 5am parte su jornada al medio.
    expect(m42 + m41).toContain('at time zone b.timezone');
    expect(m41).toContain('day_cutoff_hour');
    expect(m41).toMatch(/make_interval\(hours => b\.day_cutoff_hour\)/);
  });

  it('la hora de corte no puede ser absurda', () => {
    expect(m41).toMatch(/day_cutoff_hour >= 0 and day_cutoff_hour < 12/);
  });

  it('signup_tenant crea la primera sucursal', () => {
    // Sin esto un tenant nuevo nace sin sucursal y todo lo que escriba queda
    // con branch_id null, el unico estado que el modelo no deberia permitir.
    expect(m41).toContain("insert into public.branches(tenant_id, name, timezone, is_default)");
    // Y no pierde lo de 0019 ni lo de 0039.
    expect(m41).toContain('already_existed');
    expect(m41).toContain("v_meta->>'operation_mode'");
  });
});

describe('libro de inventario (0042)', () => {
  it('un movimiento es de un insumo O de una variante, nunca de los dos', () => {
    expect(m42).toContain('inventory_movements_una_cosa');
  });

  it('la cantidad va firmada y no puede ser cero', () => {
    expect(m42).toMatch(/qty\s+numeric not null check \(qty <> 0\)/);
  });

  it('el movimiento apunta a lo que lo genero', () => {
    // Sin esto el libro dice "salieron 3" y no "salieron 3 por el pedido X".
    expect(m42).toContain('reference_type');
    expect(m42).toContain('reference_id');
  });

  it('la clave de idempotencia incluye la cosa movida', () => {
    // El bug que se encontro probando: sin esto, una compra de 3 insumos con
    // una sola clave entraba INCOMPLETA y sin error.
    expect(m42).toMatch(/client_request_id, kind, coalesce\(ingredient_id, variant_id\)/);
    expect(m42).toMatch(/coalesce\(m\.ingredient_id, m\.variant_id\)\s*\n?\s*= coalesce\(p_ingredient_id, p_variant_id\)/);
  });

  it('el libro es de solo agregar: no se edita ni se borra', () => {
    // Si se pudiera editar, el saldo cacheado quedaria mintiendo y la
    // auditoria no valdria nada. Se corrige con un asiento contrario.
    expect(m42).toContain('libro_es_de_solo_agregar');
    expect(m42).toMatch(/before update or delete on public\.inventory_movements/);
  });

  it('el saldo lo mantiene un trigger, no la aplicacion', () => {
    // Asi no se puede desincronizar por olvido: no hay forma de escribir un
    // movimiento sin que el saldo se entere.
    expect(m42).toMatch(/after insert on public\.inventory_movements/);
    expect(m42).toContain('aplicar_movimiento_al_saldo');
  });

  it('el stock que ya existia entra como asiento de apertura', () => {
    // Si no, el libro arrancaria en 0 y contradiria al numero viejo desde el
    // primer dia.
    expect(m42).toContain("'initial'");
  });

  it('la RPC verifica que lo movido sea de este negocio', () => {
    // Es security definer: la RLS no la frena, el chequeo es la unica barrera.
    expect(m42).toContain('insumo_de_otro_negocio');
    expect(m42).toContain('variante_de_otro_negocio');
    expect(m42).toContain('sucursal_de_otro_negocio');
  });

  it('ingredients.stock NO se elimina todavia', () => {
    // Cambiar la fuente de verdad del stock a ciegas seria el error caro.
    expect(m42).not.toMatch(/alter table public\.ingredients\s+drop column\s+stock/i);
  });
});

describe('audit log (0043)', () => {
  it('guarda el diff, no la fila entera', () => {
    // Una fila de settings tiene 50 columnas; guardarla completa en cada toque
    // hace el log ilegible justo cuando hay que leerlo.
    expect(m43).toContain("'antes'");
    expect(m43).toContain("'despues'");
    expect(m43).toContain('is distinct from');
  });

  it('un update que no cambia nada no es un evento', () => {
    expect(m43).toMatch(/if v_cambios = '\{\}'::jsonb then\s*\n\s*return null;/);
  });

  it('audita plata, stock y permisos', () => {
    for (const t of ['expenses', 'ingredients', 'staff', 'tenant_members', 'cash_sessions']) {
      expect(m43, `${t} sin auditar`).toContain(`'${t}'`);
    }
  });

  it('nadie puede escribir el log desde la UI', () => {
    // Un log que el auditado puede editar no sirve de nada.
    expect(m43).toContain('for select using');
    expect(m43).not.toMatch(/create policy\s+\w+\s+on public\.audit_log\s+for (insert|all)/);
  });

  it('queda registrado quien lo hizo', () => {
    expect(m43).toContain('auth.uid()');
  });
});
