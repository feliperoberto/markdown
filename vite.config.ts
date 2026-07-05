import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this project from a custom domain (see CNAME),
// so assets are resolved from the domain root rather than a repo subpath.
export default defineConfig({
  base: '/',
  plugins: [
    preact(),
    VitePWA({
      // Real precaching via Workbox, generated from Vite's build manifest
      // (issue #24) — replaces the old inlined no-op "service worker" that
      // only did skipWaiting/clients.claim with no actual caching.
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // The web app manifest (icons, name, theme) is owned by issue #23;
      // this plugin is scoped to the service worker / caching strategy
      // only, so we don't generate a competing manifest.webmanifest here.
      manifest: false,
      workbox: {
        // Precache everything Vite emits for the app shell (HTML, JS, CSS,
        // and any other built assets) so the core editing flow — open app,
        // edit, save to localStorage — works fully offline with no network
        // calls at all.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        navigateFallback: '/app.html',
        // No backend API to cache. Google's OAuth/Drive endpoints must
        // always hit the network and fail visibly when offline rather than
        // silently serving stale data, so they are intentionally NOT added
        // to runtimeCaching here.
        //
        // This app does not currently load Google Fonts (no
        // fonts.googleapis.com/fonts.gstatic.com <link> in app.html or
        // src/), so no cache-first runtimeCaching entry for them is
        // configured. Add one here if/when a Google Fonts link is
        // introduced.
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    open: '/app.html',
  },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./app.html', import.meta.url)),
    },
  },
  resolve: {
    alias: {
      '@/app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      '@/styles': fileURLToPath(new URL('./src/styles', import.meta.url)),
    },
  },
})
