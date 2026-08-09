import type { Page } from '@playwright/test'
import { test, expect, ensureSidebarOpen } from './fixtures'

// Non-drag coverage for the sidebar's reorder handle (issue: mobile DnD's
// Pointer Events rewrite still needs a non-drag alternative — WCAG 2.1
// SC 2.5.7 requires one for any dragging interaction, and SC 2.1.1 requires
// a keyboard path). This used to live on two separate "Mover para cima/
// baixo" menu items; those are gone now — the same `⠿` handle that drags
// also supports a tap-to-pick + tap-to-drop gesture (a literal single-
// pointer, non-dragging method) and a keyboard grab + arrow-step path, both
// terminating in the exact same onMoveFile/onMoveProject calls the pointer
// drag does (see src/features/projects/dnd.ts's applyDropIntent/
// resolveTapOnHandle), so this is a second and third affordance over shared
// semantics, not a second implementation.
//
// Handles are located via the `data-dnd-handle` attribute rather than
// `getByRole('button', { name: ... })`: the row/header itself is also
// role="button", and its own accessible name is computed from its content
// (including the nested handle's aria-label), so a name-based query for the
// handle's "selecionado para mover" text ambiguously matches both.
//
// Creating a file selects it (issue #3) and, on a narrow viewport, closes
// the drawer — every test opens the drawer right after navigating, and
// every file creation is followed by `ensureSidebarOpen` before the next
// sidebar interaction, same as the other reorder specs.
test.describe('sidebar reorder (pick mode on the drag handle)', () => {
  function fileHandle(page: Page, projectName: string, fileName: string) {
    return page.locator(
      `[data-dnd-file-project="${projectName}"][data-dnd-file="${fileName}"] [data-dnd-handle="file"]`,
    )
  }

  function projectHandle(page: Page, projectName: string) {
    return page.locator(`[data-dnd-group="${projectName}"] [data-dnd-handle="project"]`)
  }

  function projectHeader(page: Page, projectName: string) {
    return page.locator(`[data-dnd-group="${projectName}"] .project-header`)
  }

  test('tap-to-pick + tap-to-drop moves a file within its project', async ({ page }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Pick Move ${Date.now()}`
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

    // A plain click/tap on 'c'\'s handle never crosses the drag-activation
    // threshold, so it picks it up instead of dragging.
    const handleC = fileHandle(page, projectName, 'c')
    await handleC.click()
    await expect(handleC).toHaveAttribute('aria-pressed', 'true')
    await expect(handleC).toHaveAccessibleName(/c selecionado para mover/)

    // Tapping 'a's row (not its handle) while something is picked commits
    // the move — 'c' lands right before 'a'.
    await page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="a"]`).click()
    await expect.poll(fileNamesInOrder).toEqual(['c', 'a', 'b'])
    // The pick clears once the move commits.
    await expect(handleC).toHaveAttribute('aria-pressed', 'false')
  })

  test('re-tapping the same handle cancels the pick', async ({ page }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)

    const handle = fileHandle(page, 'Meu Projeto', 'Sem título')
    await handle.click()
    await expect(handle).toHaveAttribute('aria-pressed', 'true')

    await handle.click()
    await expect(handle).toHaveAttribute('aria-pressed', 'false')
  })

  test('Escape cancels an active pick', async ({ page }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)

    const handle = fileHandle(page, 'Meu Projeto', 'Sem título')
    await handle.click()
    await expect(handle).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('Escape')
    await expect(handle).toHaveAttribute('aria-pressed', 'false')
  })

  test('moves a file up/down within its project, driven entirely by keyboard', async ({
    page,
  }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Keyboard Move ${Date.now()}`
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

    // Tab to 'c'\'s handle, Enter picks it up, Arrow Up steps it one slot
    // at a time — each press commits immediately (there is nothing
    // "pending" left to roll back with Escape).
    const handleC = fileHandle(page, projectName, 'c')
    await handleC.focus()
    await page.keyboard.press('Enter')
    await expect(handleC).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('ArrowUp')
    await expect.poll(fileNamesInOrder).toEqual(['a', 'c', 'b'])

    await page.keyboard.press('ArrowUp')
    await expect.poll(fileNamesInOrder).toEqual(['c', 'a', 'b'])

    // Already first: Arrow Up is a no-op.
    await page.keyboard.press('ArrowUp')
    await expect.poll(fileNamesInOrder).toEqual(['c', 'a', 'b'])

    // Space (not just Enter) drops it back out of pick mode.
    await page.keyboard.press('Space')
    await expect(handleC).toHaveAttribute('aria-pressed', 'false')
  })

  // Moving a file to a different project was removed (see CHANGELOG) —
  // activating a row in another project while a file is picked cancels the
  // pick instead of moving it there.
  test('activating a row in a different project cancels the pick without moving it there', async ({
    page,
  }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)
    const sidebar = page.locator('#projectsSidebar')

    const sourceProject = `E2E Pick Source ${Date.now()}`
    const otherProject = `E2E Pick Other ${Date.now()}`
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

    const handle = fileHandle(page, sourceProject, 'stays-put')
    await handle.click()
    await expect(handle).toHaveAttribute('aria-pressed', 'true')

    await projectHeader(page, otherProject).click()
    await expect(handle).toHaveAttribute('aria-pressed', 'false')
    await expect(
      page.locator(`[data-dnd-file-project="${sourceProject}"][data-dnd-file="stays-put"]`),
    ).toBeVisible()
  })

  test('moves a project up/down via its own handle', async ({ page }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)
    const sidebar = page.locator('#projectsSidebar')

    const first = `E2E Pick Proj First ${Date.now()}`
    const second = `E2E Pick Proj Second ${Date.now()}`
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

    // Tap 'second's handle to pick it, then tap 'first's header to commit
    // it right before 'first'.
    await projectHandle(page, second).click()
    await projectHeader(page, first).click()

    await expect.poll(relativeOrder).toBeLessThan(0)
  })

  test("an archived project's handle is not rendered", async ({ page }) => {
    await page.goto('/app.html')
    await ensureSidebarOpen(page)
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Pick Archived ${Date.now()}`
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Arquivar projeto/ }).click()
    await expect(sidebar.getByText(projectName)).toHaveCount(0)

    await page.getByRole('button', { name: /Mostrar arquivados/ }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()
    await expect(projectHandle(page, projectName)).toHaveCount(0)
  })
})
