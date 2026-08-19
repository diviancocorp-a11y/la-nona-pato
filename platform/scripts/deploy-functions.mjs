#!/usr/bin/env node
// platform/scripts/deploy-functions.mjs
//
// Deploya las edge functions del EDIFICIO (platform/functions/) al proyecto
// hermes-platform.
//
// POR QUE NO SIRVE scripts/deploy-functions.mjs
// Aquel deploya `supabase/functions/` a los 3 tenants LEGACY. Y hay nombres
// repetidos en las dos carpetas —`submit-order` existe en las dos, con codigo
// distinto—, asi que apuntar el script viejo al edificio subiria el codigo
// legacy encima del bueno. Es un error silencioso y caro: el checkout seguiria
// respondiendo, con la logica del otro modelo de datos.
//
// POR QUE UN WORKDIR TEMPORAL
// El CLI de Supabase busca las functions en `<workdir>/supabase/functions/`.
// No hay flag para decirle "estan en platform/functions". Asi que se arma un
// directorio temporal con la estructura que el CLI espera y se le pasa
// --workdir. Es mas simple que mover las carpetas del repo, y evita que las
// dos versiones queden mezcladas en un mismo arbol.
//
// AUTENTICACION
// Necesita la CLI logueada o el token en el entorno. Cualquiera de las dos:
//
//   npx supabase login                       (abre el navegador, no manejas el token)
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   (PowerShell, solo esa terminal)
//
// El token se saca de https://supabase.com/dashboard/account/tokens
//
// Uso:
//   node platform/scripts/deploy-functions.mjs --all
//   node platform/scripts/deploy-functions.mjs --only submit-order
//   node platform/scripts/deploy-functions.mjs --all --dry-run

import { execSync } from "node:child_process";
import { readdirSync, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUNCTIONS_DIR = path.join(ROOT, "platform", "functions");

// El edificio. Un solo proyecto para todos los tenants: el tenant se resuelve
// en runtime por hostname, no por proyecto.
const PROJECT_REF = "wwwzdgprsooyjgkuyoav";

// Functions publicas -> --no-verify-jwt.
// Las keys nuevas de Supabase (sb_publishable_) NO son JWT y el gateway con
// verify_jwt=true las rechaza: el guest checkout queda roto. La proteccion
// real de estas es interna (rate limit + validacion server-side).
// Toda function publica nueva va aca.
const NO_VERIFY_JWT = new Set([
  "submit-order",
  "send-push",     // auth interna: service role o JWT admin
  "tenant-users",  // auth interna: JWT owner del tenant
]);

function parseArgs(argv) {
  const args = { all: false, only: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--only") args.only = new Set(argv[++i].split(",").map(s => s.trim()));
    else if (a === "--dry-run") args.dryRun = true;
    else { console.error(`Flag desconocida: ${a}`); process.exit(1); }
  }
  return args;
}

function main() {
  const { all, only, dryRun } = parseArgs(process.argv);
  if (!all && !only) {
    console.log("Uso: node platform/scripts/deploy-functions.mjs --all | --only fn1,fn2 [--dry-run]");
    process.exit(1);
  }

  const fns = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(path.join(FUNCTIONS_DIR, d.name, "index.ts")))
    .map(d => d.name)
    .filter(n => !only || only.has(n));

  if (fns.length === 0) {
    console.error("No hay functions para deployar.");
    process.exit(1);
  }

  console.log(`\nEdificio (${PROJECT_REF})`);
  console.log(`Functions (${fns.length}): ${fns.join(", ")}\n`);

  // Estructura que el CLI espera, con SOLO las functions del edificio adentro.
  const work = path.join(tmpdir(), `dico-fns-${Date.now()}`);
  const dest = path.join(work, "supabase", "functions");
  mkdirSync(dest, { recursive: true });
  for (const fn of fns) {
    cpSync(path.join(FUNCTIONS_DIR, fn), path.join(dest, fn), { recursive: true });
  }

  const failures = [];
  try {
    for (const fn of fns) {
      const noJwt = NO_VERIFY_JWT.has(fn) ? " --no-verify-jwt" : "";
      const cmd = `npx supabase functions deploy ${fn} --project-ref ${PROJECT_REF}${noJwt}`;
      process.stdout.write(`-> ${fn}${noJwt ? " (no-verify-jwt)" : ""} ... `);
      if (dryRun) { console.log(`DRY RUN: ${cmd}`); continue; }
      try {
        execSync(cmd, { cwd: work, stdio: ["ignore", "pipe", "pipe"] });
        console.log("OK");
      } catch (e) {
        console.log("FALLO");
        const msg = String(e.stderr || e.message);
        console.error(msg.slice(0, 400));
        // El error mas comun no es del codigo: es que falta la sesion.
        if (/access token|supabase login/i.test(msg)) {
          console.error(
            "\n  Falta autenticar la CLI. Corre `npx supabase login` (abre el " +
            "navegador) o defini SUPABASE_ACCESS_TOKEN en el entorno.\n");
        }
        failures.push(fn);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\nFallaron: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(dryRun ? "\nDry run terminado." : "\nListo.");
}

main();
