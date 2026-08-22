import { test, expect, ensureSidebarOpen, focusMenuItemViaArrowDown } from './fixtures'

// Keyboard/non-drag coverage for the "Mover" menu items (issue: mobile
// DnD's Pointer Events rewrite still needs a non-drag alternative — WCAG
// 2.1 SC 2.5.7 requires one for any dragging interaction, and SC 2.1.1
// requires a keyboard path; the sidebar had neither before this). These
// items terminate in the exact same onMoveFile/onMoveProject calls the
// pointer drag does (see src/features/projects/dnd.ts's applyDropIntent),
// so this is a second affordance over shared semantics, not a second
// implementation.
//
// Creating a file selects it (issue #3) and, on a narrow viewport, closes
// the drawer — every file creation below is followed by
// `ensureSidebarOpen` before the next sidebar interaction, same as the
// other reorder specs.
test.describe('sidebar reorder ("Mover" menu items)', () => {
  test('moves a file up/down within its project via the "..." menu, driven entirely by keyboard', async ({
    page,
  }) => {
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Menu Move ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()

    for (const fileName of ['a', 'b', 'c']) {
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(fileName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
    }
    await ensureSidebarOpen(page)
    await expect(sidebar.getByText('c', { exact: true })).toBeVisible()

    const group = page.locator(`[data-dnd-group="${projectName}"]`)
    const fileNamesInOrder = () => group.locator('.file-name').allTextContents()
    await expect.poll(fileNamesInOrder).toEqual(['a', 'b', 'c'])

    // 'c' is the active file (just created), so its "..." trigger is
    // already visible — open it, then reach "Mover para cima" purely by
    // keyboard: Enter opens the menu, ArrowDown cycles to the item, Enter
    // activates it.
    const trigger = page.getByRole('button', { name: `Mais opções do arquivo c`, exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Renomear' })).toBeVisible()

    // "Mover" items are clip-hidden (1x1px, clipped) until focused (menu
    // declutter: reorder is primarily the drag handle for mouse users) —
    // present in the DOM and the a11y tree the whole time. Checked via the
    // actual rendered footprint rather than `toBeVisible()`: Playwright's
    // visible check only requires a non-empty bounding box, so it would
    // (wrongly, for this purpose) call a 1x1px clipped element visible.
    const moveUp = page.getByRole('menuitem', { name: /Mover para cima/ })
    await expect(moveUp).toHaveCount(1)
    await expect(await moveUp.boundingBox()).toMatchObject({ width: 1, height: 1 })

    // Cycle down to "Mover para cima" — its exact position among the
    // conditionally-rendered items varies with feature flags (Upload,
    // export, archive), so search for it by pressing ArrowDown and
    // checking focus rather than a fixed press count.
    await focusMenuItemViaArrowDown(page, moveUp)
    // Focus reveals it — the whole point of reveal-on-focus.
    await expect
      .poll(async () => (await moveUp.boundingBox())?.width)
      .toBeGreaterThan(1)
    await page.keyboard.press('Enter')

    // 'c' moved up one visible slot: was last, now in the middle.
    await expect.poll(fileNamesInOrder).toEqual(['a', 'c', 'b'])

    // Activating a menu item (unlike Escape/Tab) doesn't itself return
    // focus to the trigger — only the two explicit close paths in
    // useDropdownMenu do — so re-open it directly rather than asserting
    // focus state here.
    await trigger.click()

    // "Mover para baixo" is clip-hidden until focused, so a plain
    // `.click()` can't land on it (zero on-screen footprint) — reach it
    // the same ArrowDown-cycle-then-Enter way as "Mover para cima" above.
    const moveDown = page.getByRole('menuitem', { name: /Mover para baixo/ })
    await focusMenuItemViaArrowDown(page, moveDown)
    await page.keyboard.press('Enter')

    await expect.poll(fileNamesInOrder).toEqual(['a', 'b', 'c'])
  })

  test('"Mover para cima" is omitted for the first file and "para baixo" for the last', async ({
    page,
  }) => {
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Menu Ends ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()

    for (const fileName of ['first', 'last']) {
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(fileName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
    }
    await ensureSidebarOpen(page)
    await expect(sidebar.getByText('last', { exact: true })).toBeVisible()

    // 'first' is not active by default (only 'last', created last, is) —
    // select it so its trigger becomes visible (works identically on
    // desktop and touch, unlike hover-to-reveal, which is desktop-only).
    const firstRow = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="first"]`)
    await firstRow.click()
    await page
      .getByRole('button', { name: 'Mais opções do arquivo first', exact: true })
      .click()
    await expect(page.getByRole('menuitem', { name: /Mover para cima/ })).toHaveCount(0)
    // Presence, not visibility: "Mover" items are clip-hidden until
    // focused (menu declutter) — this is checking it's rendered at all
    // (the omitted-at-the-ends case), not whether it's currently visible.
    await expect(page.getByRole('menuitem', { name: /Mover para baixo/ })).toHaveCount(1)
    await page.keyboard.press('Escape')

    // Selecting 'first' above moved activity off 'last', so re-select it
    // to reveal its own trigger before opening its menu.
    const lastRow = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="last"]`)
    await lastRow.click()
    await page
      .getByRole('button', { name: 'Mais opções do arquivo last', exact: true })
      .click()
    await expect(page.getByRole('menuitem', { name: /Mover para baixo/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Mover para cima/ })).toHaveCount(1)
  })

  // Moving a file to a different project was removed (see CHANGELOG) — a
  // file's "..." menu no longer offers any "Mover para <projeto>" item,
  // regardless of how many other projects exist.
  test('never shows a "Mover para <projeto>" item on a file\'s menu', async ({ page }) => {
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const sourceProject = `E2E Menu Source ${Date.now()}`
    const otherProject = `E2E Menu Other ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(sourceProject)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page
      .getByRole('button', { name: `Mais opções do projeto ${sourceProject}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill('stays-put')
    await page.getByRole('button', { name: 'Criar', exact: true }).click()

    await ensureSidebarOpen(page)
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(otherProject)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(otherProject)).toBeVisible()

    // Creating `otherProject` selects IT (useProjects' createProject always
    // switches to the new, empty project — see its own comment), which
    // moved activity off 'stays-put' and hid its trigger. Re-select it,
    // same reasoning as the "omitted for the last" test above.
    await ensureSidebarOpen(page)
    await page
      .locator(`[data-dnd-file-project="${sourceProject}"][data-dnd-file="stays-put"]`)
      .click()
    await page
      .getByRole('button', { name: 'Mais opções do arquivo stays-put', exact: true })
      .click()
    await expect(page.getByRole('menuitem', { name: /^📁 Mover para/ })).toHaveCount(0)
  })

  test('moves a project up/down via its own "..." menu', async ({ page }) => {
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const first = `E2E Menu Proj First ${Date.now()}`
    const second = `E2E Menu Proj Second ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(first)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(second)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(second)).toBeVisible()

    const projectNamesInOrder = () => sidebar.locator('.project-name').allTextContents()
    const relativeOrder = async () => {
      const names = await projectNamesInOrder()
      return names.indexOf(second) - names.indexOf(first)
    }
    await expect.poll(relativeOrder).toBeGreaterThan(0)

    // Move 'second' up, past 'first'. "Mover projeto para cima" is
    // clip-hidden until focused (menu declutter), so a plain `.click()`
    // can't land on it — reach it by keyboard, same ArrowDown-cycle-then-
    // Enter pattern as the file-level "Mover" items above.
    await page
      .getByRole('button', { name: `Mais opções do projeto ${second}`, exact: true })
      .click()
    const moveProjectUp = page.getByRole('menuitem', { name: /Mover projeto para cima/ })
    await focusMenuItemViaArrowDown(page, moveProjectUp)
    await page.keyboard.press('Enter')

    await expect.poll(relativeOrder).toBeLessThan(0)
  })
})
