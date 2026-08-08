import { devices } from '@playwright/test'
import { test, expect } from './fixtures'

// Regression coverage for the file row actions being permanently visible
// (issue: the swipe/hover-revealed rename/archive/delete chips relied on a
// row-level `:focus-within` — so opening a file, which focuses the row,
// latched them open — and an unguarded `:hover` rule that stuck on touch
// devices via their sticky emulated hover). The fix replaces the whole
// reveal mechanism with the same deliberate "..." menu project rows
// already use: one interaction, identical on desktop and touch, and the
// menu is conditionally MOUNTED rather than CSS-parked off-canvas — the
// old chips had a non-empty, merely-clipped bounding box that
// `toBeVisible()` couldn't tell apart from "shown", so this bug could not
// have been caught by that assertion; a plain menuitem count is a real one.
test.describe('file row actions menu', () => {
  test('opening or hovering a file reveals no actions; the "..." menu opens them deliberately', async ({
    page,
  }) => {
    await page.goto('/app.html')

    // Scoped to the sidebar: once a file is open, its name also appears in
    // the main pane's breadcrumb (Breadcrumbs.tsx), and an unscoped
    // getByText would then match both and fail Playwright's strict mode.
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Row Actions ${Date.now()}`
    const fileName = 'row-actions-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(fileName)).toBeVisible()

    // Click the row to open the file — the reported bug: this used to
    // focus the row and leave rename/archive/delete permanently visible.
    await sidebar.getByText(fileName, { exact: true }).click()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Excluir arquivo/ })).toHaveCount(0)

    // Hovering the row reveals nothing either — the old desktop
    // hover-to-reveal rule is gone along with the swipe path it stood in for.
    await sidebar.getByText(fileName, { exact: true }).hover()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toHaveCount(0)

    // The "..." trigger opens the menu; Escape closes it and returns focus.
    const trigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${fileName}`,
      exact: true,
    })
    await trigger.click()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})

// Half the original report was mobile: tapping a row used to reveal the
// same stuck-open chips via a sticky emulated `:hover`. Desktop testing
// can't exercise that path at all, so this runs under real touch/mobile
// emulation rather than a mouse-driven `.hover()`/`.click()`.
test.describe('file row actions menu (touch)', () => {
  // Listed explicitly rather than `...devices['Pixel 5']`: that preset also
  // carries `defaultBrowserType`, and switching browser type is only legal
  // at the top level/in config (it forces a new worker) — not inside a
  // describe block. This suite's one configured project is already
  // Chromium, which is what Pixel 5's own `defaultBrowserType` would have
  // picked anyway, so nothing is lost by leaving it out.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, screen } = devices['Pixel 5']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, screen })

  test('tapping a row opens the file without revealing actions; the "..." trigger still works', async ({
    page,
  }) => {
    await page.goto('/app.html')

    // Scoped to the sidebar — see the desktop test above for why.
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Row Actions Touch ${Date.now()}`
    const fileName = 'row-actions-touch-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(fileName)).toBeVisible()

    // Tapping the row opens the file (no swipe gesture exists anymore, and
    // none is needed) with no actions revealed.
    await sidebar.getByText(fileName, { exact: true }).tap()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toHaveCount(0)

    // The same "..." trigger used on desktop opens the menu on touch too —
    // the whole point of replacing the old two-mechanism (swipe + hover)
    // design with one.
    const trigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${fileName}`,
      exact: true,
    })
    await trigger.tap()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toBeVisible()

    // Tapping elsewhere dismisses it, same as a desktop outside click.
    // Targets the sidebar title specifically (no onClick of its own) rather
    // than the project name: that span sits inside .project-header, whose
    // onClick collapses the project — which would hide the menu via CSS
    // regardless of whether outside-click dismissal actually works,
    // letting this assertion pass even if that logic were broken.
    await page.locator('#sidebarTitle').tap()
    await expect(page.getByRole('menuitem', { name: /Renomear arquivo/ })).toHaveCount(0)
  })
})
