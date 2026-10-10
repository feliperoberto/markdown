import { test, expect, createFile } from './fixtures'
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
  if (hover) await page.mouse.move(x + gutter / 2, box.y + 16)
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
      // The thumb sits at the top (scrollTop 0), at least 2rem tall, so its
      // middle row is inside it. The bare track is sampled well above the
      // bottom edge: the preview's rounded bottom-right corner exposes the
      // dark desk, which would read as a high-contrast pair with any row
      // near it even if the thumb were invisible.
      const thumbRow = 16
      const trackRow = Math.floor(img.height * 0.6)
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
  // Touch devices use overlay scrollbars: no gutter, nothing to measure.
  test.skip(({ hasTouch }) => hasTouch, 'overlay scrollbars on touch devices')

  for (const theme of ['light', 'dark']) {
    test(`thumb is visible in editor and preview (${theme} theme)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
      await page.goto('/app.html')

      await createFile(page, 'Scroll', 'long.md')

      const long = Array.from({ length: 200 }, (_, i) => `Paragraph ${i}\n`).join('\n')
      await page.locator('#editor').fill(long)
      await page.locator('#editor').evaluate((el) => ((el as HTMLElement).scrollTop = 0))

      const editor = await readGutter(page, '#editor', false)
      test.skip(editor === null, 'overlay scrollbars have no gutter to measure')
      expect(editor!.contrast).toBeGreaterThanOrEqual(3)

      await page.getByRole('button', { name: 'Resultado' }).click()
      const preview = await readGutter(page, '#preview', false)
      test.skip(preview === null, 'overlay scrollbars have no gutter to measure')
      expect(preview!.contrast).toBeGreaterThanOrEqual(3)
    })

    // Fenced code sits on the always-dark --ground-deep inside the (light)
    // paper sheet, so it must not inherit the sheet's paper-tinted thumb.
    test(`code block scrollbar thumb is visible on its dark surface (${theme} theme)`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
      await page.goto('/app.html')
      await createFile(page, 'Scroll', 'code.md')
      await page.locator('#editor').fill('```\n' + 'x'.repeat(400) + '\n```\n')
      await page.getByRole('button', { name: 'Resultado' }).click()

      const pre = page.locator('#preview pre').first()
      await expect(pre).toBeVisible()
      expect(await pre.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)

      const result = await pre.evaluate((el) => {
        const sheet = el.closest('.preview-content') as HTMLElement
        const tokens = (node: Element) => {
          const cs = getComputedStyle(node)
          return [
            cs.getPropertyValue('--scrollbar-thumb').trim(),
            cs.getPropertyValue('--scrollbar-thumb-hover').trim(),
          ]
        }
        // Resolve a token to the pixel it paints over the block's own
        // background, by compositing it on a canvas (handles color-mix()).
        const bg = getComputedStyle(el).backgroundColor
        const probe = document.createElement('i')
        el.appendChild(probe)
        const paint = (token: string) => {
          probe.style.background = token
          const cssColor = getComputedStyle(probe).backgroundColor
          const ctx = document.createElement('canvas').getContext('2d')!
          ctx.fillStyle = bg
          ctx.fillRect(0, 0, 1, 1)
          ctx.fillStyle = cssColor
          ctx.fillRect(0, 0, 1, 1)
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
        }
        const base = (() => {
          const ctx = document.createElement('canvas').getContext('2d')!
          ctx.fillStyle = bg
          ctx.fillRect(0, 0, 1, 1)
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
        })()
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const ratio = (a: number[], b: number[]) => {
          const [lo, hi] = [lum(a), lum(b)].sort((m, n) => m - n)
          return (hi + 0.05) / (lo + 0.05)
        }
        const [thumb, hover] = tokens(el)
        const out = {
          sheet: tokens(sheet),
          pre: [thumb, hover],
          rest: ratio(paint(thumb), base),
          hover: ratio(paint(hover), base),
        }
        probe.remove()
        return out
      })

      expect(result.pre[0]).not.toBe(result.sheet[0])
      expect(result.pre[1]).not.toBe(result.sheet[1])
      expect(result.rest).toBeGreaterThanOrEqual(3)
      expect(result.hover).toBeGreaterThan(result.rest)
    })
  }

  test('thumb widens on hover', async ({ page }) => {
    await page.goto('/app.html')
    await createFile(page, 'Scroll', 'long.md')
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
