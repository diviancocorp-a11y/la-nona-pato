#!/usr/bin/env node
/**
 * Validador del paquete master de Dico Physical 3D.
 *
 * Uso:
 *   node scripts/dico-3d-validar-assets.mjs <carpeta>
 *   node scripts/dico-3d-validar-assets.mjs --audit <carpeta>
 *
 * El modo normal exige los ocho PNG RGBA finales. El modo --audit admite los
 * renders con matte negro actuales para medirlos, pero nunca los aprueba.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

export const PHYSICAL_POSES = Object.freeze([
  'idle',
  'explain',
  'pointDown',
  'pointUp',
  'thinking',
  'worried',
  'success',
  'error',
]);

export const FINAL_FILE_BY_POSE = Object.freeze({
  idle: 'dico-3d-idle.png',
  explain: 'dico-3d-explain.png',
  pointDown: 'dico-3d-point-down.png',
  pointUp: 'dico-3d-point-up.png',
  thinking: 'dico-3d-thinking.png',
  worried: 'dico-3d-worried.png',
  success: 'dico-3d-success.png',
  error: 'dico-3d-error.png',
});

export const AUDIT_SOURCE_BY_POSE = Object.freeze({
  idle: 'dico_face-idle.png',
  explain: 'dico_body-explaining.png',
  pointDown: 'dico_body-pointing.png',
  pointUp: 'dico_body-attention.png',
  thinking: 'dico_face-thinking.png',
  worried: 'dico_face-worried.png',
  success: 'dico_face-success.png',
  error: 'dico_face-error.png',
});

export const CANONICAL_3D_FRAME_REFERENCE = Object.freeze({
  file: 'dico-3d-idle.png',
  sha256: 'a08dfb896562140b4b8126b51714e0feb7d34e5447d5e8f1e811435534110a7b',
  width: 1600,
  height: 1136,
  centerX: 800,
  centerY: 546.5,
  coinDiameter: 517.02,
  blueDiameter: 453.5,
  bbox: Object.freeze({ left: 490, top: 288, right: 1124, bottom: 878 }),
});

export const MASTER_SHA256_BY_FILE = Object.freeze({
  'dico-3d-idle.png': 'a08dfb896562140b4b8126b51714e0feb7d34e5447d5e8f1e811435534110a7b',
  'dico-3d-explain.png': 'd366d9772426bac0cf8f35956f3033d7ff5f150a81623b19b3a19e3e6e7b81c1',
  'dico-3d-point-down.png': '089d50ef9ad42e3bd8ee8e5fdef185471f4af8ebf0b64874722a951f3963086b',
  'dico-3d-point-up.png': 'd117ff936ffc15b38ddbc9c4b663e7e15622e7bb4ef50fc7f6f302d3209a582d',
  'dico-3d-thinking.png': '813ede8b378d879050c9b9939ce400f4ddabe89e215e0950a4fdf73a486f424a',
  'dico-3d-worried.png': '517bc8583230f8e13cbfafc8ced31ead1c379cdd2763e6cbd0a940aaa2957ea3',
  'dico-3d-success.png': '764c5857dc7ddceb48773958f8d45a46f7137632a56c6465d73d6d511978eb23',
  'dico-3d-error.png': 'ac0aaa0f3c60577e42bd16fc2191bf3fd3ec614f7791b0bf75c92592e49e0752',
});

export const FINAL_CONTRACT = Object.freeze({
  width: CANONICAL_3D_FRAME_REFERENCE.width,
  height: CANONICAL_3D_FRAME_REFERENCE.height,
  center: Object.freeze({
    x: CANONICAL_3D_FRAME_REFERENCE.centerX / CANONICAL_3D_FRAME_REFERENCE.width,
    y: CANONICAL_3D_FRAME_REFERENCE.centerY / CANONICAL_3D_FRAME_REFERENCE.height,
  }),
  coinDiameter: CANONICAL_3D_FRAME_REFERENCE.coinDiameter / CANONICAL_3D_FRAME_REFERENCE.height,
  canonicalReferenceSha256: CANONICAL_3D_FRAME_REFERENCE.sha256,
  masterSha256ByFile: MASTER_SHA256_BY_FILE,
  centerTolerancePx: 8,
  diameterToleranceRatio: 0.015,
  registrationCenterTolerancePx: 8,
  registrationDiameterToleranceRatio: 0.015,
  minimumPaddingPx: 96,
  minimumTransparentRatio: 0.05,
  minimumVisibleRatio: 0.05,
});

const LEGACY_NAME = /(legacy|retro|galera|bigote|mustache|top[-_ ]?hat|old)/i;
const NON_OFFICIAL_POSE_NAME = /(processing|question)/i;
const IMAGE_EXTENSION = /\.(png|webp|avif|jpe?g)$/i;

function pngHeader(bytes) {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('no es un PNG valido');
  }
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('IHDR ausente');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    interlace: bytes[28],
  };
}

function quantile(values, ratio) {
  if (!values.length) return null;
  const ordered = values.slice().sort((a, b) => a - b);
  return ordered[Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * ratio)))];
}

function median(values) {
  return quantile(values, 0.5);
}

function boxFromMask(width, height, includesPixel) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!includesPixel(x, y)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      pixels++;
    }
  }
  if (right < 0) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    pixels,
  };
}

function sampleMatte(data, width, height) {
  const samples = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 200));
  const add = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };
  for (let x = 0; x < width; x += stride) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = stride; y < height - 1; y += stride) {
    add(0, y);
    add(width - 1, y);
  }
  return {
    r: median(samples.map(pixel => pixel[0])),
    g: median(samples.map(pixel => pixel[1])),
    b: median(samples.map(pixel => pixel[2])),
  };
}

function matteDistance(pixel, matte) {
  const dr = pixel[0] - matte.r;
  const dg = pixel[1] - matte.g;
  const db = pixel[2] - matte.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBlueRing(r, g, b) {
  return b >= 45 && b > r * 1.22 && b > g * 1.12 && r < 155;
}

function isCoinMaterial(r, g, b) {
  const gold = r >= 90 && g >= 55 && r > b * 1.22 && g > b * 1.08;
  return gold || isBlueRing(r, g, b);
}

function measureCoin(data, width, height, visible) {
  const blueX = [];
  const blueY = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visible(x, y)) continue;
      const i = (y * width + x) * 4;
      if (!isBlueRing(data[i], data[i + 1], data[i + 2])) continue;
      blueX.push(x);
      blueY.push(y);
    }
  }
  if (blueX.length < 100) return null;

  const left = quantile(blueX, 0.004);
  const right = quantile(blueX, 0.996);
  const top = quantile(blueY, 0.004);
  const bottom = quantile(blueY, 0.996);
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const blueRadius = ((right - left) + (bottom - top)) / 4;
  const radialEdges = [];

  for (let degree = 0; degree < 360; degree++) {
    const angle = degree * Math.PI / 180;
    let last = null;
    const start = Math.max(1, blueRadius * 0.72);
    const end = blueRadius * 1.34;
    for (let radius = start; radius <= end; radius += 0.75) {
      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * radius);
      if (x < 0 || y < 0 || x >= width || y >= height || !visible(x, y)) continue;
      const i = (y * width + x) * 4;
      if (isCoinMaterial(data[i], data[i + 1], data[i + 2])) last = radius;
    }
    if (last !== null) radialEdges.push(last);
  }

  const outerRadius = median(radialEdges);
  if (!outerRadius) return null;
  return {
    centerX: Number(centerX.toFixed(2)),
    centerY: Number(centerY.toFixed(2)),
    diameter: Number((outerRadius * 2).toFixed(2)),
    blueDiameter: Number((blueRadius * 2).toFixed(2)),
    sampleCount: radialEdges.length,
  };
}

export function analyzePng(file, { auditOpaque = false } = {}) {
  const bytes = readFileSync(file);
  const header = pngHeader(bytes);
  const png = PNG.sync.read(bytes);
  const total = png.width * png.height;
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  let transparentRgbResidual = 0;
  let voltPixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const actualAlpha = png.data[i + 3];
    if (actualAlpha === 0) {
      transparent++;
      if (r !== 0 || g !== 0 || b !== 0) transparentRgbResidual++;
    }
    else if (actualAlpha === 255) opaque++;
    else partial++;
    if (Math.hypot(r - 61, g - 107, b - 255) <= 36 && actualAlpha > 0) voltPixels++;
  }

  const hasRealTransparency = transparent > 0 && opaque + partial > 0;
  const matte = auditOpaque && !hasRealTransparency
    ? sampleMatte(png.data, png.width, png.height)
    : null;
  const visible = hasRealTransparency
    ? (x, y) => png.data[(y * png.width + x) * 4 + 3] > 0
    : matte
      ? (x, y) => {
        const i = (y * png.width + x) * 4;
        return matteDistance([png.data[i], png.data[i + 1], png.data[i + 2]], matte) > 22;
      }
      : () => true;
  const bbox = boxFromMask(png.width, png.height, visible);
  const coin = measureCoin(png.data, png.width, png.height, visible);

  return {
    file: basename(file),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    colorType: header.colorType,
    interlace: header.interlace,
    alpha: {
      rgba: header.colorType === 6,
      transparent,
      partial,
      opaque,
      transparentRatio: transparent / total,
      visibleRatio: (opaque + partial) / total,
      real: hasRealTransparency,
      transparentRgbResidual,
    },
    voltPixels,
    matte,
    bbox,
    padding: bbox ? {
      top: bbox.top,
      right: png.width - 1 - bbox.right,
      bottom: png.height - 1 - bbox.bottom,
      left: bbox.left,
    } : null,
    coin,
  };
}

function issue(code, file, message) {
  return { code, file, message };
}

export function validateFolder(folder, contract = FINAL_CONTRACT) {
  const absolute = resolve(folder);
  const issues = [];
  const analyses = [];
  if (!existsSync(absolute)) {
    return { ok: false, folder: absolute, issues: [issue('FOLDER_MISSING', null, 'la carpeta no existe')], analyses };
  }

  const files = readdirSync(absolute, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name);
  const imageFiles = files.filter(file => IMAGE_EXTENSION.test(file));
  const expected = Object.values(FINAL_FILE_BY_POSE);

  for (const file of imageFiles.filter(file => LEGACY_NAME.test(file))) {
    issues.push(issue('LEGACY_ASSET', file, 'el nombre identifica un asset legacy prohibido'));
  }
  for (const file of imageFiles.filter(file => NON_OFFICIAL_POSE_NAME.test(file))) {
    issues.push(issue('NON_OFFICIAL_POSE', file, 'processing y question no pertenecen al vocabulario oficial'));
  }
  for (const file of expected) {
    if (!imageFiles.includes(file)) issues.push(issue('POSE_MISSING', file, 'falta la pose oficial'));
  }
  for (const file of imageFiles) {
    if (!expected.includes(file)) issues.push(issue('UNEXPECTED_ASSET', file, 'el paquete final debe contener exactamente ocho PNG master'));
  }

  for (const pose of PHYSICAL_POSES) {
    const file = FINAL_FILE_BY_POSE[pose];
    if (!imageFiles.includes(file)) continue;
    let analysis;
    try {
      analysis = analyzePng(join(absolute, file));
      analysis.pose = pose;
      analyses.push(analysis);
    } catch (error) {
      issues.push(issue('PNG_INVALID', file, error.message));
      continue;
    }

    if (pose === 'idle' && contract.canonicalReferenceSha256
      && analysis.sha256 !== contract.canonicalReferenceSha256) {
      issues.push(issue('CANONICAL_REFERENCE_MISMATCH', file, 'idle no coincide byte a byte con la referencia canonica'));
    }
    const expectedSha256 = contract.masterSha256ByFile?.[file];
    if (expectedSha256 && analysis.sha256 !== expectedSha256) {
      issues.push(issue('MASTER_HASH_MISMATCH', file, 'el master no coincide byte a byte con el hash fijado'));
    }

    if (analysis.width !== contract.width || analysis.height !== contract.height) {
      issues.push(issue('CANVAS_MISMATCH', file, `canvas ${analysis.width}x${analysis.height}; esperado ${contract.width}x${contract.height}`));
    }
    if (!analysis.alpha.rgba) {
      issues.push(issue('NOT_RGBA', file, `PNG color type ${analysis.colorType}; se exige RGBA color type 6`));
    }
    if (!analysis.alpha.real || analysis.alpha.transparentRatio < contract.minimumTransparentRatio) {
      issues.push(issue('NO_REAL_TRANSPARENCY', file, 'no hay transparencia real suficiente'));
    }
    if (analysis.alpha.visibleRatio < contract.minimumVisibleRatio) {
      issues.push(issue('NO_VISIBLE_SUBJECT', file, 'el sujeto visible ocupa menos del minimo'));
    }
    if (analysis.alpha.real && analysis.alpha.partial === 0) {
      issues.push(issue('NO_ALPHA_ANTIALIAS', file, 'el borde no contiene alfa parcial'));
    }
    if (analysis.alpha.transparentRgbResidual > 0) {
      issues.push(issue('TRANSPARENT_RGB_RESIDUAL', file, `${analysis.alpha.transparentRgbResidual} pixeles transparentes conservan RGB residual`));
    }
    if (analysis.voltPixels > 0) {
      issues.push(issue('VOLT_RASTERIZED', file, `${analysis.voltPixels} pixeles visibles coinciden o se aproximan a Volt`));
    }
    if (!analysis.bbox) {
      issues.push(issue('BBOX_EMPTY', file, 'no se pudo medir el personaje'));
    } else {
      const minimumPadding = Math.min(...Object.values(analysis.padding));
      if (minimumPadding < contract.minimumPaddingPx) {
        issues.push(issue('CLIPPING_RISK', file, `padding minimo ${minimumPadding}px; se exigen ${contract.minimumPaddingPx}px`));
      }
    }
    if (!analysis.coin) {
      issues.push(issue('COIN_NOT_FOUND', file, 'no se pudo medir el aro azul de registro'));
    } else {
      const expectedX = contract.center.x * contract.width;
      const expectedY = contract.center.y * contract.height;
      const expectedDiameter = contract.coinDiameter * contract.height;
      const centerDelta = Math.hypot(analysis.coin.centerX - expectedX, analysis.coin.centerY - expectedY);
      const diameterDelta = Math.abs(analysis.coin.diameter - expectedDiameter) / expectedDiameter;
      if (centerDelta > contract.centerTolerancePx) {
        issues.push(issue('CENTER_OUT_OF_TOLERANCE', file, `centro desviado ${centerDelta.toFixed(2)}px`));
      }
      if (diameterDelta > contract.diameterToleranceRatio) {
        issues.push(issue('SCALE_OUT_OF_TOLERANCE', file, `diametro desviado ${(diameterDelta * 100).toFixed(2)}%`));
      }
    }
  }

  const measured = analyses.filter(item => item.coin);
  if (measured.length > 1) {
    const centersX = measured.map(item => item.coin.centerX);
    const centersY = measured.map(item => item.coin.centerY);
    const diameters = measured.map(item => item.coin.diameter);
    const centerSpread = Math.hypot(Math.max(...centersX) - Math.min(...centersX), Math.max(...centersY) - Math.min(...centersY));
    const diameterSpread = (Math.max(...diameters) - Math.min(...diameters)) / median(diameters);
    if (centerSpread > contract.registrationCenterTolerancePx) {
      issues.push(issue('REGISTRATION_CENTER_SPREAD', null, `dispersion entre poses ${centerSpread.toFixed(2)}px`));
    }
    if (diameterSpread > contract.registrationDiameterToleranceRatio) {
      issues.push(issue('REGISTRATION_SCALE_SPREAD', null, `dispersion de escala ${(diameterSpread * 100).toFixed(2)}%`));
    }
  }

  return { ok: issues.length === 0, folder: absolute, issues, analyses };
}

export function auditFolder(folder) {
  const absolute = resolve(folder);
  const rows = [];
  for (const pose of PHYSICAL_POSES) {
    const file = AUDIT_SOURCE_BY_POSE[pose];
    const path = join(absolute, file);
    if (!existsSync(path)) {
      rows.push({ pose, file, missing: true });
      continue;
    }
    rows.push({ pose, ...analyzePng(path, { auditOpaque: true }) });
  }
  const extras = existsSync(absolute)
    ? readdirSync(absolute).filter(file => IMAGE_EXTENSION.test(file) && !Object.values(AUDIT_SOURCE_BY_POSE).includes(file))
    : [];
  const extraAnalyses = extras.map(file => ({
    ...analyzePng(join(absolute, file), { auditOpaque: true }),
    official: false,
  }));
  return { folder: absolute, rows, extras: extraAnalyses };
}

function printValidation(result) {
  console.log(`Dico 3D final: ${result.folder}`);
  for (const analysis of result.analyses) {
    const coin = analysis.coin
      ? `centro ${analysis.coin.centerX},${analysis.coin.centerY} diam ${analysis.coin.diameter}`
      : 'moneda no medida';
    console.log(`  ${analysis.pose.padEnd(9)} ${analysis.width}x${analysis.height} alpha=${analysis.alpha.real ? 'si' : 'no'} ${coin}`);
  }
  if (result.ok) {
    console.log('\nPASS: contrato final completo.');
    return;
  }
  console.error(`\nFAIL: ${result.issues.length} incumplimiento(s).`);
  for (const item of result.issues) {
    console.error(`  [${item.code}]${item.file ? ` ${item.file}:` : ''} ${item.message}`);
  }
}

function printAudit(result) {
  console.log(JSON.stringify(result, null, 2));
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const audit = args[0] === '--audit';
  const folder = audit ? args[1] : args[0];
  if (!folder) {
    console.error('Uso: node scripts/dico-3d-validar-assets.mjs [--audit] <carpeta>');
    process.exit(2);
  }
  if (audit) {
    printAudit(auditFolder(folder));
  } else {
    const result = validateFolder(folder);
    printValidation(result);
    process.exitCode = result.ok ? 0 : 1;
  }
}
