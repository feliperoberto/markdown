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
      // Scope the coverage gate to `src/lib/` for now (issue #31): this is
      // the highest-value, dependency-light code (markdown render/sanitize
      // pipeline, storage schema versioning). Project-wide coverage,
      // including components/UI, is out of scope here (see issue #32).
      include: ['src/lib/**/*.{ts,tsx}'],
      // useOnlineStatus.ts: a thin browser-API hook, same reasoning as
      // pwa-register.ts below.
      // pwa-register.ts: imports the build-time `virtual:pwa-register`
      // module (ADR-0003), which only exists under the real Vite/PWA
      // build — this config deliberately doesn't load VitePWA (see the
      // header comment above), so this file can't be transformed here at
      // all, let alone covered. Its logic is a straight adapter with no
      // branches; useServiceWorkerUpdate.test.ts covers the actual
      // decision-making that consumes it via an injected fake.
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
