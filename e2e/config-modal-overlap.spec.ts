import { test, expect } from './fixtures'

// Regression test for the left-menu/config-modal z-index collision: the
// sidebar and the Modal overlay both used `z-index: 100`, so on narrow
// viewports (where the sidebar becomes an overlay drawer) the sidebar
// could paint above the config modal and swallow every click/tap meant
// for it. Runs at a mobile viewport, where the drawer overlay actually
// engages, and asserts the modal is genuinely interactable (a real click
// on its input/button), not merely `visible` — jsdom-based component
// tests can't catch this because jsdom never computes stacking contexts.
test.describe('config modal vs left menu overlap', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('config modal stays interactable while the left menu is open', async ({ page }) => {
    await page.goto('/app.html')

    const sidebar = page.locator('#projectsSidebar')
    await expect(sidebar).toBeVisible()

    await page.getByRole('button', { name: 'Abrir configurações' }).click()

    const clientIdInput = page.locator('#drive-client-id')
    await expect(clientIdInput).toBeVisible()

    // A real click through Playwright fails if another element (e.g. the
    // sidebar sitting on top) intercepts the pointer at this location —
    // exactly the failure mode this test guards against.
    await clientIdInput.click()
    await clientIdInput.fill('test-client-id.apps.googleusercontent.com')
    await page.getByRole('button', { name: 'Salvar Client ID' }).click()

    await expect(page.getByText('✅ Configurado')).toBeVisible()
  })
})
