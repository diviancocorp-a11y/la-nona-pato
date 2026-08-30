import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';

const { PNG } = pngjs;
export const PIXELMATCH_THRESHOLD = 0.01;
export const PIXELMATCH_OPTIONS = Object.freeze({
  threshold: PIXELMATCH_THRESHOLD,
  includeAA: false,
});
const STRICT_ANTI_ALIAS_OPTIONS = Object.freeze({
  threshold: 0,
  includeAA: false,
});

function isDiffColor(data, offset, red, green, blue) {
  return data[offset] === red
    && data[offset + 1] === green
    && data[offset + 2] === blue
    && data[offset + 3] === 255;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function diffValues(before, after, path = '$', output = [], limit = 500) {
  if (output.length >= limit) return output;
  if (Object.is(before, after)) return output;
  if (typeof before !== typeof after || before === null || after === null
      || typeof before !== 'object' || typeof after !== 'object') {
    output.push({ path, before, after });
    return output;
  }
  if (Array.isArray(before) !== Array.isArray(after)) {
    output.push({ path, before, after });
    return output;
  }
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  for (const key of keys) diffValues(before[key], after[key], `${path}.${key}`, output, limit);
  return output;
}

export function compareDomDirectories(baseDir, candidateDir, diffPath) {
  const files = Array.from(new Set([
    ...readdirSync(baseDir).filter((file) => file.endsWith('.json')),
    ...readdirSync(candidateDir).filter((file) => file.endsWith('.json')),
  ])).sort();
  const result = [];
  for (const file of files) {
    const basePath = join(baseDir, file);
    const candidatePath = join(candidateDir, file);
    if (!existsSync(basePath) || !existsSync(candidatePath)) {
      result.push({
        file,
        equal: false,
        differences: [{ path: '$', before: existsSync(basePath) ? 'present' : 'missing', after: existsSync(candidatePath) ? 'present' : 'missing' }],
      });
      continue;
    }
    const before = JSON.parse(readFileSync(basePath, 'utf8'));
    const after = JSON.parse(readFileSync(candidatePath, 'utf8'));
    const differences = diffValues(before, after);
    result.push({ file, equal: differences.length === 0, differences });
  }
  mkdirSync(join(diffPath, '..'), { recursive: true });
  writeFileSync(diffPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return result;
}

export function comparePngFiles(basePath, candidatePath, diffPath) {
  const baseBuffer = readFileSync(basePath);
  const candidateBuffer = readFileSync(candidatePath);
  const before = PNG.sync.read(baseBuffer);
  const after = PNG.sync.read(candidateBuffer);
  if (before.width !== after.width || before.height !== after.height) {
    const width = Math.max(before.width, after.width);
    const height = Math.max(before.height, after.height);
    const diff = new PNG({ width, height });
    let rawDiffPixels = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const beforePresent = x < before.width && y < before.height;
        const afterPresent = x < after.width && y < after.height;
        const beforeOffset = (y * before.width + x) * 4;
        const afterOffset = (y * after.width + x) * 4;
        const changed = !beforePresent || !afterPresent
          || before.data[beforeOffset] !== after.data[afterOffset]
          || before.data[beforeOffset + 1] !== after.data[afterOffset + 1]
          || before.data[beforeOffset + 2] !== after.data[afterOffset + 2]
          || before.data[beforeOffset + 3] !== after.data[afterOffset + 3];
        const diffOffset = (y * width + x) * 4;
        if (changed) {
          rawDiffPixels += 1;
          diff.data[diffOffset] = 255;
          diff.data[diffOffset + 1] = 0;
          diff.data[diffOffset + 2] = 0;
          diff.data[diffOffset + 3] = 255;
        }
      }
    }
    mkdirSync(join(diffPath, '..'), { recursive: true });
    writeFileSync(diffPath, PNG.sync.write(diff));
    return {
      equal: false,
      width: before.width,
      height: before.height,
      candidateWidth: after.width,
      candidateHeight: after.height,
      rawDiffPixels,
      ignoredAntiAliasPixels: 0,
      ignoredRoundingPixels: 0,
      blockingDiffPixels: rawDiffPixels,
      baseSha256: sha256(baseBuffer),
      candidateSha256: sha256(candidateBuffer),
    };
  }
  const strictDiff = new PNG({ width: before.width, height: before.height });
  const finalDiff = new PNG({ width: before.width, height: before.height });
  let rawDiffPixels = 0;
  for (let offset = 0; offset < before.data.length; offset += 4) {
    const changed = before.data[offset] !== after.data[offset]
      || before.data[offset + 1] !== after.data[offset + 1]
      || before.data[offset + 2] !== after.data[offset + 2]
      || before.data[offset + 3] !== after.data[offset + 3];
    if (changed) rawDiffPixels += 1;
  }
  pixelmatch(
    before.data,
    after.data,
    strictDiff.data,
    before.width,
    before.height,
    STRICT_ANTI_ALIAS_OPTIONS,
  );
  const blockingDiffPixels = pixelmatch(
    before.data,
    after.data,
    finalDiff.data,
    before.width,
    before.height,
    PIXELMATCH_OPTIONS,
  );
  let ignoredAntiAliasPixels = 0;
  let ignoredRoundingPixels = 0;
  for (let offset = 0; offset < finalDiff.data.length; offset += 4) {
    const changed = before.data[offset] !== after.data[offset]
      || before.data[offset + 1] !== after.data[offset + 1]
      || before.data[offset + 2] !== after.data[offset + 2]
      || before.data[offset + 3] !== after.data[offset + 3];
    if (!changed) continue;
    if (isDiffColor(finalDiff.data, offset, 255, 0, 0)) {
      continue;
    }
    if (isDiffColor(strictDiff.data, offset, 255, 255, 0)) {
      ignoredAntiAliasPixels += 1;
      finalDiff.data[offset] = 255;
      finalDiff.data[offset + 1] = 255;
      finalDiff.data[offset + 2] = 0;
      finalDiff.data[offset + 3] = 255;
      continue;
    }
    ignoredRoundingPixels += 1;
    finalDiff.data[offset] = 0;
    finalDiff.data[offset + 1] = 200;
    finalDiff.data[offset + 2] = 255;
    finalDiff.data[offset + 3] = 255;
  }
  if (rawDiffPixels > 0) {
    mkdirSync(join(diffPath, '..'), { recursive: true });
    writeFileSync(diffPath, PNG.sync.write(finalDiff));
  }
  return {
    equal: blockingDiffPixels === 0,
    width: before.width,
    height: before.height,
    rawDiffPixels,
    ignoredAntiAliasPixels,
    ignoredRoundingPixels,
    blockingDiffPixels,
    baseSha256: sha256(baseBuffer),
    candidateSha256: sha256(candidateBuffer),
  };
}

export function compareScreenshotDirectories(baseDir, candidateDir, diffDir) {
  const files = Array.from(new Set([
    ...readdirSync(baseDir).filter((file) => file.endsWith('.png')),
    ...readdirSync(candidateDir).filter((file) => file.endsWith('.png')),
  ])).sort();
  return files.map((file) => {
    const basePath = join(baseDir, file);
    const candidatePath = join(candidateDir, file);
    if (!existsSync(basePath) || !existsSync(candidatePath)) {
      return {
        file: basename(file), equal: false,
        rawDiffPixels: null, ignoredAntiAliasPixels: null,
        ignoredRoundingPixels: null, blockingDiffPixels: null,
        basePresent: existsSync(basePath), candidatePresent: existsSync(candidatePath),
      };
    }
    return {
      file: basename(file),
      ...comparePngFiles(basePath, candidatePath, join(diffDir, file)),
    };
  });
}
