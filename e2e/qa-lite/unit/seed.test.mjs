import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../../platform/qa-lite/lib.mjs';

const migration = readFileSync(join(REPO_ROOT, 'platform', 'migrations', '0025_settings_table.sql'), 'utf8');
const seed = readFileSync(join(REPO_ROOT, 'platform', 'qa-lite', 'seed.sql'), 'utf8');

test('seed actualiza la fila settings creada por la migracion sin colisionar', () => {
  assert.match(migration, /tenant_id\s+uuid\s+primary key/i);
  assert.match(migration, /after insert on public\.tenants[\s\S]*crear_settings_de_tenant/i);
  assert.match(migration, /insert into public\.settings\s*\(tenant_id, biz_name\)/i);

  const tenantInsert = seed.indexOf('insert into public.tenants');
  const settingsInsert = seed.indexOf('insert into public.settings');
  assert.ok(tenantInsert >= 0 && settingsInsert > tenantInsert);

  const settingsStatement = seed.slice(settingsInsert, seed.indexOf(';', settingsInsert) + 1);
  assert.match(settingsStatement, /on conflict\s*\(tenant_id\)\s*do update set/i);
  assert.doesNotMatch(settingsStatement, /on conflict[\s\S]*do nothing/i);
  assert.match(settingsStatement, /biz_name\s*=\s*excluded\.biz_name/i);
  assert.match(settingsStatement, /catalog_theme\s*=\s*excluded\.catalog_theme/i);
  assert.match(settingsStatement, /payment_methods\s*=\s*excluded\.payment_methods/i);
});
