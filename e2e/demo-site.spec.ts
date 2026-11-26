import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const LAYOUT_WIDTHS = [320, 375, 768, 1024, 1440] as const

const horizontalOverflow = async (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const width of LAYOUT_WIDTHS) {
  test(`the demo page has no horizontal overflow at ${String(width)} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./')
    await expect(page.getByRole('textbox', { name: 'Full editor' })).toBeVisible()
    expect(await horizontalOverflow(page)).toBe(0)
  })
}

test('a long unbreakable word in the editor does not widen the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const textbox = page.getByRole('textbox', { name: 'Full editor' })
  await textbox.click()
  await page.keyboard.insertText('x'.repeat(1500))
  await expect(textbox).toContainText('x'.repeat(1500))
  expect(await horizontalOverflow(page)).toBe(0)
})

test('the page head has a favicon and social card meta tags', async ({ page }) => {
  await page.goto('./')
  const iconHref = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(iconHref).toBeTruthy()
  const icon = await page.request.get(new URL(iconHref ?? '', page.url()).href)
  expect(icon.status()).toBe(200)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary')
})

test('the usage code block shows the type-checked usage example verbatim', async ({ page }) => {
  const source = readFileSync(resolve(import.meta.dirname, '../demo/usage-example.ts'), 'utf8')
  await page.goto('./')
  const blocks = page.getByRole('region', { name: 'Usage' }).locator('pre code')
  expect(await blocks.allTextContents()).toContain(source)
})

test('the size claim uses the kB unit', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.demo-header')).toContainText(/about \d+ kB gzipped/)
  await expect(page.locator('body')).not.toContainText(/\bKB\b/)
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /\d+\s*KB/i)
})

test(
  'npm.html loads 0.0.1, which has no /theme, without failed requests',
  { tag: '@network' },
  async ({ page }) => {
    const failures: string[] = []
    page.on('requestfailed', (request) => failures.push(`failed ${request.url()}`))
    page.on('response', (response) => {
      if (response.status() >= 400) {
        failures.push(`${String(response.status())} ${response.url()}`)
      }
    })
    await page.goto('./npm.html?v=0.0.1')
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
    await expect(page.locator('#toolbar-status')).toHaveText('none (/theme not in this version)')
    await page.waitForLoadState('networkidle')
    expect(failures).toEqual([])
  },
)
