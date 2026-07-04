/** Which pane is currently visible: the raw markdown editor or the rendered preview. */
export type EditorView = 'edit' | 'preview'

/** Available editor font sizes, cycled in order by the font-size toggle button. */
export const FONT_SIZES = ['13px', '15px', '17px'] as const

export type EditorFontSize = (typeof FONT_SIZES)[number]
