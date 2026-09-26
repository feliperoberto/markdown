import { test, expect, ensureSidebarOpen } from './fixtures'

// Batch download area ("Vários arquivos"): with enough files checked, the
// per-file list used to grow past the height of `.app-main`, whose
// `overflow: hidden` clipped the "Baixar ZIP" button out of reach — no
// ancestor scrolled. The list is now its own scroll container, so the
// header and the button stay on screen however many files are selected.
test.describe('batch download area overflow', () => {
  test('keeps the ZIP button reachable and scrolls the file list instead', async ({
    page,
    isMobile,
  }) => {
    // A short viewport makes the overflow happen with a modest file count.
    // Only the height is shortened: each project keeps its own width, so
    // the desktop run keeps its inline sidebar and the mobile run its
    // overlay drawer.
    const { width } = page.viewportSize() ?? { width: 1280 }
    await page.setViewportSize({ width, height: 560 })
    await page.goto('/app.html')

    const sidebar = page.locator('#projectsSidebar')
    const projectName = `E2E Batch ${Date.now()}`
    const fileNames = Array.from(
      { length: 15 },
      (_, i) => `batch-${String(i + 1).padStart(2, '0')}`,
    )

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    // Upload them in one go through the project's own (hidden) file input —
    // far quicker than 15 rounds of the "Novo arquivo" dialog.
    await page
      .locator('.project-group', { has: page.getByText(projectName, { exact: true }) })
      .locator('input[type="file"]')
      .setInputFiles(
        fileNames.map((name) => ({
          name: `${name}.md`,
          mimeType: 'text/markdown',
          buffer: Buffer.from(`# ${name}\n`),
        })),
      )

    // The upload resolves asynchronously and closes the mobile drawer when
    // it does (app.tsx's revealNewFileOnMobile); its toast fires right
    // after, so wait for it before reopening the drawer — reopening any
    // earlier races that close.
    await expect(page.getByText(`${fileNames.length} arquivo(s) importado(s)`)).toBeVisible()
    await ensureSidebarOpen(page)
    for (const name of fileNames) {
      await sidebar
        .getByRole('checkbox', { name: `Selecionar ${name} para download em lote` })
        .check()
    }

    // On a narrow viewport the sidebar is an overlay covering the main pane.
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu de projetos' }).click()

    const area = page.locator('.batch-download-area')
    await expect(area.getByText('Vários arquivos')).toBeInViewport()

    const download = area.getByRole('button', { name: 'Baixar ZIP' })
    await expect(download).toBeInViewport({ ratio: 1 })
    await expect(download).toBeEnabled()

    // The list itself absorbs the overflow: it's scrollable and holds every
    // selected entry, the last one reachable by scrolling it into view.
    const list = area.getByRole('region', { name: 'Arquivos selecionados' })
    await expect(list.locator('.batch-file-item')).toHaveCount(fileNames.length)
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    const last = list.getByText(`📄 ${fileNames[fileNames.length - 1]}`)
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await expect(download).toBeInViewport({ ratio: 1 })

    // And clicking the button actually produces the ZIP.
    const downloadEvent = page.waitForEvent('download')
    await download.click()
    expect((await downloadEvent).suggestedFilename()).toMatch(/\.zip$/)
  })
})
