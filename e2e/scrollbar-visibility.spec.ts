import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The scrollbar thumb is the reader's progress indicator, so it has to stay
// visible against both surfaces (editor = machine, preview = paper) in both
// themes, and widen on hover. Measured on real pixels: a screenshot of the
// scrollbar gutter is decoded in-page and compared with the track beside it.

interface GutterReading {
  gutter: number
  contrast: number
  thumbColumns: number
}

async function readGutter(
  page: Page,
  selector: string,
  hover: boolean,
): Promise<GutterReading | null> {
  const box = await page.locator(selector).boundingBox()
  const gutter = await page
    .locator(selector)
    .evaluate((el) => (el as HTMLElement).offsetWidth - (el as HTMLElement).clientWidth)
  if (!box || gutter === 0) return null // overlay scrollbars (touch): no gutter

  const x = box.x + box.width - gutter
  if (hover) await page.mouse.move(x + gutter / 2, box.y + 8)
  else await page.mouse.move(0, 0)
  const png = await page.screenshot({
    clip: { x, y: box.y, width: gutter, height: box.height },
  })

  return page.evaluate(
    async ({ b64, gutter }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const scale = img.width / gutter
      const px = (col: number, row: number) =>
        Array.from(ctx.getImageData(Math.floor(col * scale), row, 1, 1).data.slice(0, 3))
      const lum = (c: number[]) => {
        const [r, g, bl] = c.map((v) => {
          const s = v / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
      }
      const ratio = (a: number[], b: number[]) => {
        const [lo, hi] = [lum(a), lum(b)].sort((m, n) => m - n)
        return (hi + 0.05) / (lo + 0.05)
      }
      // The thumb sits at the top (scrollTop 0); the bottom is bare track.
      const thumbRow = 8
      const trackRow = img.height - 5
      let contrast = 0
      let thumbColumns = 0
      for (let col = 0; col < gutter; col++) {
        const r = ratio(px(col, thumbRow), px(col, trackRow))
        contrast = Math.max(contrast, r)
        if (r > 1.2) thumbColumns++
      }
      return { gutter, contrast, thumbColumns }
    },
    { b64: png.toString('base64'), gutter },
  )
}

// Playwright's headless Chromium launches with --hide-scrollbars, which would
// leave no gutter to measure.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.describe('scrollbar visibility', () => {
  for (const theme of ['light', 'dark']) {
    test(`thumb is visible in editor and preview (${theme} theme)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
      await page.goto('/app.html')

      await page.getByRole('button', { name: 'Criar novo projeto' }).click()
      await page.getByLabel('Nome do novo projeto').fill('Scroll')
      await page.getByRole('button', { name: 'Criar', exact: true }).click()
      await page.getByRole('button', { name: 'Mais opções do projeto Scroll', exact: true }).click()
      await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
      await page.getByLabel('Nome do arquivo').fill('long.md')
      await page.getByRole('button', { name: 'Criar', exact: true }).click()

      const long = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}\n`).join('\n')
      await page.locator('#editor').fill(long)
      await page.locator('#editor').evaluate((el) => ((el as HTMLElement).scrollTop = 0))

      const editor = await readGutter(page, '#editor', false)
      test.skip(editor === null, 'overlay scrollbars have no gutter to measure')
      expect(editor!.contrast).toBeGreaterThanOrEqual(3)

      await page.getByRole('button', { name: 'Resultado' }).click()
      const preview = await readGutter(page, '#preview', false)
      expect(preview!.contrast).toBeGreaterThanOrEqual(3)
    })
  }

  test('thumb widens on hover', async ({ page }) => {
    await page.goto('/app.html')
    await page.getByRole('button', { name: 'Criar novo projeto' }).click()
    await page.getByLabel('Nome do novo projeto').fill('Scroll')
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page.getByRole('button', { name: 'Mais opções do projeto Scroll', exact: true }).click()
    await page.getByRole('menuitem', { name: /Novo arquivo/ }).click()
    await page.getByLabel('Nome do arquivo').fill('long.md')
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page
      .locator('#editor')
      .fill(Array.from({ length: 200 }, (_, i) => `Line ${i}\n`).join('\n'))
    await page.locator('#editor').evaluate((el) => ((el as HTMLElement).scrollTop = 0))

    const rest = await readGutter(page, '#editor', false)
    test.skip(rest === null, 'overlay scrollbars have no gutter to measure')
    const hovered = await readGutter(page, '#editor', true)
    expect(hovered!.thumbColumns).toBeGreaterThan(rest!.thumbColumns)
  })
})
