import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// Separate from `vite.config.ts` (rather than merging test config into it)
// because the app's Vite config is wired to the PWA build (custom
// `rollupOptions.input` pointing at `app.html`, `VitePWA`'s `generateSW`
// strategy, etc.) — none of which Vitest needs or should run through.
// Sharing only what test runs actually require (the Preact plugin, for JSX,
// and the `@/*` path aliases) keeps `npm test` fast and avoids accidentally
// depending on PWA/service-worker build output in unit tests.
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@/app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      '@/styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scoped to `src/lib/` (issue #31: the highest-value, dependency-
      // light code — markdown render/sanitize pipeline, storage schema
      // versioning) plus `src/features/projects/` — the projects sidebar's
      // file-management surface, brought under the gate alongside the
      // mobile drag & drop / tombstone-sync work that touched it (a
      // regression-analysis finding: this whole directory was previously
      // outside the gate, so an untested file there cost nothing, which is
      // exactly the gap that let drag & drop's mobile handlers and the
      // rename/sync duplicate bug both ship uncaught). Project-wide
      // coverage beyond these two directories is still out of scope (see
      // issue #32).
      include: ['src/lib/**/*.{ts,tsx}', 'src/features/projects/**/*.{ts,tsx}'],
      // useOnlineStatus.ts: a thin browser-API hook, same reasoning as
      // pwa-register.ts below.
      // pwa-register.ts: imports the build-time `virtual:pwa-register`
      // module (ADR-0003), which only exists under the real Vite/PWA
      // build — this config deliberately doesn't load VitePWA (see the
      // header comment above), so this file can't be transformed here at
      // all, let alone covered. Its own branching is minimal (register,
      // adapt callbacks, orchestrate a reload); the two pieces of real
      // logic it depends on — the actual reload/re-check decisions, and
      // the wait-for-event-or-timeout primitive it uses — are extracted
      // into useServiceWorkerUpdate.ts and waitForEvent.ts respectively,
      // both fully covered.
      exclude: ['src/lib/useOnlineStatus.ts', 'src/lib/pwa-register.ts'],
      thresholds: {
        lines: 70,
        statements: 70,
        branches: 70,
        functions: 70,
      },
    },
  },
})
