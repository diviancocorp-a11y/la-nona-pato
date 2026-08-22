#!/usr/bin/env node
// platform/scripts/check-functions.mjs
//
// Typecheck de las edge functions del edificio con Deno.
//
// POR QUE HACE FALTA
// `npm run build` compila `src/`. Las functions viven en `platform/functions/`
// y son TypeScript que NADIE mira hasta que Supabase las deploya — y Supabase
// las deploya igual, porque el deploy no typecheckea. Un error de tipos llega
// a produccion y aparece como un 500 en la cara de alguien.
//
// Salio de un caso real: `filter(Boolean)` sobre un array de `T | null` deja
// el `| null` en el tipo, y el que consumia eso lo tapaba con un `!`. Andaba,
// pero el `!` era una promesa que nadie habia verificado.
//
// Necesita Deno (viene por npx). La primera corrida baja los tipos de las
// dependencias y tarda; despues quedan en cache.
//
// Uso:
//   node platform/scripts/check-functions.mjs
//   node platform/scripts/check-functions.mjs --only staff-invite

import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "platform", "functions");

const i = process.argv.indexOf("--only");
const solo = i > 0 ? new Set(process.argv[i + 1].split(",").map((s) => s.trim())) : null;

const fns = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(DIR, d.name, "index.ts")))
  .map((d) => d.name)
  .filter((n) => !solo || solo.has(n));

if (fns.length === 0) {
  console.error("No hay functions para chequear.");
  process.exit(1);
}

const fallaron = [];
for (const fn of fns) {
  process.stdout.write(`-> ${fn} ... `);
  try {
    // --node-modules-dir=auto: hay functions que importan `npm:` (web-push) o
    // los tipos del edge runtime por jsr, y esos necesitan resolucion de npm.
    // Sin el flag, deno no falla por los tipos sino por no encontrarlos, que
    // parece lo mismo en la salida y no lo es.
    //
    // Comando armado como string, igual que deploy-functions.mjs: pasarle un
    // array a execFile CON shell concatena sin escapar, y node avisa por algo.
    execSync(
      `npx --yes deno check --node-modules-dir=auto "${path.join(DIR, fn, "index.ts")}"`,
      { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    console.log("OK");
  } catch (e) {
    console.log("FALLO");
    // stderr es donde Deno pone los errores de tipos; sin esto el script dice
    // "fallo" y te deja corriendo el comando a mano para saber por que.
    console.error(String(e.stderr || e.stdout || e.message)
      .split("\n").filter((l) => !/^\s*(Download|Check)\b/.test(l)).join("\n").trim());
    fallaron.push(fn);
  }
}

if (fallaron.length) {
  console.error(`\nFallaron: ${fallaron.join(", ")}`);
  process.exit(1);
}
console.log(`\n${fns.length} function(s) — tipos OK.`);
