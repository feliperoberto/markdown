import { test, expect } from './fixtures'

// Archive feature (files): archive a file from its own "..." menu, verify
// it leaves the project's everyday file list and the per-project "Mostrar
// arquivados" toggler reveals it, then reload and confirm the archived
// state (a localStorage sidecar key) really round-tripped through the app's
// boot path — the one thing unit tests (which never reload a real page)
// can't cover. Mirrors archive-projects.spec.ts one level down.
test.describe('archive files', () => {
  test('archive from the menu, reveal via the per-project toggler, and survive a reload', async ({
    page,
  }) => {
    await page.goto('/app.html')

    const projectName = `E2E Files ${Date.now()}`
    const keepFile = 'keep-file'
    const archiveFile = 'archive-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(page.getByText(projectName)).toBeVisible()

    for (const fileName of [keepFile, archiveFile]) {
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(fileName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(page.getByText(fileName)).toBeVisible()
    }

    // Open the file's own "..." menu, then archive it.
    // exact: true — the row itself is also role="button" and its accessible
    // name is computed from its descendants, so a substring match would
    // ambiguously also match the row (see archive-projects.spec.ts's
    // "Mais opções do projeto" locators for the same precedent).
    await page
      .getByRole('button', { name: `Mais opções do arquivo ${archiveFile}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Arquivar arquivo/ }).click()

    // It leaves the project's everyday file list; the other file stays.
    await expect(page.getByText(archiveFile)).toBeHidden()
    await expect(page.getByText(keepFile)).toBeVisible()

    // The per-project toggler shows the count and reveals it with its badge.
    // Its accessible name includes the project name (unlike its shorter
    // visible text) so it stays unique from the sidebar's own project-level
    // toggler or another project's identically-counted one.
    const toggle = page.getByRole('button', { name: `Mostrar arquivados de ${projectName} (1)` })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.getByText(archiveFile)).toBeVisible()
    // Distinct from a project's own badge ("Projeto arquivado") so the two
    // remain distinguishable when both are visible at once.
    await expect(page.getByRole('img', { name: 'Arquivo arquivado' })).toBeVisible()

    // Reload: the archived file should still be archived (and hidden again,
    // since "show archived" is transient, not persisted).
    await page.reload()
    await expect(page.getByText(projectName)).toBeVisible()
    await expect(page.getByText(keepFile)).toBeVisible()
    await expect(page.getByText(archiveFile)).toBeHidden()
    await expect(toggle).toBeVisible()

    // Unarchive it and confirm it's back in the everyday file list.
    await toggle.click()
    await page
      .getByRole('button', { name: `Mais opções do arquivo ${archiveFile}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Desarquivar arquivo/ }).click()
    await expect(page.getByText(archiveFile)).toBeVisible()
    await expect(page.getByRole('button', { name: /arquivados/i })).toBeHidden()
  })
})
