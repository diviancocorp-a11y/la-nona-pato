#!/usr/bin/env node
// attach-owner: vincula un usuario que YA existe a un tenant que YA existe.
//
// El hermano de create-owner.mjs, para el caso que ese no cubre: create-owner
// CREA el tenant, asi que no sirve para los 5 tenants portados/demo (cochi,
// mala-miga, la-nona-pato, barberia-demo, tienda-demo), que se cargaron por
// script sin dueno. Tienen productos y nadie puede abrirles el panel, porque
// el gate del admin es tener fila en tenant_members.
//
// El trabajo real lo hace la RPC attach_owner (platform/migrations/0024), que
// es idempotente: correr esto dos veces actualiza el rol, no duplica.
//
// Uso CLI:
//   node platform/scripts/attach-owner.mjs --email pepe@mail.com --slug cochi
//   node platform/scripts/attach-owner.mjs --email ana@mail.com --slug cochi --role staff
//
// Env (NUNCA commitear la service role):
//   SUPABASE_URL=https://wwwzdgprsooyjgkuyoav.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=...   (dashboard > Project Settings > API)
//
// Requiere: npm i @supabase/supabase-js

import { createClient } from '@supabase/supabase-js'
import { pathToFileURL } from 'node:url'
import { cargarEnvDeArchivo, faltanCredenciales, esPlaceholder, ENV_FILE } from './_env.mjs'

cargarEnvDeArchivo()

const ROLES = ['owner', 'staff']
const PER_PAGE = 200
const MAX_PAGES = 25 // 5000 usuarios; mas que eso pide otra estrategia de busqueda

/** Busca el auth user por email. El admin API no expone getUserByEmail, hay que paginar. */
async function findUserByEmail(admin, email) {
  const buscado = email.trim().toLowerCase()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error('listUsers: ' + error.message)
    const users = data?.users || []
    const hit = users.find(u => (u.email || '').toLowerCase() === buscado)
    if (hit) return hit
    if (users.length < PER_PAGE) return null // ultima pagina
  }
  throw new Error(`se recorrieron ${MAX_PAGES * PER_PAGE} usuarios sin encontrar ${email}`)
}

export async function attachOwner({ email, slug, role = 'owner' }) {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error(faltanCredenciales(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']))
  if (esPlaceholder(serviceKey)) {
    throw new Error(`Todavia esta el texto de ejemplo en ${ENV_FILE}: reemplazá esa linea por tu service role.`)
  }
  if (!email || !slug) throw new Error('Faltan campos: email, slug')
  if (!ROLES.includes(role)) throw new Error(`rol invalido: ${role} (usar ${ROLES.join('|')})`)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const user = await findUserByEmail(admin, email)
  if (!user) {
    throw new Error(
      `no existe un usuario con el email ${email}. ` +
      'Si el negocio es nuevo, el que corresponde es create-owner.mjs (crea usuario + tenant).'
    )
  }

  const { data: tenantId, error } = await admin.rpc('attach_owner', {
    p_user_id: user.id,
    p_slug: slug,
    p_role: role,
  })
  if (error) throw new Error('attach_owner: ' + error.message)

  return { tenantId, slug, role, userId: user.id, email: user.email }
}

// ---- CLI ----
function arg(name) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// pathToFileURL y no `file://${argv[1]}`: en Windows argv[1] viene con
// backslashes (C:\...) y la comparacion nunca da true, asi que el script
// corria sin hacer nada y salia con codigo 0.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  attachOwner({
    email: arg('email'),
    slug: arg('slug'),
    role: arg('role') || 'owner',
  })
    .then((r) => {
      console.log(`OK: ${r.email} ahora es ${r.role} de "${r.slug}"`)
      console.log(`Panel: https://${r.slug}.divianco.app/admin`)
    })
    .catch((e) => {
      console.error('ERROR:', e.message)
      // exitCode y no process.exit(): forzar la salida con el cliente de
      // supabase todavia abierto dispara un "Assertion failed ... async.c"
      // de libuv en Windows, y ese ruido hace que un error de validacion
      // parezca un crash.
      process.exitCode = 1
    })
}
