#!/usr/bin/env node
/**
 * Dico Physical 3D: masters PNG -> derivados WebP lossless.
 *
 *   node scripts/dico-3d-derivar.mjs [--check]
 *
 * Los masters son inmutables. El modo normal escribe un WebP lossless por
 * pose y comprueba que el RGBA decodificado sea identico al master. El modo
 * --check no escribe y falla si falta un derivado, fue editado a mano o deja
 * de decodificar pixel a pixel igual al PNG aprobado.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js';
import encodeWebp, { init as initWebpEncoder } from '@jsquash/webp/encode.js';
import { simd } from 'wasm-feature-detect';
import { PNG } from 'pngjs';
import {
  DICO_PHYSICAL_ASSETS,
  DICO_PHYSICAL_POSES,
} from '../platform/brand/dico-3d-assets.mjs';

export const DICO_3D_MASTER_ROOT = 'platform/brand/dico-3d-masters';
export const DICO_3D_RUNTIME_ROOT = 'public/brand/dico/physical';
export const DICO_3D_WEBP_OPTIONS = Object.freeze({
  lossless: 1,
  exact: 1,
  method: 6,
  quality: 100,
});

const IMAGE_EXTENSION = /\.(png|webp|avif|jpe?g)$/i;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactImageNames(folder, expected) {
  const actual = readdirSync(folder)
    .filter(file => IMAGE_EXTENSION.test(file))
    .sort();
  const wanted = expected.slice().sort();
  const missing = wanted.filter(file => !actual.includes(file));
  const unexpected = actual.filter(file => !wanted.includes(file));
  return { actual, missing, unexpected, ok: !missing.length && !unexpected.length };
}

let codecInitialization;

async function initializeCodecs() {
  if (!codecInitialization) {
    codecInitialization = (async () => {
      const packageRoot = dirname(fileURLToPath(import.meta.resolve('@jsquash/webp/encode.js')));
      const encoderName = await simd() ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
      const encoderModule = await WebAssembly.compile(
        readFileSync(join(packageRoot, 'codec', 'enc', encoderName)),
      );
      const decoderModule = await WebAssembly.compile(
        readFileSync(join(packageRoot, 'codec', 'dec', 'webp_dec.wasm')),
      );
      await initWebpEncoder(encoderModule);
      await initWebpDecoder(decoderModule);
    })();
  }
  await codecInitialization;
}

function decodedPng(input) {
  const image = PNG.sync.read(Buffer.isBuffer(input) ? input : readFileSync(input));
  return {
    data: Buffer.from(image.data),
    width: image.width,
    height: image.height,
    channels: 4,
  };
}

async function decodedWebp(input) {
  await initializeCodecs();
  const bytes = Buffer.isBuffer(input) ? input : readFileSync(input);
  const image = await decodeWebp(bytes);
  return {
    data: Buffer.from(image.data),
    width: image.width,
    height: image.height,
    channels: 4,
  };
}

export async function compareMasterAndDerivative(masterInput, derivativeInput) {
  const master = decodedPng(masterInput);
  const derivative = await decodedWebp(derivativeInput);
  const sameGeometry = master.width === derivative.width
    && master.height === derivative.height
    && master.channels === derivative.channels;
  const samePixels = sameGeometry && Buffer.compare(master.data, derivative.data) === 0;
  return {
    sameGeometry,
    samePixels,
    width: derivative.width,
    height: derivative.height,
    channels: derivative.channels,
  };
}

export async function encodePhysicalWebp(masterFile) {
  await initializeCodecs();
  const image = decodedPng(masterFile);
  const encoded = await encodeWebp(image, DICO_3D_WEBP_OPTIONS);
  return Buffer.from(encoded);
}

export async function validatePhysicalRuntime({
  masterRoot = DICO_3D_MASTER_ROOT,
  runtimeRoot = DICO_3D_RUNTIME_ROOT,
} = {}) {
  const masters = resolve(masterRoot);
  const runtime = resolve(runtimeRoot);
  const issues = [];
  const rows = [];
  if (!existsSync(masters)) issues.push({ code: 'MASTER_FOLDER_MISSING', file: null });
  if (!existsSync(runtime)) issues.push({ code: 'RUNTIME_FOLDER_MISSING', file: null });
  if (issues.length) return { ok: false, masters, runtime, issues, rows };

  const expectedMasters = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].master);
  const expectedRuntime = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].runtime);
  const masterNames = exactImageNames(masters, expectedMasters);
  const runtimeNames = exactImageNames(runtime, expectedRuntime);
  for (const file of masterNames.missing) issues.push({ code: 'MASTER_MISSING', file });
  for (const file of masterNames.unexpected) issues.push({ code: 'MASTER_UNEXPECTED', file });
  for (const file of runtimeNames.missing) issues.push({ code: 'RUNTIME_MISSING', file });
  for (const file of runtimeNames.unexpected) issues.push({ code: 'RUNTIME_UNEXPECTED', file });

  for (const pose of DICO_PHYSICAL_POSES) {
    const entry = DICO_PHYSICAL_ASSETS[pose];
    const masterFile = join(masters, entry.master);
    const runtimeFile = join(runtime, entry.runtime);
    if (!existsSync(masterFile) || !existsSync(runtimeFile)) continue;
    try {
      const comparison = await compareMasterAndDerivative(masterFile, runtimeFile);
      rows.push({ pose, master: entry.master, runtime: entry.runtime, ...comparison });
      if (!comparison.sameGeometry) issues.push({ code: 'RUNTIME_GEOMETRY_MISMATCH', file: entry.runtime });
      else if (!comparison.samePixels) issues.push({ code: 'RUNTIME_PIXEL_MISMATCH', file: entry.runtime });
    } catch (error) {
      issues.push({ code: 'RUNTIME_DECODE_FAILED', file: entry.runtime, message: error.message });
    }
  }

  return { ok: issues.length === 0, masters, runtime, issues, rows };
}

export async function derivePhysicalAssets({
  check = false,
  masterRoot = DICO_3D_MASTER_ROOT,
  runtimeRoot = DICO_3D_RUNTIME_ROOT,
} = {}) {
  const masters = resolve(masterRoot);
  const runtime = resolve(runtimeRoot);
  if (!existsSync(masters)) throw new Error(`No existe ${masters}`);

  const expectedMasters = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].master);
  const masterNames = exactImageNames(masters, expectedMasters);
  if (!masterNames.ok) {
    throw new Error(`Pack master invalido. Faltan: ${masterNames.missing.join(', ') || '-'}; sobran: ${masterNames.unexpected.join(', ') || '-'}`);
  }

  if (!check) mkdirSync(runtime, { recursive: true });
  if (!existsSync(runtime)) throw new Error(`No existe ${runtime}`);

  const expectedRuntime = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].runtime);
  const runtimeNamesBefore = exactImageNames(runtime, expectedRuntime);
  if (check && !runtimeNamesBefore.ok) {
    throw new Error(`Pack runtime invalido. Faltan: ${runtimeNamesBefore.missing.join(', ') || '-'}; sobran: ${runtimeNamesBefore.unexpected.join(', ') || '-'}`);
  }

  const rows = [];
  let failures = 0;
  for (const pose of DICO_PHYSICAL_POSES) {
    const entry = DICO_PHYSICAL_ASSETS[pose];
    const masterFile = join(masters, entry.master);
    const runtimeFile = join(runtime, entry.runtime);
    const masterBytes = readFileSync(masterFile);
    const expectedBytes = await encodePhysicalWebp(masterFile);

    if (!check) writeFileSync(runtimeFile, expectedBytes);
    const actualBytes = existsSync(runtimeFile) ? readFileSync(runtimeFile) : null;
    const encodedMatch = actualBytes !== null && Buffer.compare(actualBytes, expectedBytes) === 0;
    const decoded = actualBytes
      ? await compareMasterAndDerivative(masterFile, actualBytes)
      : { sameGeometry: false, samePixels: false, width: null, height: null, channels: null };
    const ok = encodedMatch && decoded.sameGeometry && decoded.samePixels;
    if (!ok) failures++;
    rows.push({
      pose,
      master: basename(masterFile),
      runtime: basename(runtimeFile),
      masterSha256: sha256(masterBytes),
      runtimeSha256: actualBytes ? sha256(actualBytes) : null,
      masterBytes: masterBytes.length,
      runtimeBytes: actualBytes?.length ?? 0,
      encodedMatch,
      ...decoded,
      ok,
    });
  }

  const runtimeNames = exactImageNames(runtime, expectedRuntime);
  if (!runtimeNames.ok) {
    throw new Error(`Pack runtime invalido. Faltan: ${runtimeNames.missing.join(', ') || '-'}; sobran: ${runtimeNames.unexpected.join(', ') || '-'}`);
  }

  return { ok: failures === 0, check, masters, runtime, rows, failures };
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  try {
    const result = await derivePhysicalAssets({ check: process.argv.includes('--check') });
    for (const row of result.rows) {
      const ratio = row.masterBytes ? row.runtimeBytes / row.masterBytes * 100 : 0;
      console.log(`${row.ok ? 'OK ' : 'X  '} ${row.pose.padEnd(9)} ${row.width}x${row.height} RGBA=${row.samePixels ? 'exacto' : 'distinto'} ${Math.round(row.masterBytes / 1024)} KB -> ${Math.round(row.runtimeBytes / 1024)} KB (${ratio.toFixed(1)}%)`);
    }
    if (!result.ok) {
      console.error(`\nFAIL: ${result.failures} derivado(s) no coinciden con su master.`);
      process.exitCode = 1;
    } else {
      console.log(`\nPASS: ${result.rows.length} derivados WebP lossless reproducibles.`);
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
