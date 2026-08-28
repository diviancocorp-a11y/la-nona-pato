import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(resolve('src/styles/hermes-tokens.css'), 'utf8');
const indexCss = readFileSync(resolve('src/index.css'), 'utf8');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenValue(source, name) {
  const match = source.match(new RegExp(`${escapeRegex(name)}\\s*:\\s*([^;]+);`));
  return match?.[1].trim();
}

function themeBlock(source) {
  const start = source.indexOf('@theme');
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

describe('DICO design system token contract', () => {
  it('declares the required foundation layers', () => {
    const required = [
      '--ds-color-brand-gold-500',
      '--ds-color-intelligence-volt',
      '--ds-color-status-success',
      '--ds-color-status-warning',
      '--ds-color-status-error',
      '--ds-color-status-info',
      '--ds-font-ui',
      '--ds-font-soul',
      '--ds-font-technical',
      '--ds-space-1',
      '--ds-space-8',
      '--ds-radius-1',
      '--ds-radius-4',
      '--ds-control-height-compact',
      '--ds-control-height-default',
      '--ds-control-height-touch',
      '--ds-motion-fast',
      '--ds-motion-standard',
      '--ds-motion-character',
      '--ds-color-focus-ring',
    ];

    for (const token of required) {
      expect(tokenValue(tokensCss, token), `${token} must exist`).toBeTruthy();
    }
  });

  it('keeps brand, intelligence and feedback colors semantically distinct', () => {
    expect(tokenValue(tokensCss, '--ds-color-brand-gold-500')).toBe('#e0ac3c');
    expect(tokenValue(tokensCss, '--ds-color-status-warning')).toBe('#f0803c');
    expect(tokenValue(tokensCss, '--ds-color-brand-gold-500'))
      .not.toBe(tokenValue(tokensCss, '--ds-color-status-warning'));
    expect(tokenValue(tokensCss, '--ds-color-intelligence-volt')).toBe('#3d6bff');
    expect(tokenValue(tokensCss, '--ds-color-status-info')).toBe('#3f8bd6');
    expect(tokenValue(tokensCss, '--ds-color-intelligence-volt'))
      .not.toBe(tokenValue(tokensCss, '--ds-color-status-info'));
  });

  it('keeps every Hermes token as a ds-backed compatibility alias', () => {
    const aliases = [
      '--hg-font-heading', '--hg-font-body', '--hg-font-mono',
      '--hg-s1', '--hg-s2', '--hg-s3', '--hg-s4', '--hg-s5', '--hg-s6', '--hg-s7', '--hg-s8',
      '--hg-rs', '--hg-r', '--hg-rl',
      '--hg-sh-sm', '--hg-sh-md', '--hg-sh-lg',
      '--hg-ease', '--hg-t-fast', '--hg-t-med', '--hg-t-slow',
      '--hg-ok', '--hg-warn', '--hg-err',
    ];

    for (const alias of aliases) {
      expect(tokenValue(tokensCss, alias), `${alias} must remain`).toMatch(/^var\(--ds-/);
    }
  });

  it('keeps the legacy component contracts during Phase 1', () => {
    for (const selector of ['.hg-display', '.hg-btn', '.hg-input', '.hg-prod-card']) {
      expect(tokensCss).toContain(selector);
    }
  });

  it('makes Tailwind theme a ds-only bridge with no raw values', () => {
    const block = themeBlock(indexCss);
    const declarations = [...block.matchAll(/--[\w-]+\s*:\s*([^;]+);/g)];

    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      expect(declaration[1].trim()).toMatch(/^var\(--ds-/);
    }
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(block).not.toMatch(/rgba?\(/i);
  });

  it('preserves every previous Tailwind bridge value for pixel parity', () => {
    const previousValues = {
      '--ds-compat-tailwind-font-sans': "'DM Sans', sans-serif",
      '--ds-compat-tailwind-font-serif': "'DM Serif Display', serif",
      '--ds-compat-tailwind-bg': '#fbf7f2',
      '--ds-compat-tailwind-bg-2': '#f3ede4',
      '--ds-compat-tailwind-bg-3': '#ffffff',
      '--ds-compat-tailwind-text': '#2d1b0e',
      '--ds-compat-tailwind-text-2': '#6b5744',
      '--ds-compat-tailwind-text-3': '#9c8b7a',
      '--ds-compat-tailwind-accent': '#c45d3e',
      '--ds-compat-tailwind-accent-light': '#fff0eb',
      '--ds-compat-tailwind-success': '#3a7d44',
      '--ds-compat-tailwind-success-light': '#e8f5e9',
      '--ds-compat-tailwind-warning': '#d4a017',
      '--ds-compat-tailwind-warning-light': '#fff8e1',
      '--ds-compat-tailwind-error': '#c62828',
      '--ds-compat-tailwind-error-light': '#ffebee',
      '--ds-compat-tailwind-info': '#1565c0',
      '--ds-compat-tailwind-info-light': '#e3f2fd',
      '--ds-compat-tailwind-radius-base': '16px',
      '--ds-compat-tailwind-radius-sm': '10px',
      '--ds-compat-tailwind-radius-lg': '24px',
      '--ds-compat-tailwind-shadow-card': '0 2px 12px rgba(45, 27, 14, 0.08)',
      '--ds-compat-tailwind-shadow-elevated': '0 8px 24px rgba(45, 27, 14, 0.12)',
      '--ds-compat-tailwind-shadow-accent': '0 4px 15px rgba(196, 93, 62, 0.3)',
    };

    for (const [token, value] of Object.entries(previousValues)) {
      expect(tokenValue(tokensCss, token), `${token} changed pixels`).toBe(value);
    }
  });

  it('routes global focus through the semantic contract', () => {
    expect(indexCss)
      .toContain('outline: 2px solid var(--ac, var(--ds-color-focus-ring));');
    expect(tokenValue(tokensCss, '--ds-color-focus-ring'))
      .toBe('var(--ds-compat-tailwind-accent)');
  });
});
