import test from 'node:test';
import assert from 'node:assert/strict';
import { navigateToAdminWithTheme } from '../admin-theme.mjs';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function fakePage() {
  const scripts = [];
  const local = storage();
  const session = storage();
  let navigations = 0;
  let storageAccessOnAboutBlank = false;

  return {
    page: {
      async addInitScript(script, argument) {
        scripts.push({ script, argument });
      },
      async goto(url) {
        assert.equal(url, '/admin');
        navigations += 1;
        const previousLocal = globalThis.localStorage;
        const previousSession = globalThis.sessionStorage;
        globalThis.localStorage = local;
        globalThis.sessionStorage = session;
        try {
          for (const entry of [...scripts].reverse()) entry.script(entry.argument);
        } finally {
          globalThis.localStorage = previousLocal;
          globalThis.sessionStorage = previousSession;
        }
      },
      async evaluate() {
        storageAccessOnAboutBlank = true;
        throw new Error('page.evaluate no debe usarse para inicializar el theme');
      },
    },
    local,
    get navigations() { return navigations; },
    get storageAccessOnAboutBlank() { return storageAccessOnAboutBlank; },
  };
}

test('Admin recibe light y dark antes de render sin tocar localStorage en about:blank', async () => {
  const harness = fakePage();

  await navigateToAdminWithTheme(harness.page, 'light');
  assert.equal(harness.local.getItem('ag-theme'), 'light');

  await navigateToAdminWithTheme(harness.page, 'dark');
  assert.equal(harness.local.getItem('ag-theme'), 'dark');
  assert.equal(harness.navigations, 2);
  assert.equal(harness.storageAccessOnAboutBlank, false);
});
