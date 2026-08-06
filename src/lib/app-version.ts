/**
 * Build identity: `package.json` version + short commit sha, injected by
 * Vite's `define` (see vite.config.ts). Shown in the Drive/Config modal so
 * a bug report can cite exactly what's deployed (ADR-0003).
 *
 * `vitest.config.ts` is a separate config with no `define` (see its header
 * comment), so a bare `__APP_VERSION__` reference would throw
 * `ReferenceError` in every test that renders the config modal — the
 * `typeof` guard below avoids that. In a real Vite build this is
 * constant-folded away at compile time and costs nothing.
 */
export const appVersion: string = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__
