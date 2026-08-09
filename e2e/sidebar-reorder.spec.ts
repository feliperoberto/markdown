import type { Page } from '@playwright/test'
import { test, expect, ensureSidebarOpen } from './fixtures'

// Mouse-driven coverage for the Pointer Events drag & drop rewrite (issue:
// mobile DnD — HTML5 Drag-and-Drop, the previous implementation, never
// fires from a touch gesture, so reordering was desktop/mouse only). This
// spec proves the new pointer-based implementation still does everything
// the old one did on a real mouse; e2e/sidebar-reorder-touch.spec.ts proves
// the same code path also works from a real touch gesture, and
// e2e/sidebar-reorder-menu.spec.ts covers the non-drag "Mover" menu path.
//
// Skipped on the `mobile` project: a mouse-simulated drag under touch-
// device emulation (Pixel 5's `hasTouch: true`) doesn't behave reliably
// the same way a real mouse does on desktop, and sidebar-reorder-touch.
// spec.ts already covers the same code path with genuine touch-flavored
// pointer events.
//
// Drives real mouse events (page.mouse.move/down/up with intermediate
// steps) rather than Playwright's dragTo(), which is itself an HTML5-DnD
// helper and wouldn't exercise this pointer-based implementation at all.
//
// File/project names created here are scoped to their own group
// (`[data-dnd-group="<name>"] ...`) rather than queried sidebar-wide — the
// seeded first-run default project ("Meu Projeto" / "Sem título") is
// always present alongside whatever a test creates.
test.describe('sidebar reorder (mouse)', () => {
  async function createProject(page: Page, name: string) {
    await ensureSidebarOpen(page)
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(name)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
  }

  async function createFile(page: Page, projectName: string, fileName: string) {
    await ensureSidebarOpen(page)
    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
  }

  // Drags via the handle, not the row body — the row body is deliberately
  // NOT a drag source in this rewrite (only the grip is; see FileRow.tsx),
  // matching the desktop discoverability trade-off the plan called out.
  async function dragFileHandleTo(
    page: Page,
    fromProject: string,
    fromFile: string,
    target: { x: number; y: number },
  ) {
    const handle = page.locator(
      `[data-dnd-file-project="${fromProject}"][data-dnd-file="${fromFile}"] [data-dnd-handle="file"]`,
    )
    const box = await handle.boundingBox()
    if (!box) throw new Error(`handle for ${fromProject}/${fromFile} not found`)
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Intermediate steps: a single jump straight to the target wouldn't
    // cross the activation threshold as a distinct move event the way a
    // real drag does.
    await page.mouse.move(startX, startY + 10, { steps: 2 })
    await page.mouse.move(target.x, target.y, { steps: 5 })
    await page.mouse.up()
  }

  test('reorders a file within its project by dropping on another row, and it survives a reload', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'mouse-specific — see sidebar-reorder-touch.spec.ts')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Reorder ${Date.now()}`
    await createProject(page, projectName)
    for (const fileName of ['a', 'b', 'c']) {
      await createFile(page, projectName, fileName)
    }
    await expect(sidebar.getByText('c', { exact: true })).toBeVisible()

    const group = page.locator(`[data-dnd-group="${projectName}"]`)
    const fileNamesInOrder = () => group.locator('.file-name').allTextContents()
    await expect.poll(fileNamesInOrder).toEqual(['a', 'b', 'c'])

    // Drop 'c' onto 'a' — inserts before 'a'.
    const rowA = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="a"]`)
    const rowABox = await rowA.boundingBox()
    if (!rowABox) throw new Error('row a not found')
    await dragFileHandleTo(page, projectName, 'c', {
      x: rowABox.x + rowABox.width / 2,
      y: rowABox.y + rowABox.height / 2,
    })

    await expect.poll(fileNamesInOrder).toEqual(['c', 'a', 'b'])

    // Reload: proves the move reached persist(), not just the in-memory DOM.
    await page.reload()
    await expect(sidebar.getByText(projectName)).toBeVisible()
    await expect.poll(fileNamesInOrder).toEqual(['c', 'a', 'b'])
  })

  test('moves a file into another project by dropping on its group padding', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse-specific — see sidebar-reorder-touch.spec.ts')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const sourceProject = `E2E Source ${Date.now()}`
    const targetProject = `E2E Target ${Date.now()}`
    await createProject(page, sourceProject)
    await createFile(page, sourceProject, 'movable')
    await createProject(page, targetProject)
    await expect(sidebar.getByText(targetProject)).toBeVisible()

    // Drop onto the target group's own area, not one of its rows — an
    // empty project's group still measures a real rect (its own padding),
    // so drop near its header.
    const targetGroup = page.locator(`[data-dnd-group="${targetProject}"]`)
    const targetBox = await targetGroup.boundingBox()
    if (!targetBox) throw new Error('target group not found')
    await dragFileHandleTo(page, sourceProject, 'movable', {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    })

    const targetFiles = page.locator(`[data-dnd-group="${targetProject}"] .file-name`)
    await expect(targetFiles).toHaveText(['movable'])
    const sourceFiles = page.locator(`[data-dnd-group="${sourceProject}"] .file-name`)
    await expect(sourceFiles).toHaveCount(0)
  })

  test('dropping onto a project that already has a same-named file is rejected with a warning toast', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'mouse-specific — see sidebar-reorder-touch.spec.ts')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectA = `E2E Collide A ${Date.now()}`
    const projectB = `E2E Collide B ${Date.now()}`
    await createProject(page, projectA)
    await createFile(page, projectA, 'dup')
    await createProject(page, projectB)
    await createFile(page, projectB, 'dup')
    await expect(sidebar.getByText(projectB)).toBeVisible()

    const groupB = page.locator(`[data-dnd-group="${projectB}"]`)
    const boxB = await groupB.boundingBox()
    if (!boxB) throw new Error('group B not found')
    await dragFileHandleTo(page, projectA, 'dup', {
      x: boxB.x + boxB.width / 2,
      y: boxB.y + boxB.height / 2,
    })

    await expect(page.getByText(`Já existe um arquivo "dup" em "${projectB}".`)).toBeVisible()
    // Nothing moved: each project still has exactly its own 'dup'.
    await expect(page.locator(`[data-dnd-group="${projectA}"] .file-name`)).toHaveText(['dup'])
    await expect(page.locator(`[data-dnd-group="${projectB}"] .file-name`)).toHaveText(['dup'])
  })

  test('reorders projects by dragging the header handle', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse-specific — see sidebar-reorder-touch.spec.ts')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const first = `E2E First ${Date.now()}`
    const second = `E2E Second ${Date.now()}`
    await createProject(page, first)
    await createProject(page, second)
    await expect(sidebar.getByText(second)).toBeVisible()

    const projectNamesInOrder = () => sidebar.locator('.project-name').allTextContents()
    const relativeOrder = async () => {
      const names = await projectNamesInOrder()
      return names.indexOf(second) - names.indexOf(first)
    }
    // Newly created projects append to the end, so `second` (created
    // after `first`) already sorts after it — confirm that starting point
    // before proving the drag actually flips it.
    await expect.poll(relativeOrder).toBeGreaterThan(0)

    // Drag SECOND's handle and drop it before FIRST — the only drag that
    // actually changes anything, since they start adjacent in this order.
    const secondHeaderHandle = page.locator(`[data-dnd-group="${second}"] [data-dnd-handle="project"]`)
    const firstGroup = page.locator(`[data-dnd-group="${first}"]`)
    const box = await firstGroup.boundingBox()
    if (!box) throw new Error('first group not found')

    const handleBox = await secondHeaderHandle.boundingBox()
    if (!handleBox) throw new Error('second project handle not found')
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(handleBox.x, handleBox.y - 10, { steps: 2 })
    await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 5 })
    await page.mouse.up()

    // Now second sorts BEFORE first.
    await expect.poll(relativeOrder).toBeLessThan(0)
  })

  test('Escape mid-drag cancels: the order stays unchanged', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse-specific — see sidebar-reorder-touch.spec.ts')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Escape ${Date.now()}`
    await createProject(page, projectName)
    for (const fileName of ['a', 'b']) {
      await createFile(page, projectName, fileName)
    }
    await expect(sidebar.getByText('b', { exact: true })).toBeVisible()

    const group = page.locator(`[data-dnd-group="${projectName}"]`)
    const fileNamesInOrder = () => group.locator('.file-name').allTextContents()
    await expect.poll(fileNamesInOrder).toEqual(['a', 'b'])

    const handle = page.locator(
      `[data-dnd-file-project="${projectName}"][data-dnd-file="b"] [data-dnd-handle="file"]`,
    )
    const box = await handle.boundingBox()
    if (!box) throw new Error('handle not found')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x, box.y - 40, { steps: 5 })
    await page.keyboard.press('Escape')
    await page.mouse.up()

    await expect.poll(fileNamesInOrder).toEqual(['a', 'b'])
  })
})
