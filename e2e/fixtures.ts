import { test as base, expect } from '@playwright/test'

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
