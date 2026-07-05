// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// ESLint 9 flat config for a Vite + Preact + TypeScript app.
//
// Scope: only `src/` is linted. `prototype/` is the legacy single-file
// monolith kept for reference (see docs/adr for context) and is intentionally
// excluded rather than forced through strict linting, per issue #34.
//
// The initial rule set is deliberately lenient (several rules are "warn"
// rather than "error") so this config doesn't force a giant one-off cleanup
// PR across the already-merged codebase. `jsx-a11y` is the one exception:
// it stays meaningfully enforced because it reinforces the accessibility
// remediation work already done (issue #15) as an ongoing regression gate.
export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'prototype/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    rules: {
      // jsx-a11y: kept meaningfully enforced (errors), reinforcing the
      // accessibility remediation work already done in this codebase.
      ...jsxA11y.configs.recommended.rules,

      // react-hooks rules apply to Preact hooks too (same API); rules of
      // hooks violations are real bugs, exhaustive-deps starts as a warning
      // to avoid a big cleanup pass on existing code.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Lenient initial TypeScript rules to avoid a giant cleanup PR on the
      // existing, already-merged codebase. Tighten these incrementally.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      'jsx-a11y': {
        polymorphicPropName: 'as',
      },
    },
  },
  {
    // Config/build files run in Node, not the browser.
    files: ['*.config.{js,ts}', '.prettierrc.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
)
