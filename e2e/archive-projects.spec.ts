import { test, expect } from './fixtures'

// Archive feature: archive a project from its "⋮" menu, verify it leaves
// the everyday list and the "Mostrar arquivados" toggler reveals it, then
// reload and confirm the archived state (a localStorage sidecar key) really
// round-tripped through the app's boot path — the one thing unit tests
// (which never reload a real page) can't cover.
test.describe('archive projects', () => {
  test('archive from the menu, reveal via the toggler, and survive a reload', async ({
    page,
  }) => {
    await page.goto('/app.html')

    const keepName = `E2E Keep ${Date.now()}`
    const archiveName = `E2E Archive ${Date.now()}`

    for (const projectName of [keepName, archiveName]) {
      await page.getByRole('button', { name: 'Criar novo projeto' }).click()
      await page.getByLabel('Nome do novo projeto').fill(projectName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(page.getByText(projectName)).toBeVisible()
    }

    // Archive the second project via its "⋮" menu.
    await page
      .getByRole('button', { name: `Mais opções do projeto ${archiveName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Arquivar projeto/ }).click()

    // It leaves the everyday list; the other project stays.
    await expect(page.getByText(archiveName)).toBeHidden()
    await expect(page.getByText(keepName)).toBeVisible()

    // The toggler shows the count and reveals it with its 📦 badge.
    const toggle = page.getByRole('button', { name: 'Mostrar arquivados (1)' })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.getByText(archiveName)).toBeVisible()
    await expect(page.getByRole('img', { name: 'Arquivado' })).toBeVisible()

    // Reload: the archived project should still be archived (and hidden
    // again, since "show archived" is transient, not persisted).
    await page.reload()
    await expect(page.getByText(keepName)).toBeVisible()
    await expect(page.getByText(archiveName)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mostrar arquivados (1)' })).toBeVisible()

    // Unarchive it and confirm it's back in the everyday list.
    await page.getByRole('button', { name: 'Mostrar arquivados (1)' }).click()
    await page
      .getByRole('button', { name: `Mais opções do projeto ${archiveName}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Desarquivar projeto/ }).click()
    await expect(page.getByText(archiveName)).toBeVisible()
    await expect(page.getByRole('button', { name: /arquivados/i })).toBeHidden()
  })
})
