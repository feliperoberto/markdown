import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
// Note: kept as the site root (no /app.html suffix) so relative
// `page.goto('/app.html')` calls in tests resolve predictably — a leading
// `/` in `goto()` replaces the base URL's path entirely, so baseURL can't
// itself point at /app.html without every test's `goto('/')` silently
// missing it.
const BASE_URL = `http://localhost:${PORT}/`

// E2e coverage for the golden paths a real user takes daily (issue #33):
// create project/file + edit + preview, export/import a ZIP, and the
// offline editing scenario. Runs against the production Vite build served
// by `vite preview`, never the dev server, so it exercises the same
// artifact that ships (service worker included).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI-friendly, non-interactive reporter — never a browser-opening HTML
  // report host that would hang a headless CI job waiting on a viewer.
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Headless in every environment (local + CI). Never hardcode
    // `headless: false` here — that would break CI, which has no display.
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: `${BASE_URL}app.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
