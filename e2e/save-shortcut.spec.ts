import { test, expect } from './fixtures'

// Ctrl+S/Cmd+S (useSaveShortcut, wired in src/app/app.tsx) syncs with
// Google Drive — it does not need a live OAuth flow to be worth covering
// end-to-end: with no Client ID configured yet, pressing it should open the
// Drive config panel instead of silently doing nothing, proving the
// keystroke reached the app and was routed correctly. The real
// authenticated sync path can't run here — this suite's fixture aborts all
// requests to accounts.google.com/www.googleapis.com by design (see
// fixtures.ts) — so that path stays covered by the Vitest component/unit
// tests instead.
test.describe('Ctrl+S/Cmd+S sync shortcut', () => {
  test('opens the Drive config panel when Drive is not configured yet', async ({ page }) => {
    await page.goto('/app.html')

    // Auto-waits for the header (and therefore useSaveShortcut's effect,
    // which attaches its document keydown listener on mount) to have
    // actually rendered before dispatching the shortcut. `toBeHidden()` on
    // `#drive-client-id` alone provides no such synchronization — that
    // locator resolves instantly whether or not the element will ever
    // exist, since the Modal doesn't render it into the DOM at all until
    // opened, so it can't be used to wait for app readiness.
    await expect(page.getByRole('button', { name: 'Sincronização com Google Drive' })).toBeVisible()

    const clientIdInput = page.locator('#drive-client-id')
    await expect(clientIdInput).toBeHidden()

    await page.keyboard.press('ControlOrMeta+S')

    await expect(clientIdInput).toBeVisible()
  })
})
