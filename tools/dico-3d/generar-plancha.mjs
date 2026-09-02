#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import {
  FINAL_FILE_BY_POSE,
  FINAL_CONTRACT,
  validateFolder,
} from '../../scripts/dico-3d-validar-assets.mjs';

const CELL_WIDTH = 420;
const CELL_HEIGHT = 430;
const GAP = 16;
const MARGIN = 24;
const HEADER = 116;
const COLUMNS = 4;
const IMAGE_WIDTH = 380;
const IMAGE_HEIGHT = 270;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fixed(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function dataUri(file) {
  const extension = extname(file).slice(1).toLowerCase();
  return `data:image/${extension};base64,${readFileSync(file).toString('base64')}`;
}

function imageTransform(width, height, x, y) {
  const scale = Math.min(IMAGE_WIDTH / width, IMAGE_HEIGHT / height);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  return {
    scale,
    x: x + (IMAGE_WIDTH - renderedWidth) / 2,
    y: y + (IMAGE_HEIGHT - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
  };
}

function line(x, y, text, color = '#aeb8cc', weight = 400) {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="12" font-weight="${weight}">${escapeXml(text)}</text>`;
}

function cell(row, index, sourceFolder, overlays) {
  const column = index % COLUMNS;
  const rowIndex = Math.floor(index / COLUMNS);
  const x = MARGIN + column * (CELL_WIDTH + GAP);
  const y = HEADER + rowIndex * (CELL_HEIGHT + GAP);
  const imageX = x + 20;
  const imageY = y + 58;
  const file = join(sourceFolder, FINAL_FILE_BY_POSE[row.pose]);
  const transform = imageTransform(row.width, row.height, imageX, imageY);
  const mapX = value => transform.x + value * transform.scale;
  const mapY = value => transform.y + value * transform.scale;
  const minSafeX = row.width * (FINAL_CONTRACT.minimumPaddingPx / FINAL_CONTRACT.width);
  const minSafeY = row.height * (FINAL_CONTRACT.minimumPaddingPx / FINAL_CONTRACT.height);
  const status = 'MASTER PASS';
  const statusColor = '#5eead4';

  const overlay = !overlays ? '' : `
    <rect x="${mapX(minSafeX)}" y="${mapY(minSafeY)}"
      width="${(row.width - minSafeX * 2) * transform.scale}"
      height="${(row.height - minSafeY * 2) * transform.scale}"
      fill="none" stroke="#5eead4" stroke-width="1" stroke-dasharray="5 4" opacity="0.9" />
    <rect x="${mapX(row.bbox.left)}" y="${mapY(row.bbox.top)}"
      width="${row.bbox.width * transform.scale}" height="${row.bbox.height * transform.scale}"
      fill="none" stroke="#f6b94a" stroke-width="1.5" />
    <circle cx="${mapX(row.coin.centerX)}" cy="${mapY(row.coin.centerY)}"
      r="${row.coin.diameter * transform.scale / 2}" fill="none"
      stroke="#3D6BFF" stroke-width="1.5" />
    <line x1="${mapX(row.coin.centerX) - 8}" y1="${mapY(row.coin.centerY)}"
      x2="${mapX(row.coin.centerX) + 8}" y2="${mapY(row.coin.centerY)}"
      stroke="#ffffff" stroke-width="1" />
    <line x1="${mapX(row.coin.centerX)}" y1="${mapY(row.coin.centerY) - 8}"
      x2="${mapX(row.coin.centerX)}" y2="${mapY(row.coin.centerY) + 8}"
      stroke="#ffffff" stroke-width="1" />`;

  return `
  <g>
    <rect x="${x}" y="${y}" width="${CELL_WIDTH}" height="${CELL_HEIGHT}" rx="14"
      fill="#151b29" stroke="#2a3449" />
    <text x="${x + 20}" y="${y + 27}" fill="#ffffff" font-size="18" font-weight="700">${escapeXml(row.pose)}</text>
    <text x="${x + CELL_WIDTH - 20}" y="${y + 27}" fill="${statusColor}"
      font-size="11" font-weight="700" text-anchor="end">${status}</text>
    <text x="${x + 20}" y="${y + 45}" fill="#7f8ba3" font-size="11">${escapeXml(row.file)}</text>
    <rect x="${imageX}" y="${imageY}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"
      fill="#050608" stroke="#34405a" />
    <image href="${dataUri(file)}" x="${transform.x}" y="${transform.y}"
      width="${transform.width}" height="${transform.height}" />
    ${overlay}
    ${line(x + 20, y + 350, `${row.width}x${row.height}  center ${fixed(row.coin.centerX / row.width * 100, 2)}% / ${fixed(row.coin.centerY / row.height * 100, 2)}%`)}
    ${line(x + 20, y + 370, `coin ${fixed(row.coin.diameter)}px (${fixed(row.coin.diameter / row.height * 100, 2)}% alto)`)}
    ${line(x + 20, y + 390, `bbox ${row.bbox.left},${row.bbox.top}-${row.bbox.right},${row.bbox.bottom}`)}
    ${line(x + 20, y + 410, `padding ${row.padding.top}/${row.padding.right}/${row.padding.bottom}/${row.padding.left}`, '#d7deec')}
  </g>`;
}

export function generateSheet(sourceFolder, outputFile, { overlays = true } = {}) {
  const source = resolve(sourceFolder);
  const output = resolve(outputFile);
  if (!existsSync(source)) throw new Error(`No existe la carpeta: ${source}`);
  const validation = validateFolder(source);
  if (!validation.ok) {
    throw new Error(`Pack invalido: ${validation.issues.map(item => item.code).join(', ')}`);
  }

  const width = MARGIN * 2 + COLUMNS * CELL_WIDTH + (COLUMNS - 1) * GAP;
  const height = HEADER + MARGIN + 2 * CELL_HEIGHT + GAP;
  const cards = validation.analyses.map((row, index) => cell(row, index, source, overlays)).join('\n');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0b0f18" />
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="${MARGIN}" y="40" fill="#ffffff" font-size="26" font-weight="700">Dico Physical 3D — plancha tecnica</text>
    <text x="${MARGIN}" y="66" fill="#aeb8cc" font-size="13">8 masters RGBA oficiales · registro canonico validado · ningun master fue modificado</text>
    <line x1="${MARGIN}" y1="88" x2="${MARGIN + 36}" y2="88" stroke="#3D6BFF" stroke-width="2" />
    <text x="${MARGIN + 44}" y="92" fill="#aeb8cc" font-size="12">diametro de moneda + centro</text>
    <line x1="${MARGIN + 270}" y1="88" x2="${MARGIN + 306}" y2="88" stroke="#f6b94a" stroke-width="2" />
    <text x="${MARGIN + 314}" y="92" fill="#aeb8cc" font-size="12">bbox del personaje</text>
    <line x1="${MARGIN + 506}" y1="88" x2="${MARGIN + 542}" y2="88" stroke="#5eead4" stroke-width="2" stroke-dasharray="5 4" />
    <text x="${MARGIN + 550}" y="92" fill="#aeb8cc" font-size="12">safe area proporcional</text>
    ${cards}
  </g>
</svg>`;

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, svg, 'utf8');
  return { output, poses: validation.analyses.length };
}

const args = process.argv.slice(2);
const sourceFolder = args.find(arg => !arg.startsWith('--'));
const outputArg = args.filter(arg => !arg.startsWith('--'))[1];
if (!sourceFolder) {
  console.error('Uso: node tools/dico-3d/generar-plancha.mjs <carpeta-assets> [salida.svg] [--no-overlays]');
  process.exit(2);
}

const result = generateSheet(
  sourceFolder,
  outputArg || '.qa-lite/dico-3d/plancha-tecnica.svg',
  { overlays: !args.includes('--no-overlays') },
);
console.log(`OK  ${result.poses} poses -> ${result.output}`);
