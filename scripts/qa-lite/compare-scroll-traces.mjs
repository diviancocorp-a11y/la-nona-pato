import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffValues } from './compare-artifacts.mjs';
import { redactSecrets } from '../../platform/qa-lite/lib.mjs';

export function compareScrollTraces(artifactDir) {
  const baseDir = join(artifactDir, 'base', 'scroll');
  const candidateDir = join(artifactDir, 'candidate', 'scroll');
  const files = Array.from(new Set([
    ...(existsSync(baseDir) ? readdirSync(baseDir) : []),
    ...(existsSync(candidateDir) ? readdirSync(candidateDir) : []),
  ])).filter((file) => file.endsWith('.json')).sort();
  const comparisons = [];
  let firstDivergence = null;
  for (const file of files) {
    const basePath = join(baseDir, file);
    const candidatePath = join(candidateDir, file);
    const base = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : [];
    const candidate = existsSync(candidatePath) ? JSON.parse(readFileSync(candidatePath, 'utf8')) : [];
    const checkpoints = [];
    for (let index = 0; index < Math.max(base.length, candidate.length); index += 1) {
      const differences = diffValues(base[index], candidate[index]);
      const comparison = {
        checkpoint: base[index]?.checkpoint || candidate[index]?.checkpoint || `<missing-${index}>`,
        equal: differences.length === 0,
        differences,
        base: base[index] ?? null,
        candidate: candidate[index] ?? null,
      };
      checkpoints.push(comparison);
      if (!firstDivergence && !comparison.equal) firstDivergence = { file, ...comparison };
    }
    comparisons.push({ file, checkpoints });
  }
  const path = join(artifactDir, 'scroll-trace-diff.json');
  writeFileSync(path, JSON.stringify(comparisons, null, 2) + '\n', 'utf8');
  return { path, comparisons, firstDivergence };
}

export function formatFirstScrollDivergence(result) {
  if (!result.firstDivergence) return 'SCROLL TRACE: identical';
  const first = result.firstDivergence;
  return redactSecrets([
    'FIRST SCROLL CHECKPOINT DIVERGENCE',
    `trace: ${first.file}`,
    `checkpoint: ${first.checkpoint}`,
    `differences: ${JSON.stringify(first.differences, null, 2)}`,
    `base: ${JSON.stringify(first.base, null, 2)}`,
    `candidate: ${JSON.stringify(first.candidate, null, 2)}`,
    `artifact: ${result.path}`,
  ].join('\n'));
}
