#!/usr/bin/env node
// Test de aislamiento END-TO-END (a traves de la API, con JWT reales).
// Siembra sus tenants usando el MISMO script create-owner (create user -> tenant -> owner),
// loguea como cada dueno y verifica RLS de verdad: A no ve ni escribe data de B.
// Complementa al test SQL rapido (tests/tenant_isolation.sql); este prueba el camino real.
//
// Uso:  node platform/tests/isolation_e2e.mjs
// Env:  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Requiere: npm i @supabase/supabase-js

import { createClient } from '@supabase/supabase-js'
import { createOwner } from '../scripts/create-owner.mjs'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function main() {
  if (!url || !anonKey || !serviceKey) throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
  const stamp = Date.now()

  const a = await createOwner({ email: `iso-a-${stamp}@test.dev`, name: 'Iso A', vertical: 'gastro', slug: `__iso-a-${stamp}` })
  const b = await createOwner({ email: `iso-b-${stamp}@test.dev`, name: 'Iso B', vertical: 'retail', slug: `__iso-b-${stamp}` })

  const ca = createClient(url, anonKey)
  await ca.auth.signInWithPassword({ email: a.email, password: a.password })
  const cb = createClient(url, anonKey)
  await cb.auth.signInWithPassword({ email: b.email, password: b.password })

  await ca.from('products').insert({ tenant_id: a.tenantId, name: 'Prod A', type: 'composite' })
  await cb.from('products').insert({ tenant_id: b.tenantId, name: 'Prod B', type: 'simple' })

  const { data: aSees } = await ca.from('products').select('id,tenant_id')
  const leak = (aSees || []).filter((p) => p.tenant_id !== a.tenantId)
  const intrus = await ca.from('products').insert({ tenant_id: b.tenantId, name: 'intruso', type: 'simple' })

  const checks = [
    ['A ve solo lo suyo', leak.length === 0, `visibles=${(aSees || []).length} leak=${leak.length}`],
    ['A no puede escribir en B', !!intrus.error, `err=${intrus.error ? intrus.error.code : 'NINGUNO'}`],
  ]
  let ok = true
  for (const [n, p, d] of checks) {
    console.log(`${p ? 'PASS' : 'FAIL'}  ${n}  (${d})`)
    if (!p) ok = false
  }

  // cleanup: borrar tenants (cascade) y users de prueba
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } })
  await svc.from('tenants').delete().in('id', [a.tenantId, b.tenantId])
  await svc.auth.admin.deleteUser(a.userId)
  await svc.auth.admin.deleteUser(b.userId)

  if (!ok) process.exit(1)
  console.log('\nAislamiento e2e OK (RLS real via API)')
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
