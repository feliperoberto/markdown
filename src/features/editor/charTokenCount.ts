/**
 * Character and token counters for the editor footer stats (issue #18).
 * Token estimate preserves the prototype's exact formula: `Math.ceil(chars / 4)`.
 */
export interface CharTokenCount {
  chars: number
  tokens: number
}

export function countCharsAndTokens(content: string): CharTokenCount {
  const chars = content.length
  const tokens = Math.ceil(chars / 4)
  return { chars, tokens }
}
