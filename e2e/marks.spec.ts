import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page): Promise<void> => {
  await page.goto('/e2e/fixture-theme/index.html?modules=bold,italic,lists')
  await page.waitForSelector('body[data-ready=true]')
}

const editorBox = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })
const tool = (page: Page, name: string): Locator =>
  page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name, exact: true })
const html = async (page: Page): Promise<string> => page.evaluate(() => window.editor.getHTML())

const typeMarkedThenOff = async (page: Page, key: string): Promise<void> => {
  await editorBox(page).click()
  await page.keyboard.press(`ControlOrMeta+${key}`)
  await page.keyboard.type('Includes:')
  await page.keyboard.press(`ControlOrMeta+${key}`)
}

for (const { name, key, tag } of [
  { name: 'Bold', key: 'b', tag: 'strong' },
  { name: 'Italic', key: 'i', tag: 'em' },
]) {
  test.describe(`${name} off at the end of marked text`, () => {
    test('keeps the next line plain after Enter', async ({ page }) => {
      await open(page)
      await typeMarkedThenOff(page, key)
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.press('Enter')
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.type('LED light bar')
      await expect
        .poll(async () => html(page))
        .toBe(`<p><${tag}>Includes:</${tag}></p><p>LED light bar</p>`)
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'false')
    })

    test('keeps bullet items plain after Enter', async ({ page }) => {
      await open(page)
      await typeMarkedThenOff(page, key)
      await page.keyboard.press('Enter')
      await tool(page, 'Bulleted list').click()
      await page.keyboard.type('LED light bar')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Steel push bumper')
      await expect
        .poll(async () => html(page))
        .toBe(
          `<p><${tag}>Includes:</${tag}></p><ul><li>LED light bar</li><li>Steel push bumper</li></ul>`,
        )
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'false')
    })

    test('keeps the same line plain', async ({ page }) => {
      await open(page)
      await typeMarkedThenOff(page, key)
      await page.keyboard.type(' LED')
      await expect.poll(async () => html(page)).toBe(`<p><${tag}>Includes:</${tag}> LED</p>`)
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'false')
    })

    test('keeps the mark on after Enter while it is on', async ({ page }) => {
      await open(page)
      await editorBox(page).click()
      await page.keyboard.press(`ControlOrMeta+${key}`)
      await page.keyboard.type('Includes:')
      await page.keyboard.press('Enter')
      await page.keyboard.type('LED')
      await expect
        .poll(async () => html(page))
        .toBe(`<p><${tag}>Includes:</${tag}></p><p><${tag}>LED</${tag}></p>`)
      await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'true')
    })
  })
}
