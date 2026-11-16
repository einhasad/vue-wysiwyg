import { expect, test, type Locator, type Page } from '@playwright/test'

const MODULES = 'markdown-shortcuts,heading,lists,bold,italic,history'

const open = async (page: Page, modules = MODULES): Promise<void> => {
  await page.goto(`/e2e/fixture/index.html?modules=${modules}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('textbox', { name: 'Editor' }).click()
}

const output = (page: Page): Locator => page.locator('#output')

test('"## " turns the paragraph into a heading', async ({ page }) => {
  await open(page)
  await page.keyboard.type('## Title')
  await expect(output(page)).toHaveText('<h2>Title</h2>')
})

test('"- " and "1. " start lists and Enter continues them', async ({ page }) => {
  await open(page)
  await page.keyboard.type('- one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(output(page)).toHaveText('<ul><li>one</li><li>two</li></ul>')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('1. first')
  await expect(output(page)).toHaveText('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>')
})

test('closing delimiters apply bold and italic', async ({ page }) => {
  await open(page)
  await page.keyboard.type('a **bold** and *it*')
  await expect(output(page)).toHaveText('<p>a <strong>bold</strong> and <em>it</em></p>')
  await page.keyboard.type(' end')
  await expect(output(page)).toHaveText('<p>a <strong>bold</strong> and <em>it</em> end</p>')
})

test('Mod-z undoes a shortcut in one step', async ({ page }) => {
  await open(page)
  await page.keyboard.type('### ')
  await expect(page.locator('#editor h3')).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('<p>###</p>')
})

test('markers stay text without the matching modules', async ({ page }) => {
  await open(page, 'markdown-shortcuts')
  await page.keyboard.type('# - **x**')
  await expect(output(page)).toHaveText('<p># - **x**</p>')
})
