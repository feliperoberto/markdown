import { copyFileSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// Short commit sha for the running build (ADR-0003: shown next to the app
// version so a bug report can cite exactly what's deployed). GITHUB_SHA is
// always set on a workflow run — `actions/checkout@v4`'s default
// `fetch-depth: 1` still checks out that exact commit, it just omits
// history, so no workflow change is needed to read it. Falls back to a
// local `git` call for `npm run dev`/`build` outside CI, and to a literal
// 'local' if git itself is unavailable (e.g. a tarball checkout).
function shortSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

// GitHub Pages requires index.html to serve the domain root ("/"), but
// Vite's build entry is app.html (see `build.rollupOptions.input` below),
// so the build never emits one on its own. This used to be patched after
// the fact in `.github/workflows/deploy.yml` (`cp dist/app.html
// dist/index.html`) — which ran *after* Vite finished, so the copied file
// never existed when vite-plugin-pwa globbed `dist/` for its Workbox
// precache manifest. In practice that meant "/" was reachable offline only
// through `navigateFallback`, on a repeat visit, never listed in the
// precache manifest itself.
//
// Emitting it here instead, inside the build, means Workbox sees the file:
// `writeBundle` runs once Vite has written `app.html` to disk, and Rollup
// runs every plugin's `writeBundle` hook before any plugin's `closeBundle`
// hook (where vite-plugin-pwa's `generateSW` strategy globs the output
// directory) — so this ordering is guaranteed by Rollup's build lifecycle,
// not by this plugin's position in the `plugins` array.
function emitRootIndexHtml(): Plugin {
  return {
    name: 'markdown:emit-root-index-html',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir ?? 'dist'
      copyFileSync(join(dir, 'app.html'), join(dir, 'index.html'))
    },
  }
}

// GitHub Pages serves this project from a custom domain (see CNAME),
// so assets are resolved from the domain root rather than a repo subpath.
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${shortSha()}`),
  },
  plugins: [
    preact(),
    emitRootIndexHtml(),
    VitePWA({
      // Real precaching via Workbox, generated from Vite's build manifest
      // (issue #24) — replaces the old inlined no-op "service worker" that
      // only did skipWaiting/clients.claim with no actual caching.
      strategies: 'generateSW',
      // 'prompt', not 'autoUpdate' (ADR-0003): autoUpdate makes the plugin
      // force workbox.skipWaiting/clientsClaim, so a newly-deployed worker
      // seizes every open tab immediately — while that tab is still
      // running the OLD JS bundle its now-purged precache no longer
      // backs, and silently drops the Google Drive access token, which is
      // held in memory only (docs/data-and-privacy.md). 'prompt' leaves
      // the new worker waiting until src/lib/pwa-register.ts explicitly
      // promotes it, from a user click.
      registerType: 'prompt',
      // Pinned to `null`, not the default `'auto'`. `'auto'` injects an
      // external registerSW.js UNLESS it detects a `virtual:pwa-register`
      // import during the build — src/lib/pwa-register.ts provides that
      // import, so in practice `'auto'` and `null` behave the same today.
      // `null` is chosen anyway because it can't silently degrade to
      // `'script'` if that detection ever fails to fire (a future refactor
      // that moves the import behind a lazy boundary, a plugin-ordering
      // change) — that failure mode would double-register the service
      // worker with two different option sets, one of which reloads
      // unprompted, defeating this entire feature. See the CSP comment in
      // app.html for why an injected script was never required for CSP
      // reasons even under 'auto'.
      injectRegister: null,
      // The web app manifest (icons, name, theme) is owned by issue #23;
      // this plugin is scoped to the service worker / caching strategy
      // only, so we don't generate a competing manifest.webmanifest here.
      manifest: false,
      workbox: {
        // Precache everything Vite emits for the app shell (HTML, JS, CSS,
        // and any other built assets) so the core editing flow — open app,
        // edit, save to localStorage — works fully offline with no network
        // calls at all.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,json}'],
        navigateFallback: '/app.html',
        // Explicit, matching 'prompt' above (ADR-0003):
        // - skipWaiting: false — a newly installed worker waits rather
        //   than taking over a tab still running the old bundle.
        // - clientsClaim: true — has no effect on an *update* (the new
        //   worker never reaches `activate` until the user accepts the
        //   prompt, so there's nothing to claim), but on a *first-ever*
        //   install there is no existing controller for it to steal from,
        //   so claiming immediately means a brand-new visitor is
        //   offline-ready after one page load instead of two.
        skipWaiting: false,
        clientsClaim: true,
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
