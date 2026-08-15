#!/usr/bin/env node
// create-owner: provisiona un dueno nuevo en el edificio Hermes.
// Flujo: auth user -> tenant -> owner (tenant_members) + profile.
// tenant+owner+profile son atomicos (via RPC provision_owner). Si ese vinculo falla,
// se borra el auth user (rollback del unico paso que vive fuera de la transaccion DB).
//
// Es el MISMO script que:
//   - usa el test de aislamiento e2e (tests/isolation_e2e.mjs)
//   - colgara el boton de autogestion del cliente en B6 (signup self-service)
//
// Uso CLI:
//   node platform/scripts/create-owner.mjs --email pepe@mail.com --name "Barberia Pepe" --vertical barber --slug barberia-pepe [--password ...]
//
// Env (NUNCA commitear la service role):
//   SUPABASE_URL=https://wwwzdgprsooyjgkuyoav.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...   (dashboard > Project Settings > API)
//
// Requiere: npm i @supabase/supabase-js

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { cargarEnvDeArchivo, faltanCredenciales } from './_env.mjs'

cargarEnvDeArchivo()

const VERTICALS = ['gastro', 'barber', 'retail']

export async function createOwner({ email, name, vertical, slug, password }) {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error(faltanCredenciales(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']))
  if (!email || !name || !vertical || !slug) throw new Error('Faltan campos: email, name, vertical, slug')
  if (!VERTICALS.includes(vertical)) throw new Error(`vertical invalido: ${vertical} (usar ${VERTICALS.join('|')})`)

  const pass = password || crypto.randomBytes(12).toString('base64url')
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1) crear auth user
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (uErr) throw new Error('createUser: ' + uErr.message)
  const userId = created.user.id

  // 2) tenant + owner + profile (atomico en DB)
  const { data: tenantId, error: pErr } = await admin.rpc('provision_owner', {
    p_user_id: userId,
    p_email: email,
    p_name: name,
    p_vertical: vertical,
    p_slug: slug,
  })
  if (pErr) {
    // rollback: no se pudo vincular -> borramos el user recien creado
    await admin.auth.admin.deleteUser(userId)
    throw new Error('provision_owner fallo, user revertido: ' + pErr.message)
  }

  return { userId, tenantId, email, password: pass, generatedPassword: !password }
}

// ---- CLI ----
function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// pathToFileURL y no `file://${argv[1]}`: en Windows argv[1] viene con
// backslashes y la comparacion nunca da true — el script salia con codigo 0
// sin crear nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createOwner({
    email: arg('email'),
    name: arg('name'),
    vertical: arg('vertical'),
    slug: arg('slug'),
    password: arg('password'),
  })
    .then((r) => {
      console.log('OK owner creado:')
      console.log(JSON.stringify(r, null, 2))
      if (r.generatedPassword) console.log('\nGuarda la password generada: no se vuelve a mostrar.')
    })
    .catch((e) => {
      console.error('ERROR:', e.message)
      // exitCode y no process.exit(): ver la nota en attach-owner.mjs.
      process.exitCode = 1
    })
}
