import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  FINAL_FILE_BY_POSE,
  PHYSICAL_POSES,
  validateFolder,
} from './dico-3d-validar-assets.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const TEST_CONTRACT = Object.freeze({
  width: 160,
  height: 120,
  center: Object.freeze({ x: 0.5, y: 0.48 }),
  coinDiameter: 0.455,
  centerTolerancePx: 2,
  diameterToleranceRatio: 0.04,
  registrationCenterTolerancePx: 3,
  registrationDiameterToleranceRatio: 0.04,
  minimumPaddingPx: 5,
  minimumTransparentRatio: 0.05,
  minimumVisibleRatio: 0.05,
});

const roots = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dico-3d-validator-'));
  roots.push(resolve(root));
  return root;
}

function writePose(file, {
  width = TEST_CONTRACT.width,
  height = TEST_CONTRACT.height,
  centerX = TEST_CONTRACT.center.x * width,
  centerY = TEST_CONTRACT.center.y * height,
  diameter = TEST_CONTRACT.coinDiameter * height,
  opaqueBackground = false,
  clipped = false,
} = {}) {
  const png = new PNG({ width, height });
  const radius = diameter / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = 0;
      png.data[i + 1] = 0;
      png.data[i + 2] = 0;
      png.data[i + 3] = opaqueBackground ? 255 : 0;

      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius + 0.75) continue;
      const inBlueRing = distance > radius * 0.76 && distance < radius * 0.9;
      png.data[i] = inBlueRing ? 42 : 224;
      png.data[i + 1] = inBlueRing ? 51 : 172;
      png.data[i + 2] = inBlueRing ? 105 : 60;
      png.data[i + 3] = distance > radius ? 128 : 255;
    }
  }
  if (clipped) {
    for (let y = 20; y < 28; y++) {
      for (let x = 0; x < 3; x++) {
        const i = (y * width + x) * 4;
        png.data[i] = 224;
        png.data[i + 1] = 172;
        png.data[i + 2] = 60;
        png.data[i + 3] = 255;
      }
    }
  }
  const colorType = opaqueBackground ? 2 : 6;
  const bytes = PNG.sync.write(png, { colorType, inputColorType: 6 });
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, bytes);
}

function completeFixture(overrides = {}) {
  const root = fixtureRoot();
  for (const pose of PHYSICAL_POSES) {
    writePose(join(root, FINAL_FILE_BY_POSE[pose]), overrides[pose]);
  }
  return root;
}

function codes(result) {
  return new Set(result.issues.map(item => item.code));
}

test.after(() => {
  const safePrefix = resolve(tmpdir(), 'dico-3d-validator-');
  for (const root of roots) {
    assert.ok(root.startsWith(safePrefix), `ruta temporal inesperada: ${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test('paquete positivo: ocho poses registradas y con RGBA real', () => {
  const result = validateFolder(completeFixture(), TEST_CONTRACT);
  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert.equal(result.analyses.length, 8);
});

test('referencia canonica: fija el hash de idle', () => {
  const root = completeFixture();
  const idle = join(root, FINAL_FILE_BY_POSE.idle);
  const canonicalReferenceSha256 = createHash('sha256').update(readFileSync(idle)).digest('hex');
  const pinnedContract = { ...TEST_CONTRACT, canonicalReferenceSha256 };
  assert.equal(validateFolder(root, pinnedContract).ok, true);

  writePose(idle, { centerX: TEST_CONTRACT.center.x * TEST_CONTRACT.width + 1 });
  assert.ok(codes(validateFolder(root, pinnedContract)).has('CANONICAL_REFERENCE_MISMATCH'));
});

test('mutacion: falta una pose', () => {
  const root = completeFixture();
  rmSync(join(root, FINAL_FILE_BY_POSE.error));
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('POSE_MISSING'));
});

test('mutacion: asset sin alfa', () => {
  const root = completeFixture({ idle: { opaqueBackground: true } });
  const found = codes(validateFolder(root, TEST_CONTRACT));
  assert.ok(found.has('NOT_RGBA'));
  assert.ok(found.has('NO_REAL_TRANSPARENCY'));
});

test('mutacion: canvas incorrecto', () => {
  const root = completeFixture({ pointDown: { width: 164 } });
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('CANVAS_MISMATCH'));
});

test('mutacion: centro fuera de tolerancia', () => {
  const root = completeFixture({ thinking: { centerX: 90 } });
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('CENTER_OUT_OF_TOLERANCE'));
});

test('mutacion: escala incorrecta', () => {
  const root = completeFixture({ success: { diameter: 68 } });
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('SCALE_OUT_OF_TOLERANCE'));
});

test('mutacion: archivo legacy', () => {
  const root = completeFixture();
  copyFileSync(join(root, FINAL_FILE_BY_POSE.idle), join(root, 'dico-3d-retro-galera.png'));
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('LEGACY_ASSET'));
});

test('mutacion: clipping contra el borde', () => {
  const root = completeFixture({ worried: { clipped: true } });
  assert.ok(codes(validateFolder(root, TEST_CONTRACT)).has('CLIPPING_RISK'));
});

test('mutacion: nombre incorrecto', () => {
  const root = completeFixture();
  renameSync(join(root, FINAL_FILE_BY_POSE.explain), join(root, 'dico-3d-explaining.png'));
  const found = codes(validateFolder(root, TEST_CONTRACT));
  assert.ok(found.has('POSE_MISSING'));
  assert.ok(found.has('UNEXPECTED_ASSET'));
});
