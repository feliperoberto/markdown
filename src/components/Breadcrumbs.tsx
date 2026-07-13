import type { JSX } from 'preact'

export interface BreadcrumbsProps {
  projectName: string | null
  fileName: string | null
}

/**
 * Shows "Project / file" above the editor, or an italicized "Nenhum
 * arquivo" placeholder when nothing is open — restores the prototype's
 * `#breadcrumbs` bar (its `updateBreadcrumbs()`), dropped in the migration
 * in favor of a bare `<p>Nenhum arquivo selecionado</p>` with no
 * project/file context once a file *was* open.
 */
export function Breadcrumbs({ projectName, fileName }: BreadcrumbsProps): JSX.Element {
  if (!projectName || !fileName) {
    return (
      <div class="breadcrumbs">
        <span class="breadcrumb empty">Nenhum arquivo</span>
      </div>
    )
  }

  return (
    <div class="breadcrumbs">
      <span class="breadcrumb">{projectName}</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb breadcrumb-current">{fileName}</span>
    </div>
  )
}
