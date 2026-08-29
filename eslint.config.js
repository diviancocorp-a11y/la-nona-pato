import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist', 'node_modules', 'playwright-report', 'test-results',
    // Worktrees de agentes: son copias COMPLETAS del repo en otro commit.
    // Sin esto, `eslint .` lintea codigo viejo con la config nueva y falla
    // localmente por reglas que ya no existen — mientras en CI pasa, porque
    // el checkout limpio no las tiene. Un lint que dice cosas distintas en
    // cada maquina deja de ser un gate.
    '.claude/worktrees',
    // TS files need @typescript-eslint/parser which we don't ship; skip them
    // from lint. They're still type-checked by tsc (typecheck job).
    '**/*.ts', '**/*.tsx',
  ]),

  // ── App source (browser) ────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, __CLIENT__: 'readonly', __BUILD_ID__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // The react-hooks v7 plugin flags many false positives in our codebase
      // (cascading-renders heuristic, memoization). They're legit refactor
      // hints but not CI-blockers — demote to warn.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      // Date.now() / Math.random() en useRef inicial son intencionales
      // (capturar timestamp / id estable de montaje). El patrón es OK.
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': 'warn',
      'no-constant-binary-expression': 'warn',
    },
  },

  // ── Unit tests (vitest + jsdom) ─────────────────────────
  {
    files: ['src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ── E2E tests (playwright + node) ───────────────────────
  {
    files: ['e2e/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // ── Build/config files (node) ───────────────────────────
  {
    files: ['*.config.{js,mjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ── Service Worker (workbox runtime globals) ────────────
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        importScripts: 'readonly',
        workbox: 'readonly',
        clients: 'readonly',
      },
    },
  },
])
