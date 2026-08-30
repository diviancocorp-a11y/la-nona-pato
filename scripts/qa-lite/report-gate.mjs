import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactSecrets } from '../../platform/qa-lite/lib.mjs';

function surfaceName(file) {
  return file.replace(/\.(?:json|png)$/i, '');
}

function renderValue(value) {
  if (value === undefined) return '<missing>';
  return JSON.stringify(value);
}

function nodeIndex(path) {
  const match = /^\$\.(\d+)(?:\.|$)/.exec(path || '');
  return match ? Number(match[1]) : null;
}

function readContractNode(artifactDir, phase, file, index) {
  if (index === null) return null;
  const path = join(artifactDir, phase, 'dom', file);
  if (!existsSync(path)) return null;
  const contract = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(contract) ? contract[index] ?? null : null;
}

function nodeDescription(before, after) {
  const beforePath = before?.path || '<missing>';
  const afterPath = after?.path || '<missing>';
  if (beforePath === afterPath) return beforePath;
  return `${beforePath} -> ${afterPath}`;
}

export function formatFirstFailure({ artifactDir, dom, screenshots }) {
  const unequalSurfaces = new Set([
    ...dom.filter((item) => !item.equal).map((item) => surfaceName(item.file)),
    ...screenshots.filter((item) => !item.equal).map((item) => surfaceName(item.file)),
  ]);
  const surface = [...unequalSurfaces].sort()[0];
  if (!surface) return 'FIRST FAILURE\nnone';

  const domEntry = dom.find((item) => surfaceName(item.file) === surface);
  const pixelEntry = screenshots.find((item) => surfaceName(item.file) === surface);
  const firstDiff = domEntry?.differences?.[0];
  const index = nodeIndex(firstDiff?.path);
  const beforeNode = domEntry ? readContractNode(artifactDir, 'base', domEntry.file, index) : null;
  const afterNode = domEntry ? readContractNode(artifactDir, 'candidate', domEntry.file, index) : null;
  const totalPixels = pixelEntry?.width && pixelEntry?.height
    ? pixelEntry.width * pixelEntry.height
    : null;
  const pixelDiffPath = pixelEntry && !pixelEntry.equal
    ? join(artifactDir, 'screenshots', 'diff', pixelEntry.file)
    : '<none>';

  const lines = [
    'FIRST FAILURE',
    `surface: ${surface}`,
    '',
    'DOM:',
  ];
  if (firstDiff) {
    lines.push(
      `node: ${nodeDescription(beforeNode, afterNode)}`,
      `property/text: ${firstDiff.path}`,
      `base: ${renderValue(firstDiff.before)}`,
      `candidate: ${renderValue(firstDiff.after)}`,
    );
  } else {
    lines.push('equal');
  }
  lines.push(
    '',
    'RAW PIXELS:',
    `different: ${pixelEntry?.rawDiffPixels ?? '<not compared>'}`,
    `total: ${totalPixels ?? '<unknown>'}`,
    '',
    'ANTI-ALIAS:',
    `ignored: ${pixelEntry?.ignoredAntiAliasPixels ?? '<not compared>'}`,
    '',
    'ROUNDING:',
    `ignored: ${pixelEntry?.ignoredRoundingPixels ?? '<not compared>'}`,
    '',
    'BLOCKING PIXELS:',
    `different: ${pixelEntry?.blockingDiffPixels ?? '<not compared>'}`,
    '',
    'artifacts:',
    `dom diff: ${join(artifactDir, 'dom-diff.json')}`,
    `pixel diff: ${pixelDiffPath}`,
  );
  return redactSecrets(lines.join('\n'));
}
