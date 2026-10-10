/**
 * Prefix of every id generated for a heading. It keeps a heading called
 * "Editor" or "Preview" from duplicating the app's own `#editor`/`#preview`.
 */
export const HEADING_ID_PREFIX = 'user-content-'

/**
 * GitHub-style heading slug: lowercase, punctuation dropped, spaces turned
 * into hyphens. Unicode letters and digits are kept, so a PT-BR heading
 * ("Introdução") links as `#introdução`, the same as on GitHub.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/**
 * Hands out slugs that are unique within one document: a repeated heading
 * gets `-1`, `-2`… appended, in document order, as GitHub does.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text) => {
    const base = slugify(text) || 'secao'
    let slug = base
    for (let n = seen.get(base) ?? 0; seen.has(slug); n++) {
      slug = `${base}-${n + 1}`
      seen.set(base, n + 1)
    }
    seen.set(slug, 0)
    return slug
  }
}
