import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { getLocalStatus, QA_TENANT_ID } from './lib.mjs';

const EMAIL = 'owner.qa-lite@local.test';

async function findByEmail(admin, email) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`No se pudo listar Auth local: ${error.message}`);
    const hit = (data?.users || []).find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if ((data?.users || []).length < 100) return null;
  }
  return null;
}

export async function bootstrapUser(status = getLocalStatus()) {
  const password = `Qa-${randomBytes(18).toString('base64url')}!`;
  const admin = createClient(status.apiUrl, status.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let user = await findByEmail(admin, EMAIL);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password, user_metadata: { full_name: 'Owner QA Lite' },
    });
    if (error) throw new Error(`No se pudo actualizar Auth local: ${error.message}`);
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Owner QA Lite' },
    });
    if (error) throw new Error(`No se pudo crear Auth local: ${error.message}`);
    user = data.user;
  }

  const { data: existing, error: existingError } = await admin
    .from('tenant_members')
    .select('id')
    .eq('tenant_id', QA_TENANT_ID)
    .eq('user_id', user.id)
    .is('branch_id', null)
    .maybeSingle();
  if (existingError) throw new Error(`No se pudo leer membresia local: ${existingError.message}`);

  const membership = {
    tenant_id: QA_TENANT_ID,
    user_id: user.id,
    branch_id: null,
    role: 'owner',
    roles: ['owner'],
  };
  const memberResult = existing
    ? await admin.from('tenant_members').update(membership).eq('id', existing.id)
    : await admin.from('tenant_members').insert(membership);
  if (memberResult.error) throw new Error(`No se pudo vincular owner local: ${memberResult.error.message}`);

  const { error: profileError } = await admin.from('profiles').upsert({
    id: user.id,
    tenant_id: QA_TENANT_ID,
    full_name: 'Owner QA Lite',
    name: 'Owner QA Lite',
    email: EMAIL,
    updated_at: '2026-08-20T18:30:00.000Z',
  }, { onConflict: 'id' });
  if (profileError) throw new Error(`No se pudo crear profile local: ${profileError.message}`);

  const checks = {};
  for (const table of ['tenants', 'branches', 'settings', 'products', 'orders', 'payment_methods', 'cash_sessions', 'resources']) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Validacion local fallo en ${table}: ${error.message}`);
    checks[table] = count;
  }
  /* `>=` y no `===`: lo que esto detecta es un seed que NO SE APLICO, y para
     eso alcanza el minimo. La igualdad estricta ademas impedia cargar data de
     revision encima del fixture —`scripts/qa-lite/cargar-productos-demo.mjs`,
     que existe para poder mirar una pantalla con el volumen de un negocio
     real— sin tocar el seed determinista.
     OJO: los gates de pixel (visual-parity, phase9, dico-*) SI dependen del
     fixture exacto. Antes de correrlos hay que volver al seed limpio con
     `npm run qa:lite:setup` o `cargar-productos-demo.mjs --limpiar`. */
  if (checks.tenants !== 1 || checks.products < 4 || checks.orders < 3) {
    throw new Error(`Seed local incompleto: ${JSON.stringify(checks)}`);
  }

  return { email: EMAIL, password, counts: checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrapUser()
    .then(({ email, counts }) => console.log(`QA local listo para ${email}. Conteos: ${JSON.stringify(counts)}`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
