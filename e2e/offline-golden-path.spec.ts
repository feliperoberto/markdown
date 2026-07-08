import { test, expect } from './fixtures'

// Golden path #3 (issue #33): going offline (Playwright's
// `context.setOffline(true)`, the automation equivalent of DevTools'
// "Offline" network throttling) must not block local editing (this app is
// local-first — every edit round-trips through localStorage, never the
// network), and the Drive-sync UI must visibly surface the offline state.
//
// This intentionally never exercises real Google OAuth/Drive infra: the
// shared `fixtures.ts` aborts every request to accounts.google.com /
// www.googleapis.com, and this test never clicks "Conectar com Google" (it
// only asserts the offline badge/notice), so no OAuth popup is ever
// triggered in the first place.
test.describe('offline golden path', () => {
  test('editing keeps working offline and Drive sync surfaces the offline state', async ({
    page,
    context,
  }) => {
    await page.goto('/app.html')

    const projectName = `Offline Project ${Date.now()}`
    const fileName = `offline-${Date.now()}`

    await page.getByRole('button', { name: 'Novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    await page
      .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
      .click()
    await page.getByRole('button', { name: 'Novo arquivo' }).click()
    await page.getByLabel('Nome do arquivo').fill(fileName)
    await page.getByRole('button', { name: 'Salvar' }).click()

    // Creating a file doesn't auto-select it, so open it explicitly (while
    // still online — this is just navigating to the file, not the part
    // under test).
    await page.getByText(fileName).click()

    await context.setOffline(true)

    const editor = page.locator('#editor')
    await editor.fill('# Still editable offline')
    await expect(editor).toHaveValue('# Still editable offline')

    await page.getByRole('button', { name: 'Resultado' }).click()
    await expect(page.locator('#preview').locator('h1')).toHaveText('Still editable offline')

    // Drive sync surfaces the offline state: the toolbar badge next to the
    // cloud icon, plus the in-panel notice once opened.
    await expect(page.getByRole('status', { name: 'Offline' })).toBeVisible()

    await page.getByRole('button', { name: 'Sincronização com Google Drive' }).click()
    await expect(
      page.getByText(
        'Você está offline. A edição local continua funcionando — a sincronização com o Drive será retomada automaticamente quando a conexão voltar.',
      ),
    ).toBeVisible()
  })
})
