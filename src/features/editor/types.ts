/** Which pane is currently visible: the raw markdown editor or the rendered preview. */
export type EditorView = 'edit' | 'preview'

/**
 * Font-size steps, cycled in order by the "Aa" toggle. Each value is a
 * unitless multiplier applied (via the `--font-scale` CSS custom property)
 * to BOTH the editor textarea and the rendered preview — not just the
 * editor as before (issue #92). The steps advance by 0.5em each: 1× → 1.5×
 * → 2×.
 */
export const FONT_SCALES = ['1', '1.5', '2'] as const

export type EditorFontScale = (typeof FONT_SCALES)[number]
