import { test, expect, ensureSidebarOpen } from './fixtures'

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

    // Scoped to the sidebar: once a file is open, its name also appears in
    // the main pane's breadcrumb (Breadcrumbs.tsx), and an unscoped
    // getByText would then match both and fail Playwright's strict mode —
    // as it would here once archiving falls back to selecting the other
    // file (see below).
    const sidebar = page.locator('#projectsSidebar')

    const projectName = `E2E Files ${Date.now()}`
    const keepFile = 'keep-file'
    const archiveFile = 'archive-file'

    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill(projectName)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(sidebar.getByText(projectName)).toBeVisible()

    for (const fileName of [keepFile, archiveFile]) {
      // Creating a file closes the mobile drawer (it becomes the active
      // file, and on a narrow viewport the drawer is an overlay covering
      // the editor) — reopen it before the next iteration's "..." click.
      await ensureSidebarOpen(page)
      await page
        .getByRole('button', { name: `Mais opções do projeto ${projectName}`, exact: true })
        .click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill(fileName)
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(sidebar.getByText(fileName)).toBeVisible()
    }

    // archiveFile was created last, so it's already the active file (a
    // freshly created file becomes active) and its "..." trigger is
    // already visible — see file-row-actions.spec.ts. Creating it also
    // closed the mobile drawer; reopen it before the next interaction.
    await ensureSidebarOpen(page)

    // Open the file's own "..." menu, then archive it.
    // exact: true — the row itself is also role="button" and its accessible
    // name is computed from its descendants, so a substring match would
    // ambiguously also match the row (see archive-projects.spec.ts's
    // "Mais opções do projeto" locators for the same precedent).
    await page
      .getByRole('button', { name: `Mais opções do arquivo ${archiveFile}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Arquivar$/ }).click()

    // It leaves the project's everyday file list; the other file stays.
    // Archiving the currently-open file falls back to selecting the only
    // remaining file, so keepFile is now both in the sidebar and the
    // breadcrumb — hence the sidebar scoping above.
    await expect(sidebar.getByText(archiveFile)).toBeHidden()
    await expect(sidebar.getByText(keepFile)).toBeVisible()

    // The per-project toggler shows the count and reveals it with its badge.
    // Its accessible name includes the project name (unlike its shorter
    // visible text) so it stays unique from the sidebar's own project-level
    // toggler or another project's identically-counted one.
    const toggle = page.getByRole('button', { name: `Mostrar arquivados de ${projectName} (1)` })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(sidebar.getByText(archiveFile)).toBeVisible()
    // Distinct from a project's own badge ("Projeto arquivado") so the two
    // remain distinguishable when both are visible at once.
    await expect(page.getByRole('img', { name: 'Arquivo arquivado' })).toBeVisible()

    // Reload: the archived file should still be archived (and hidden again,
    // since "show archived" is transient, not persisted).
    await page.reload()
    await expect(sidebar.getByText(projectName)).toBeVisible()
    await expect(sidebar.getByText(keepFile)).toBeVisible()
    await expect(sidebar.getByText(archiveFile)).toBeHidden()
    await expect(toggle).toBeVisible()

    // Unarchive it and confirm it's back in the everyday file list.
    await toggle.click()
    // Same trigger-visibility reasoning as above — open it first.
    await sidebar.getByText(archiveFile, { exact: true }).click()
    await page
      .getByRole('button', { name: `Mais opções do arquivo ${archiveFile}`, exact: true })
      .click()
    await page.getByRole('menuitem', { name: /Desarquivar$/ }).click()
    await expect(sidebar.getByText(archiveFile)).toBeVisible()
    await expect(page.getByRole('button', { name: /arquivados/i })).toBeHidden()
  })
})
