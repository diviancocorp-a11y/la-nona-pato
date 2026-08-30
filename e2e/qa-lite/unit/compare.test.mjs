import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pngjs from 'pngjs';
import {
  comparePngFiles, diffValues, PIXELMATCH_OPTIONS, PIXELMATCH_THRESHOLD, sha256,
} from '../../../scripts/qa-lite/compare-artifacts.mjs';
import { formatFirstFailure } from '../../../scripts/qa-lite/report-gate.mjs';

const { PNG } = pngjs;

function pngBuffer(width, height, pixel) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a = 255] = pixel(x, y);
      png.data[offset] = r;
      png.data[offset + 1] = g;
      png.data[offset + 2] = b;
      png.data[offset + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

function compareGenerated(base, candidate) {
  const root = mkdtempSync(join(tmpdir(), 'qa-lite-pixelmatch-'));
  const basePath = join(root, 'base.png');
  const candidatePath = join(root, 'candidate.png');
  const diffPath = join(root, 'diff.png');
  writeFileSync(basePath, base);
  writeFileSync(candidatePath, candidate);
  return {
    root,
    diffPath,
    result: comparePngFiles(basePath, candidatePath, diffPath),
  };
}

test('diff estructural informa el camino exacto', () => {
  const differences = diffValues(
    [{ path: ':root', computed: { color: 'rgb(0, 0, 0)' } }],
    [{ path: ':root', computed: { color: 'rgb(1, 0, 0)' } }],
  );
  assert.deepEqual(differences, [{
    path: '$.0.computed.color',
    before: 'rgb(0, 0, 0)',
    after: 'rgb(1, 0, 0)',
  }]);
});

test('diff estructural no inventa diferencias', () => {
  const value = { classes: ['a', 'b'], box: { width: 100, height: 20 } };
  assert.deepEqual(diffValues(value, structuredClone(value)), []);
});

test('sha256 es estable', () => {
  assert.equal(sha256(Buffer.from('dico')), '30605408377b017aca270984264a50fdb4ab5c14acb1940e3350b9b8fb322e1f');
});

test('Pixelmatch usa el threshold minimo calibrado y excluye antialiasing', () => {
  assert.equal(PIXELMATCH_THRESHOLD, 0.01);
  assert.deepEqual(PIXELMATCH_OPTIONS, { threshold: 0.01, includeAA: false });
});

test('imagenes identicas tienen raw y blocking cero', () => {
  const image = pngBuffer(4, 4, () => [40, 50, 60]);
  const comparison = compareGenerated(image, image);
  try {
    assert.deepEqual(
      {
        raw: comparison.result.rawDiffPixels,
        ignored: comparison.result.ignoredAntiAliasPixels,
        rounding: comparison.result.ignoredRoundingPixels,
        blocking: comparison.result.blockingDiffPixels,
        equal: comparison.result.equal,
      },
      { raw: 0, ignored: 0, rounding: 0, blocking: 0, equal: true },
    );
    assert.equal(existsSync(comparison.diffPath), false);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('variacion subcanal queda cian como redondeo y no bloquea', () => {
  const base = pngBuffer(7, 7, () => [80, 80, 80]);
  const candidate = pngBuffer(7, 7, (x, y) => (
    x === 3 && y === 3 ? [81, 81, 81] : [80, 80, 80]
  ));
  const comparison = compareGenerated(base, candidate);
  try {
    assert.equal(comparison.result.rawDiffPixels, 1);
    assert.equal(comparison.result.ignoredAntiAliasPixels, 0);
    assert.equal(comparison.result.ignoredRoundingPixels, 1);
    assert.equal(comparison.result.blockingDiffPixels, 0);
    assert.equal(comparison.result.equal, true);
    const diff = PNG.sync.read(readFileSync(comparison.diffPath));
    const offset = (3 * diff.width + 3) * 4;
    assert.deepEqual([...diff.data.subarray(offset, offset + 4)], [0, 200, 255, 255]);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('variacion real de antialiasing queda amarilla y no bloquea', () => {
  const edge = (value) => pngBuffer(10, 10, (x) => {
    const channel = x < 4 ? 0 : x === 4 ? value : 255;
    return [channel, channel, channel];
  });
  const comparison = compareGenerated(edge(100), edge(120));
  try {
    assert.equal(comparison.result.rawDiffPixels, 10);
    assert.equal(comparison.result.ignoredAntiAliasPixels, 10);
    assert.equal(comparison.result.blockingDiffPixels, 0);
    assert.equal(comparison.result.equal, true);
    assert.equal(existsSync(comparison.diffPath), true);
    const diff = PNG.sync.read(readFileSync(comparison.diffPath));
    let yellow = 0;
    for (let offset = 0; offset < diff.data.length; offset += 4) {
      if (diff.data[offset] === 255
          && diff.data[offset + 1] === 255
          && diff.data[offset + 2] === 0
          && diff.data[offset + 3] === 255) yellow += 1;
    }
    assert.equal(yellow, 10);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('cambio solido de un pixel bloquea', () => {
  const base = pngBuffer(5, 5, () => [255, 255, 255]);
  const candidate = pngBuffer(5, 5, (x, y) => (
    x === 2 && y === 2 ? [0, 0, 0] : [255, 255, 255]
  ));
  const comparison = compareGenerated(base, candidate);
  try {
    assert.equal(comparison.result.rawDiffPixels, 1);
    assert.equal(comparison.result.blockingDiffPixels, 1);
    assert.equal(comparison.result.equal, false);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('cambio real pequeno en un bloque bloquea', () => {
  const base = pngBuffer(8, 8, () => [255, 255, 255]);
  const candidate = pngBuffer(8, 8, (x, y) => (
    x >= 3 && x <= 5 && y >= 3 && y <= 4 ? [20, 20, 20] : [255, 255, 255]
  ));
  const comparison = compareGenerated(base, candidate);
  try {
    assert.equal(comparison.result.rawDiffPixels, 6);
    assert.ok(comparison.result.blockingDiffPixels > 0);
    assert.equal(comparison.result.equal, false);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('variacion tipo Dico con delta 41 a 46 continua bloqueando', () => {
  const base = pngBuffer(10, 10, () => [220, 170, 40]);
  const candidate = pngBuffer(10, 10, (x, y) => (
    x >= 3 && x <= 6 && y >= 3 && y <= 6 ? [174, 129, 81] : [220, 170, 40]
  ));
  const comparison = compareGenerated(base, candidate);
  try {
    assert.equal(comparison.result.rawDiffPixels, 16);
    assert.ok(comparison.result.blockingDiffPixels > 0);
    assert.equal(comparison.result.equal, false);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('dimensiones diferentes fallan inmediatamente', () => {
  const comparison = compareGenerated(
    pngBuffer(2, 2, () => [0, 0, 0]),
    pngBuffer(3, 2, () => [0, 0, 0]),
  );
  try {
    assert.equal(comparison.result.equal, false);
    assert.equal(comparison.result.width, 2);
    assert.equal(comparison.result.candidateWidth, 3);
    assert.ok(comparison.result.blockingDiffPixels > 0);
    assert.equal(existsSync(comparison.diffPath), true);
  } finally {
    rmSync(comparison.root, { recursive: true, force: true });
  }
});

test('reporte del gate muestra el primer diff DOM y su impacto visual', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-lite-report-'));
  try {
    for (const phase of ['base', 'candidate']) mkdirSync(join(root, phase, 'dom'), { recursive: true });
    writeFileSync(join(root, 'base', 'dom', 'admin--dark--1440x1000.json'), JSON.stringify([
      { path: ':root>main[1]', directText: 'antes' },
    ]));
    writeFileSync(join(root, 'candidate', 'dom', 'admin--dark--1440x1000.json'), JSON.stringify([
      { path: ':root>main[1]', directText: 'despues' },
    ]));
    const report = formatFirstFailure({
      artifactDir: root,
      dom: [{
        file: 'admin--dark--1440x1000.json', equal: false,
        differences: [{ path: '$.0.directText', before: 'antes', after: 'despues' }],
      }],
      screenshots: [{
        file: 'admin--dark--1440x1000.png', equal: false,
        width: 100, height: 50,
        rawDiffPixels: 300,
        ignoredAntiAliasPixels: 50,
        ignoredRoundingPixels: 25,
        blockingDiffPixels: 250,
      }],
    });
    assert.match(report, /surface: admin--dark--1440x1000/);
    assert.match(report, /node: :root>main\[1\]/);
    assert.match(report, /property\/text: \$\.0\.directText/);
    assert.match(report, /RAW PIXELS:\ndifferent: 300/);
    assert.match(report, /ANTI-ALIAS:\nignored: 50/);
    assert.match(report, /ROUNDING:\nignored: 25/);
    assert.match(report, /BLOCKING PIXELS:\ndifferent: 250/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
