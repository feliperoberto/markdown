import { test, expect, ensureSidebarOpen } from './fixtures'

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
//
// The follow-up (the "..." trigger being permanently visible on every row,
// not just the previous swipe/hover bug) narrowed visibility further: the
// trigger itself is now hidden by default, shown only on the active row,
// on real-mouse hover, or while its own menu is open. This file runs
// under both the `chromium` and `mobile` (Pixel 5) Playwright projects
// (see playwright.config.ts) — the trigger-visibility assertions apply on
// both, since they're plain DOM/CSS; only the hover-reveal assertion is
// desktop-only, since the CSS rule is deliberately guarded to
// `(hover: hover) and (pointer: fine)` so a touch device's sticky emulated
// hover can never latch it open again.
test.describe('file row actions menu', () => {
  test('the "..." trigger is hidden by default, shown on the active row, and no click/hover latches actions open', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/app.html')

    // Scoped to the sidebar: once a file is open, its name also appears in
    // the main pane's breadcrumb (Breadcrumbs.tsx), and an unscoped
    // getByText would then match both and fail Playwright's strict mode.
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Row Actions ${Date.now()}`
    const fileName = 'row-actions-file'
    const otherFileName = 'row-actions-other-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    for (const name of [fileName, otherFileName]) {
      // Creating a file closes the mobile drawer (it becomes the active
      // file, and on a narrow viewport the drawer is an overlay covering
      // the editor) — reopen it before the next iteration's "..." click.
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(name)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(sidebar.getByText(name)).toBeVisible()
    }

    // otherFileName's creation closed the mobile drawer; reopen it before
    // the visibility assertions below.
    await ensureSidebarOpen(page)

    const trigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${fileName}`,
      exact: true,
    })
    const otherTrigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${otherFileName}`,
      exact: true,
    })

    // otherFileName was created last, so it's the active file by default
    // (issue: creating a file selects it) — its trigger is already
    // visible, and fileName's (not active) is not.
    await expect(trigger).toBeHidden()
    await expect(otherTrigger).toBeVisible()

    // Click the OTHER row to open it — the original reported bug: this
    // used to focus the row and leave rename/archive/delete permanently
    // visible. Opening it also makes IT the active file, swapping which
    // trigger is revealed.
    await sidebar.getByText(fileName, { exact: true }).click()
    await expect(trigger).toBeVisible()
    await expect(otherTrigger).toBeHidden()
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Excluir$/ })).toHaveCount(0)

    // Hovering the OTHER (non-active) row: on desktop, a real mouse hover
    // reveals its trigger; on touch, the hover rule is guarded out of the
    // media query entirely, so nothing reveals — regardless of any
    // sticky-hover quirk a real tap might otherwise trigger.
    await sidebar.getByText(otherFileName, { exact: true }).hover()
    if (isMobile) {
      await expect(otherTrigger).toBeHidden()
    } else {
      await expect(otherTrigger).toBeVisible()
    }
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toHaveCount(0)

    // The "..." trigger opens the menu, and stays visible itself while its
    // own menu is open even after the pointer moves elsewhere.
    await trigger.click()
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(trigger).toBeVisible()

    // Escape closes it and returns focus to the trigger.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  // Regression: `visibility: hidden` (used to hide the trigger on a
  // non-active row) also removes an element from the Tab order — a hidden
  // trigger can never itself receive focus, so rename/archive/delete/move
  // was unreachable by keyboard for every file that wasn't already active.
  // The fix reveals the trigger when the ROW ITSELF gets keyboard focus
  // (`.file-item:focus-visible`), which happens one Tab stop before the
  // trigger — so Tabbing onto a non-active row must reveal, and land
  // keyboard focus on, its own trigger.
  test('a non-active file\'s "..." trigger is reachable and focusable via Tab', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Tab-key navigation is a desktop keyboard scenario')
    await page.goto('/app.html')

    const sidebar = page.locator('#projectsSidebar')
    const projectName = `E2E Row Actions Keyboard ${Date.now()}`
    const fileName = 'row-actions-kbd-file'
    const otherFileName = 'row-actions-kbd-other-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    for (const name of [fileName, otherFileName]) {
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(name)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(sidebar.getByText(name)).toBeVisible()
    }
    await ensureSidebarOpen(page)

    // otherFileName was created last, so it's the active file — fileName
    // is not, and its trigger starts visually hidden.
    const trigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${fileName}`,
      exact: true,
    })
    await expect(trigger).toBeHidden()

    // DOM order within one row is row -> drag handle -> checkbox -> trigger
    // (the row `<div>` wraps all three; the handle is a real Tab stop of
    // its own — see the pick-mode reorder feature in dnd.ts/FileRow.tsx —
    // not just a pointer-only affordance). `.focus()` on the checkbox
    // doesn't itself trigger `:focus-visible` (it's a programmatic,
    // non-keyboard focus), but Shift+Tab from there is genuine keyboard
    // input, so the handle it lands on backing up onto IS `:focus-visible`
    // — exactly like a real keyboard user tabbing in from somewhere earlier
    // on the page.
    const rowCheckbox = page.getByRole('checkbox', {
      name: `Selecionar ${fileName} para download em lote`,
    })
    const row = sidebar.locator(
      `[data-dnd-file="${fileName}"][data-dnd-file-project="${projectName}"]`,
    )
    const handle = row.locator('[data-dnd-handle="file"]')
    await rowCheckbox.focus()
    await page.keyboard.press('Shift+Tab') // checkbox -> handle (backward)
    await expect(handle).toBeFocused()

    await page.keyboard.press('Shift+Tab') // handle -> row (backward)
    await expect(row).toBeFocused()
    // Wait for the CSS reveal to actually take effect before continuing
    // the Tab sequence — under load, a Tab dispatched the instant DOM
    // focus lands can outrace the browser's own style recalculation for
    // the `:focus-visible` rule that makes the trigger focusable at all,
    // making it invisible to the very next Tab's focus-order computation.
    await expect(row.locator('.file-menu-trigger')).toBeVisible()

    await page.keyboard.press('Tab') // row -> handle
    await page.keyboard.press('Tab') // handle -> checkbox
    await page.keyboard.press('Tab') // checkbox -> its own "..." trigger
    await expect(trigger).toBeFocused()
    await expect(trigger).toBeVisible()
  })

  // Half the original report was mobile: tapping a row used to reveal the
  // same stuck-open chips via a sticky emulated `:hover`. The assertion
  // above already proves the CSS rule can't latch regardless of input
  // method; this test additionally exercises the actual tap gesture
  // (rather than Playwright's mouse-driven `.click()`/`.hover()`), the one
  // thing desktop testing can't cover at all.
  test('tapping a row opens the file without revealing actions; the "..." trigger still works', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'covers real touch tap semantics — see the desktop assertion above')
    await page.goto('/app.html')

    // Scoped to the sidebar — see the test above for why.
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
    // Creating the file also selected it, which on this narrow viewport
    // closed the drawer (it's an overlay covering the editor) — reopen it
    // before interacting with the row again.
    await ensureSidebarOpen(page)
    await expect(sidebar.getByText(fileName)).toBeVisible()

    // Tapping the row opens the file (no swipe gesture exists anymore, and
    // none is needed) and, since it's already the active file, its own
    // trigger is already visible — but no actions menu.
    await sidebar.getByText(fileName, { exact: true }).tap()
    const trigger = page.getByRole('button', {
      name: `Mais opções do arquivo ${fileName}`,
      exact: true,
    })
    await expect(trigger).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toHaveCount(0)

    // The same "..." trigger used on desktop opens the menu on touch too —
    // the whole point of replacing the old two-mechanism (swipe + hover)
    // design with one.
    await trigger.tap()
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toBeVisible()

    // Tapping elsewhere dismisses it, same as a desktop outside click.
    // Targets the sidebar title specifically (no onClick of its own) rather
    // than the project name: that span sits inside .project-header, whose
    // onClick collapses the project — which would hide the menu via CSS
    // regardless of whether outside-click dismissal actually works,
    // letting this assertion pass even if that logic were broken.
    await page.locator('#sidebarTitle').tap()
    await expect(page.getByRole('menuitem', { name: /Renomear$/ })).toHaveCount(0)
  })
})
