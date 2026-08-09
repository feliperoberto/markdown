import { test, expect, ensureSidebarOpen } from './fixtures'

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

    // Cycle down to "Mover para cima" — its exact position among the
    // conditionally-rendered items varies with feature flags (Upload,
    // export, archive), so search for it by pressing ArrowDown and
    // checking focus rather than a fixed press count.
    const moveUp = page.getByRole('menuitem', { name: /Mover para cima/ })
    for (let i = 0; i < 10; i++) {
      if (await moveUp.evaluate((el) => el === document.activeElement).catch(() => false)) break
      await page.keyboard.press('ArrowDown')
    }
    await expect(moveUp).toBeFocused()
    await page.keyboard.press('Enter')

    // 'c' moved up one visible slot: was last, now in the middle.
    await expect.poll(fileNamesInOrder).toEqual(['a', 'c', 'b'])

    // Activating a menu item (unlike Escape/Tab) doesn't itself return
    // focus to the trigger — only the two explicit close paths in
    // useDropdownMenu do — so re-open it directly rather than asserting
    // focus state here.
    await trigger.click()
    await page.getByRole('menuitem', { name: /Mover para baixo/ }).click()

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
    await expect(page.getByRole('menuitem', { name: /Mover para baixo/ })).toBeVisible()
    await page.keyboard.press('Escape')

    // Selecting 'first' above moved activity off 'last', so re-select it
    // to reveal its own trigger before opening its menu.
    const lastRow = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="last"]`)
    await lastRow.click()
    await page
      .getByRole('button', { name: 'Mais opções do arquivo last', exact: true })
      .click()
    await expect(page.getByRole('menuitem', { name: /Mover para baixo/ })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: /Mover para cima/ })).toBeVisible()
  })

  test('moves a file to another project via "Mover para <projeto>"', async ({ page }) => {
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const sourceProject = `E2E Menu Source ${Date.now()}`
    const targetProject = `E2E Menu Target ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(sourceProject)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page
      .getByRole('button', { name: `Mais opções do projeto ${sourceProject}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill('movable')
    await page.getByRole('button', { name: 'Criar', exact: true }).click()

    await ensureSidebarOpen(page)
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(targetProject)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(targetProject)).toBeVisible()

    // 'movable' is still the active file (creating the target project
    // doesn't change selection) — its trigger stays visible.
    await page
      .getByRole('button', { name: 'Mais opções do arquivo movable', exact: true })
      .click()
    await page.getByRole('menuitem', { name: `📁 Mover para "${targetProject}"` }).click()

    await expect(page.locator(`[data-dnd-group="${sourceProject}"] .file-name`)).toHaveCount(0)
    await expect(page.locator(`[data-dnd-group="${targetProject}"] .file-name`)).toHaveText([
      'movable',
    ])
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

    // Move 'second' up, past 'first'.
    await page
      .getByRole('button', { name: `Mais opções do projeto ${second}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Mover projeto para cima/ }).click()

    await expect.poll(relativeOrder).toBeLessThan(0)
  })
})
