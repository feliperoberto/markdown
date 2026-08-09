import { test as base, expect, type Page } from '@playwright/test'

/**
 * Shared e2e fixture (issue #33).
 *
 * Drive sync is deliberately NOT exercised end-to-end against real Google
 * infra here — that would require a live OAuth popup/consent flow, which
 * has no place in a headless CI run and would hang indefinitely waiting on
 * user interaction. Every test in this suite routes Google's Identity
 * Services script + OAuth/Drive API origins to an immediate abort, so if a
 * test path ever accidentally triggers `loadGoogleIdentity()` it fails
 * fast/loud instead of hanging the run.
 *
 * The first-run splash screen is also pre-dismissed: these "golden path"
 * suites exercise the app's actual feature behavior (editing, import/
 * export, offline), not the splash itself (covered by its own unit tests
 * in src/features/onboarding), and the splash is a full-screen overlay
 * that blocks every other interaction until dismissed.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https:\/\/accounts\.google\.com\//, (route) => route.abort())
    await page.route(/^https:\/\/www\.googleapis\.com\//, (route) => route.abort())
    await page.addInitScript(() => {
      localStorage.setItem('splashDismissed', 'true')
    })
    await use(page)
  },
})

export { expect }

/**
 * Creating a file closes the mobile drawer (app.tsx's `handleCreateFile`)
 * so the newly-active file, now selected by default, is actually visible
 * instead of sitting behind the sidebar overlay — see the mobile media
 * query in global.css. On viewports where that applies, a spec creating
 * more than one file (or interacting with the sidebar again after a
 * create) needs to reopen the drawer first; on wider viewports the
 * sidebar was never an overlay and this is a no-op (already open).
 */
export async function ensureSidebarOpen(page: Page): Promise<void> {
  const menuButton = page.getByRole('button', { name: 'Abrir menu de projetos' })
  if ((await menuButton.getAttribute('aria-expanded')) === 'false') {
    await menuButton.click()
  }
}
