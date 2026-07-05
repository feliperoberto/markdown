import { test, expect } from './fixtures'

// Golden path #1 (issue #33): create project -> create file -> type
// markdown -> toggle preview -> verify the rendered output matches.
test.describe('editor golden path', () => {
  test('create project, create file, edit markdown, and toggle preview', async ({ page }) => {
    await page.goto('/app.html')

    const projectName = `E2E Project ${Date.now()}`
    const fileName = `notes-${Date.now()}.md`

    await page.getByRole('button', { name: 'Novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    await expect(page.getByText(projectName)).toBeVisible()

    await page.getByRole('button', { name: `Mais opções do projeto ${projectName}` }).click()
    await page.getByRole('button', { name: 'Novo arquivo' }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    // Creating a file doesn't auto-select it, so open it explicitly before
    // expecting the editor pane to be usable.
    await page.getByText(fileName).click()

    const editor = page.locator('#editor')
    await expect(editor).toBeVisible()
    await editor.fill('# Hello E2E\n\nThis is **bold** text.')

    // Toggle to the rendered preview and verify the markdown was rendered
    // (heading + bold), not just echoed back as raw text.
    await page.getByRole('button', { name: 'Resultado' }).click()

    const preview = page.locator('#preview')
    await expect(preview).toBeVisible()
    await expect(preview.locator('h1')).toHaveText('Hello E2E')
    await expect(preview.locator('strong')).toHaveText('bold')

    // Switch back to editing and confirm the raw markdown survived the
    // round trip untouched.
    await page.getByRole('button', { name: 'Marcar' }).click()
    await expect(editor).toHaveValue('# Hello E2E\n\nThis is **bold** text.')
  })
})
