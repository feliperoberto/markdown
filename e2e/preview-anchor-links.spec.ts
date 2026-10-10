import { test, expect } from './fixtures'

// In-document #fragment links must scroll the preview sheet to their target
// like a browser anchor, without touching the app's URL.
test('a table-of-contents link scrolls the preview to its section', async ({ page }) => {
  await page.goto('/app.html')

  await page.getByRole('button', { name: 'Criar novo projeto' }).click()
  await page.getByLabel('Nome do novo projeto').fill('Anchors')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await page.getByRole('button', { name: 'Mais opções do projeto Anchors', exact: true }).click()
  await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
  await page.getByLabel('Nome do arquivo').fill('toc.md')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  const filler = Array.from({ length: 80 }, (_, i) => `Parágrafo ${i}\n`).join('\n')
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
