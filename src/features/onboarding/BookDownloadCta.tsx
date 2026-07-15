import type { JSX } from 'preact'

/**
 * Secondary CTA on the splash screen offering the companion book this app
 * is built alongside — a static asset link (no `downloadBlob()` plumbing
 * needed; that helper in app.tsx is for content generated at runtime).
 */
export function BookDownloadCta(): JSX.Element {
  return (
    <div class="splash-book-cta">
      <div class="splash-book-kicker">O livro · PDF</div>
      <div class="splash-book-text">
        Do giz de cera ao README.md — a história completa por trás desta ferramenta.
      </div>
      <a class="btn-splash-book" href="/marcar-para-existir.pdf" download>
        <span aria-hidden="true">⬇️</span> Baixar o livro
      </a>
      <div class="splash-book-meta">PDF · 11 MB</div>
    </div>
  )
}
