import assert from 'node:assert/strict';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  encodePhysicalWebp,
  validatePhysicalRuntime,
} from './dico-3d-derivar.mjs';
import {
  DICO_PHYSICAL_ASSETS,
  DICO_PHYSICAL_POSES,
} from '../platform/brand/dico-3d-assets.mjs';

const MASTER_ROOT = resolve('platform/brand/dico-3d-masters');
const RUNTIME_ROOT = resolve('public/brand/dico/physical');
const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dico-3d-runtime-'));
  const masterRoot = join(root, 'masters');
  const runtimeRoot = join(root, 'runtime');
  mkdirSync(masterRoot);
  mkdirSync(runtimeRoot);
  roots.push(resolve(root));
  for (const pose of DICO_PHYSICAL_POSES) {
    const entry = DICO_PHYSICAL_ASSETS[pose];
    copyFileSync(join(MASTER_ROOT, entry.master), join(masterRoot, entry.master));
    copyFileSync(join(RUNTIME_ROOT, entry.runtime), join(runtimeRoot, entry.runtime));
  }
  return { masterRoot, runtimeRoot };
}

function codes(result) {
  return new Set(result.issues.map(issue => issue.code));
}

test.after(() => {
  const safePrefix = resolve(tmpdir(), 'dico-3d-runtime-');
  for (const root of roots) {
    assert.ok(root.startsWith(safePrefix), `ruta temporal inesperada: ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test('gemelo positivo: ocho derivados equivalen pixel a pixel a sus masters', async () => {
  const result = await validatePhysicalRuntime();
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.rows.length, 8);
  assert.ok(result.rows.every(row => row.sameGeometry && row.samePixels));
});

test('gemelo negativo: falta un derivado 1:1', async () => {
  const roots = fixture();
  rmSync(join(roots.runtimeRoot, DICO_PHYSICAL_ASSETS.error.runtime));
  const result = await validatePhysicalRuntime(roots);
  assert.ok(codes(result).has('RUNTIME_MISSING'));
});

test('gemelo negativo: processing no puede entrar al pack runtime', async () => {
  const roots = fixture();
  copyFileSync(
    join(roots.runtimeRoot, DICO_PHYSICAL_ASSETS.idle.runtime),
    join(roots.runtimeRoot, 'dico-3d-processing.webp'),
  );
  const result = await validatePhysicalRuntime(roots);
  assert.ok(codes(result).has('RUNTIME_UNEXPECTED'));
});

test('gemelo negativo: detecta alteracion visual con geometria conservada', async () => {
  const roots = fixture();
  copyFileSync(
    join(roots.runtimeRoot, DICO_PHYSICAL_ASSETS.idle.runtime),
    join(roots.runtimeRoot, DICO_PHYSICAL_ASSETS.error.runtime),
  );
  const result = await validatePhysicalRuntime(roots);
  assert.ok(codes(result).has('RUNTIME_PIXEL_MISMATCH'));
});

test('gemelo negativo: detecta geometria runtime distinta', async () => {
  const roots = fixture();
  const tiny = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < tiny.data.length; i += 4) {
    tiny.data[i] = 220;
    tiny.data[i + 1] = 170;
    tiny.data[i + 2] = 60;
    tiny.data[i + 3] = 255;
  }
  const pngFile = join(roots.masterRoot, 'tiny.png');
  writeFileSync(pngFile, PNG.sync.write(tiny));
  const encoded = await encodePhysicalWebp(pngFile);
  writeFileSync(join(roots.runtimeRoot, DICO_PHYSICAL_ASSETS.idle.runtime), encoded);
  rmSync(pngFile);
  const result = await validatePhysicalRuntime(roots);
  assert.ok(codes(result).has('RUNTIME_GEOMETRY_MISMATCH'));
});

test('manifest: cada pose tiene master y runtime unicos', () => {
  const masters = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].master);
  const runtimes = DICO_PHYSICAL_POSES.map(pose => DICO_PHYSICAL_ASSETS[pose].runtime);
  assert.equal(new Set(masters).size, 8);
  assert.equal(new Set(runtimes).size, 8);
  assert.ok(![...masters, ...runtimes].some(file => /(processing|question)/i.test(file)));
  assert.ok(readFileSync(join(MASTER_ROOT, DICO_PHYSICAL_ASSETS.idle.master)).length > 0);
});
