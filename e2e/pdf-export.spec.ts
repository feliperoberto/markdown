import { test, expect, type Page } from './fixtures'

// "Exportar PDF" (print-export): a toolbar button that renders the active
// file into a body-level `.print-root` and calls window.print(). The print
// CSS hides the whole app shell and lets that container paginate — the
// previous `visibility: hidden` print hack truncated output to a single
// page and printed nothing from the edit view.

const PDF_LABEL = 'Exportar PDF do arquivo atual'
const DOWNLOAD_LABEL = 'Baixar arquivo atual'

async function createFile(page: Page): Promise<void> {
  await page.goto('/app.html')

  const projectName = `PDF Project ${Date.now()}`
  await page.getByRole('button', { name: 'Criar novo projeto' }).click()
  await page.getByLabel('Nome do novo projeto').fill(projectName)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await page
    .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
    .click()
  await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
  await page.getByLabel('Nome do arquivo').fill(`doc-${Date.now()}.md`)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await expect(page.locator('#editor')).toBeVisible()
}

test.describe('PDF export', () => {
  test('sits left of the download button with a clear gap', async ({ page }) => {
    await createFile(page)

    const pdf = page.getByRole('button', { name: PDF_LABEL })
    const download = page.getByRole('button', { name: DOWNLOAD_LABEL })
    await expect(pdf).toBeVisible()
    await expect(download).toBeVisible()

    const a = await pdf.boundingBox()
    const b = await download.boundingBox()
    expect(a && b).toBeTruthy()
    // Left of, and at least 8px apart (mis-tap guard between the two).
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(8)

    // Touch devices: both keep a 44x44 minimum hit area.
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) {
      for (const box of [a!, b!]) {
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  test('prints the rendered document from the edit view', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __printCalls: number }
      w.__printCalls = 0
      window.print = () => {
        w.__printCalls++
      }
    })
    await createFile(page)

    // Still in edit view: the on-screen preview isn't rendered here, which
    // is exactly the case the old print CSS printed blank.
    await page.locator('#editor').fill('# Relatório PDF\n\nCorpo do **documento**.')
    await page.getByRole('button', { name: PDF_LABEL }).click()

    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls))
      .toBe(1)
    const printDoc = page.locator('body > .print-root > .print-document')
    await expect(printDoc.locator('h1')).toHaveText('Relatório PDF')
    await expect(printDoc.locator('strong')).toHaveText('documento')
  })

  test('print media shows only the document', async ({ page }) => {
    await createFile(page)
    await page.locator('#editor').fill('# Só o documento\n\nTexto.')

    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
    await page.emulateMedia({ media: 'print' })

    await expect(page.locator('.print-document')).toBeVisible()
    await expect(page.locator('.print-document h1')).toHaveText('Só o documento')
    for (const selector of ['.app-toolbar', '.projects-sidebar', '.toolbar', 'footer', '#editor']) {
      await expect(page.locator(selector).first()).toBeHidden()
    }

    // Hidden must mean "out of the layout", not merely invisible: the old
    // `visibility: hidden` approach kept the 100%-height, overflow-hidden
    // app shell in the flow, which is what clipped output to one page.
    const layout = await page.evaluate(() => ({
      shellDisplays: Array.from(document.body.children)
        .filter((el) => !el.classList.contains('print-root'))
        .map((el) => getComputedStyle(el).display),
      bodyOverflow: getComputedStyle(document.body).overflowY,
    }))
    expect(layout.shellDisplays.every((display) => display === 'none')).toBe(true)
    expect(layout.bodyOverflow).toBe('visible')
  })

  test('a long document paginates instead of truncating to one page', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'page.pdf() is Chromium-only')
    await createFile(page)

    const paragraphs = Array.from(
      { length: 200 },
      (_, i) => `Parágrafo ${i + 1}: lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    )
    await page.locator('#editor').fill(`# Documento longo\n\n${paragraphs.join('\n\n')}`)
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))

    const pdf = (await page.pdf()).toString('latin1')
    const pages = pdf.match(/\/Type\s*\/Page(?!s)/g) ?? []
    expect(pages.length).toBeGreaterThan(1)
  })
})
