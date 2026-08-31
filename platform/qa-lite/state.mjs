import { createClient } from '@supabase/supabase-js';
import { assertLocalUrl, getLocalStatus, QA_TENANT_ID } from './lib.mjs';

const THEMES = new Set(['ambar', 'noche', 'carbon']);

function adminClient(status) {
  assertLocalUrl(status.apiUrl, 'Supabase API URL');
  return createClient(status.apiUrl, status.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function setCatalogTheme(theme, status = getLocalStatus()) {
  if (!THEMES.has(theme)) throw new Error(`Tema QA invalido: ${theme}`);
  const admin = adminClient(status);
  const { error } = await admin.from('settings').update({
    catalog_theme: theme,
    updated_at: '2026-08-20T18:30:00.000Z',
  }).eq('tenant_id', QA_TENANT_ID);
  if (error) throw new Error(`No se pudo cambiar catalog_theme local: ${error.message}`);
}

export async function applyFixtureState(state, status = getLocalStatus()) {
  if (state === 'normal') return;
  if (state !== 'empty') throw new Error(`Estado QA invalido: ${state}`);
  const admin = adminClient(status);
  for (const table of ['order_items', 'orders', 'products']) {
    const { error } = await admin.from(table).delete().eq('tenant_id', QA_TENANT_ID);
    if (error) throw new Error(`No se pudo aplicar estado empty en ${table}: ${error.message}`);
  }
}
