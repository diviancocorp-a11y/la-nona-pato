import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fontCss = readFileSync('src/styles/dico-fonts.css', 'utf8');
const tokensCss = readFileSync('src/styles/hermes-tokens.css', 'utf8');

const assets = {
  'public/fonts/dico/overused-grotesk/OverusedGrotesk-VF.woff2':
    '4797fa28e086b459306d9d7d6d41938ef76f0dd4e12b6a4e27bdd08e0aeec275',
  'public/fonts/dico/butler/Butler-Free-Rmn.woff2':
    'd9939c9c3d9ca53378e4a81d9549d875b1d152bf62ad4fd33d6102f16c1ebdaa',
  'public/fonts/dico/butler/Butler-Free-Med.woff2':
    '57af575be60c424796288508d08903c4879fd3412d3f039dba0e40ec2fe6c512',
};

describe('DICO self-hosted typography', () => {
  it('pins the approved families in the canonical tokens', () => {
    expect(tokensCss).toContain("--ds-font-ui: 'Overused Grotesk'");
    expect(tokensCss).toContain("--ds-font-soul: 'Butler'");
  });

  it('declares local WOFF2 sources and no remote font URL', () => {
    expect(fontCss).toContain("font-family: 'Overused Grotesk'");
    expect(fontCss).toContain('font-weight: 300 900');
    expect(fontCss).toContain("font-family: 'Butler'");
    expect(fontCss).toContain("format('woff2')");
    expect(fontCss).not.toMatch(/https?:\/\//);
  });

  it('keeps the audited font binaries byte-exact', () => {
    for (const [path, expected] of Object.entries(assets)) {
      const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(actual, path).toBe(expected);
    }
  });
});
