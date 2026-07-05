import { test, expect } from './fixtures'

// Golden path #2 (issue #33): export a project as a ZIP, then re-import it
// and verify the file content survives the round trip. The project is
// deleted between export and import so the assertions prove the ZIP itself
// carries the content, not that the original in-memory state just stuck
// around.
test.describe('export/import golden path', () => {
  test('export a project as ZIP, re-import it, and verify content matches', async ({ page }) => {
    await page.goto('/app.html')

    const projectName = `Export Project ${Date.now()}`
    const fileName = `readme-${Date.now()}`
    const content = '# Exported note\n\nRound-trip content check.'

    await page.getByRole('button', { name: 'Novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page.getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true }).click()
    await page.getByRole('button', { name: 'Novo arquivo' }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    // Creating a file doesn't auto-select it, so open it explicitly.
    await page.getByText(fileName).click()
    await page.locator('#editor').fill(content)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar projeto' }).click()
    const download = await downloadPromise
    const zipPath = await download.path()
    expect(zipPath).toBeTruthy()

    // Delete the project so a subsequent re-appearance can only be
    // explained by the ZIP import, not leftover in-memory/localStorage
    // state.
    await page.getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true }).click()
    await page.getByRole('button', { name: 'Excluir projeto' }).click()
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText(projectName)).toHaveCount(0)

    await page.getByRole('button', { name: 'Importar ZIP' }).click()
    await page.locator('input[type="file"][accept=".zip"]').setInputFiles(zipPath as string)

    await expect(page.getByText(projectName)).toBeVisible()
    await page.getByText(projectName).click()
    await expect(page.getByText(fileName)).toBeVisible()
    await page.getByText(fileName).click()

    await expect(page.locator('#editor')).toHaveValue(content)
  })
})
