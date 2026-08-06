/**
 * Build identity, injected by Vite's `define` in `vite.config.ts`
 * (`package.json` version + a short commit sha). Read through
 * `src/lib/app-version.ts`, never this global directly — that wrapper
 * guards against the Vitest config (which has no `define`) leaving this
 * undefined. See ADR-0003.
 */
declare const __APP_VERSION__: string
