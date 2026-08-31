import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyThemeOwner,
  resolveThemeOwner,
  THEME_OWNERS,
} from '../lib/themeOwnership';
import { applyCatalogTheme } from '../lib/tenantHead';

const adminTokens = readFileSync('src/styles/admin-tokens.css', 'utf8');
const catalogTokens = readFileSync('src/catalog-pro/tokens.css', 'utf8');
const mainSource = readFileSync('src/main.jsx', 'utf8');

describe('Phase 2B theme ownership', () => {
  beforeEach(() => {
    document.body.removeAttribute('data-ui-owner');
    document.body.removeAttribute('data-cp-theme');
    document.body.removeAttribute('class');
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
  });

  it('resolves platform, admin and tenant/catalog routes explicitly', () => {
    expect(resolveThemeOwner({ pathname: '/', hostname: 'divianco.app' }))
      .toBe(THEME_OWNERS.PLATFORM);
    expect(resolveThemeOwner({ pathname: '/registro', hostname: 'mala-miga.divianco.app' }))
      .toBe(THEME_OWNERS.PLATFORM);
    expect(resolveThemeOwner({ pathname: '/admin', hostname: 'mala-miga.divianco.app' }))
      .toBe(THEME_OWNERS.ADMIN);
    expect(resolveThemeOwner({ pathname: '/mp-callback', hostname: 'mala-miga.divianco.app' }))
      .toBe(THEME_OWNERS.ADMIN);
    expect(resolveThemeOwner({ pathname: '/', hostname: 'mala-miga.divianco.app' }))
      .toBe(THEME_OWNERS.CATALOG);
    expect(resolveThemeOwner({ pathname: '/info/envios', hostname: 'mitienda.com' }))
      .toBe(THEME_OWNERS.CATALOG);
  });

  it('removes cached catalog state when admin or platform owns the document', () => {
    document.body.setAttribute('data-cp-theme', 'noche');
    document.body.style.background = 'rgb(22, 20, 18)';
    document.documentElement.style.background = 'rgb(22, 20, 18)';

    applyThemeOwner(THEME_OWNERS.ADMIN);

    expect(document.body.getAttribute('data-ui-owner')).toBe('admin');
    expect(document.body.hasAttribute('data-cp-theme')).toBe(false);
    expect(document.body.style.background).toBe('');
    expect(document.documentElement.style.background).toBe('');
  });

  it('prevents catalog theme writes while admin owns the document', () => {
    applyThemeOwner(THEME_OWNERS.ADMIN);
    expect(applyCatalogTheme('noche')).toBe('noche');
    expect(document.body.hasAttribute('data-cp-theme')).toBe(false);
  });

  it('allows catalog themes only inside catalog ownership', () => {
    applyThemeOwner(THEME_OWNERS.CATALOG);
    expect(applyCatalogTheme('carbon')).toBe('carbon');
    expect(document.body.getAttribute('data-cp-theme')).toBe('carbon');
  });

  it('keeps Admin light/dark class changes independent from catalog state', () => {
    applyThemeOwner(THEME_OWNERS.CATALOG);
    applyCatalogTheme('noche');
    const admin = document.createElement('div');
    admin.className = 'ag-root ag-theme-light';
    admin.className = 'ag-root ag-theme-dark';
    expect(document.body.getAttribute('data-ui-owner')).toBe('catalog');
    expect(document.body.getAttribute('data-cp-theme')).toBe('noche');
  });

  it('scopes Admin and catalog token authorities and removes global boot loading', () => {
    expect(adminTokens).not.toMatch(/(^|\n)\s*:root\s*\{/);
    expect(adminTokens).toMatch(/(^|\n)\.ag-root\s*\{/);
    expect(catalogTokens).toContain('body[data-ui-owner="catalog"][data-cp-theme="noche"]');
    expect(mainSource).not.toContain('fetchActiveTheme');
    expect(mainSource).not.toContain('applyTheme');
  });
});
