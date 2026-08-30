import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { platform, release } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, FIXED_NOW, publicStatus } from '../../platform/qa-lite/lib.mjs';
import { PIXELMATCH_OPTIONS } from './compare-artifacts.mjs';

function packageVersion(path) {
  return JSON.parse(readFileSync(path, 'utf8')).version;
}

function chromiumRevision() {
  const browsers = JSON.parse(readFileSync(join(REPO_ROOT, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8'));
  const chromium = browsers.browsers.find((browser) => browser.name === 'chromium');
  return chromium ? { revision: chromium.revision, browserVersion: chromium.browserVersion } : null;
}

export function writeManifest({ artifactDir, base, candidate, status, migrations, dom, screenshots, network }) {
  const seed = readFileSync(join(REPO_ROOT, 'platform', 'qa-lite', 'seed.sql'));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    refs: { base: base.sha, candidate: candidate.sha },
    seed: { version: createHash('sha256').update(seed).digest('hex') },
    runtime: {
      node: process.version,
      os: `${platform()} ${release()}`,
      playwright: packageVersion(join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'package.json')),
      pixelmatch: {
        version: packageVersion(join(REPO_ROOT, 'node_modules', 'pixelmatch', 'package.json')),
        threshold: PIXELMATCH_OPTIONS.threshold,
        includeAA: PIXELMATCH_OPTIONS.includeAA,
      },
      chromium: chromiumRevision(),
      supabaseCli: packageVersion(join(REPO_ROOT, 'node_modules', 'supabase', 'package.json')),
      fixedNow: FIXED_NOW,
      supabase: publicStatus(status),
      previewUrls: { base: base.url, candidate: candidate.url },
      render: { browser: 'chromium', deviceScaleFactor: 1, locale: 'es-AR', timezone: 'America/Argentina/Buenos_Aires' },
    },
    migrations,
    network,
    gate: {
      dom,
      screenshots,
      domEqual: dom.length === 8 && dom.every((item) => item.equal),
      pixelsEqual: screenshots.length === 8 && screenshots.every((item) => item.equal),
      rawDiffPixels: screenshots.reduce((total, item) => (
        total + (Number.isInteger(item.rawDiffPixels) ? item.rawDiffPixels : 0)
      ), 0),
      ignoredAntiAliasPixels: screenshots.reduce((total, item) => (
        total + (Number.isInteger(item.ignoredAntiAliasPixels) ? item.ignoredAntiAliasPixels : 0)
      ), 0),
      ignoredRoundingPixels: screenshots.reduce((total, item) => (
        total + (Number.isInteger(item.ignoredRoundingPixels) ? item.ignoredRoundingPixels : 0)
      ), 0),
      blockingDiffPixels: screenshots.reduce((total, item) => (
        total + (Number.isInteger(item.blockingDiffPixels) ? item.blockingDiffPixels : 0)
      ), 0),
      noExternalTraffic: network.every((item) => item.blocked.length === 0),
      motionCanonicalization: {
        strategy: 'static-neutral-dico',
        selectors: [
          '.dico-piso',
          '.dico-boya',
          '.dico-bamboleo',
          '.dico-ojo',
          '.dico--entrada .dico-escena',
          '.dico--entrada .dico-cara',
          '.dico--entrada .dico-cuerpo-render',
        ],
      },
    },
  };
  writeFileSync(join(artifactDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}
