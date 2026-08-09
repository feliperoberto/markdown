import type { Locator } from '@playwright/test'
import { test, expect, ensureSidebarOpen } from './fixtures'

// Touch-specific coverage for the Pointer Events drag & drop rewrite
// (issue: mobile DnD). e2e/sidebar-reorder.spec.ts already proves the
// mouse path end-to-end via the same production code; this file covers
// what only runs under the `mobile` Playwright project (Pixel 5 —
// playwright.config.ts): a touch-flavored pointer gesture on the drag
// handle, and the CSS boundary that keeps the sidebar's native scroll
// working everywhere else on the row.
//
// `page.touchscreen` can only tap a fixed point; it can't target a
// specific element mid-gesture the way a drag needs, and Playwright has no
// high-level "swipe" helper. Driven instead via `locator.dispatchEvent`
// with `pointerType: 'touch'` — the same DOM events a real touchscreen
// produces, which is what useSidebarDnd.ts's listeners actually consume
// regardless of what produced them.
test.describe('sidebar reorder (touch)', () => {
  async function dispatchPointer(locator: Locator, type: string, point: { x: number; y: number }) {
    await locator.dispatchEvent(type, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: point.x,
      clientY: point.y,
      bubbles: true,
      cancelable: true,
    })
  }

  test('a touch-flavored pointer drag on the handle reorders a file', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch-flavored gesture — see sidebar-reorder.spec.ts for the mouse path')
    await page.goto('/app.html')
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Touch Reorder ${Date.now()}`

    await ensureSidebarOpen(page)
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()

    for (const fileName of ['a', 'b']) {
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(fileName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
    }
    await ensureSidebarOpen(page)
    await expect(sidebar.getByText('b', { exact: true })).toBeVisible()

    const group = page.locator(`[data-dnd-group="${projectName}"]`)
    const fileNamesInOrder = () => group.locator('.file-name').allTextContents()
    await expect.poll(fileNamesInOrder).toEqual(['a', 'b'])

    const handleB = page.locator(
      `[data-dnd-file-project="${projectName}"][data-dnd-file="b"] [data-dnd-handle="file"]`,
    )
    const rowA = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="a"]`)
    const handleBox = await handleB.boundingBox()
    const targetBox = await rowA.boundingBox()
    if (!handleBox || !targetBox) throw new Error('handle or target row not found')

    await dispatchPointer(handleB, 'pointerdown', {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    })
    await dispatchPointer(handleB, 'pointermove', {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2 - 10,
    })
    await dispatchPointer(handleB, 'pointermove', {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    })
    await dispatchPointer(handleB, 'pointerup', {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    })

    // Dropped 'b' onto 'a' — inserts before it.
    await expect.poll(fileNamesInOrder).toEqual(['b', 'a'])
  })

  // The CSS boundary that keeps sidebar scrolling working on touch: only
  // the handle opts out of native panning, not the row it sits in — a
  // finger anywhere else on a row (or a project header) must still be able
  // to scroll the list. Asserted directly on computed style rather than by
  // simulating a real swipe gesture, which needs actual OS-level touch
  // input Playwright's synthetic pointer events don't produce (a
  // dispatchEvent-driven "swipe" wouldn't invoke the browser's native
  // scroll handling at all, making that assertion unfalsifiable the other
  // way — this is the direct, meaningful check).
  test('only the drag handle opts out of native touch scrolling (touch-action: none)', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'a desktop pointer is never touch-action constrained the same way')
    await page.goto('/app.html')

    const projectName = `E2E Touch Action ${Date.now()}`
    await ensureSidebarOpen(page)
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await ensureSidebarOpen(page)
    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill('only-file')
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await ensureSidebarOpen(page)

    const handle = page.locator(
      `[data-dnd-file-project="${projectName}"][data-dnd-file="only-file"] [data-dnd-handle="file"]`,
    )
    const row = page.locator(`[data-dnd-file-project="${projectName}"][data-dnd-file="only-file"]`)

    await expect(handle).toHaveCSS('touch-action', 'none')
    await expect(row).not.toHaveCSS('touch-action', 'none')
  })
})
