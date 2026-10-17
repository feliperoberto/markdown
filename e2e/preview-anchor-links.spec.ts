import { test, expect, createFile } from './fixtures'

// In-document #fragment links must scroll the preview sheet to their target
// like a browser anchor, without touching the app's URL.
const filler = Array.from({ length: 80 }, (_, i) => `Parágrafo ${i}\n`).join('\n')

test('a table-of-contents link scrolls the preview to its section', async ({ page }) => {
  await page.goto('/app.html')
  await createFile(page, 'Anchors', 'toc.md')

  await page
    .locator('#editor')
    .fill(`[Ir para o fim](#conclusão)\n\n# Início\n\n${filler}\n## Conclusão\n\nFim.`)
  await page.getByRole('button', { name: 'Resultado' }).click()

  const preview = page.locator('#preview')
  const url = page.url()
  expect(await preview.evaluate((el) => el.scrollTop)).toBe(0)

  await preview.getByRole('link', { name: 'Ir para o fim' }).click()

  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(preview.getByRole('heading', { name: 'Conclusão' })).toBeInViewport()
  await expect(preview.getByRole('heading', { name: 'Conclusão' })).toBeFocused()
  expect(page.url()).toBe(url)
})

test('a mixed-case link still reaches its heading', async ({ page }) => {
  await page.goto('/app.html')
  await createFile(page, 'Anchors', 'case.md')

  await page
    .locator('#editor')
    .fill(`[x](#Conclusão)\n\n# Início\n\n${filler}\n## Conclusão\n\nFim.`)
  await page.getByRole('button', { name: 'Resultado' }).click()

  const preview = page.locator('#preview')
  const url = page.url()

  await preview.getByRole('link', { name: 'x' }).click()

  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(preview.getByRole('heading', { name: 'Conclusão' })).toBeInViewport()
  expect(page.url()).toBe(url)
})

test('a target inside a collapsed <details> is opened and scrolled into view', async ({ page }) => {
  await page.goto('/app.html')
  await createFile(page, 'Anchors', 'details.md')

  await page
    .locator('#editor')
    .fill(
      `[Abrir](#segredo)\n\n${filler}\n<details>\n<summary>Mais</summary>\n\n<p id="segredo">Conteúdo oculto</p>\n\n</details>\n`,
    )
  await page.getByRole('button', { name: 'Resultado' }).click()

  const preview = page.locator('#preview')
  const url = page.url()
  await expect(preview.locator('details')).not.toHaveAttribute('open', '')

  await preview.getByRole('link', { name: 'Abrir' }).click()

  await expect(preview.locator('details')).toHaveAttribute('open', '')
  await expect(preview.locator('#segredo')).toBeInViewport()
  expect(page.url()).toBe(url)
})
