import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/e2e/fixture-vue/index.html${query}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  await expect(editor(page)).toBeVisible()
}

const model = (page: Page): Locator => page.locator('#model')
const editor = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })
const modelValue = async (page: Page): Promise<string> => page.evaluate(() => window.model())

test('v-model round trip: typing updates the model, model updates the editor', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('Hello')
  await expect(model(page)).toHaveText('<p>Hello</p>')
  await expect(page.locator('input[type=hidden][name=body]')).toHaveValue('<p>Hello</p>')

  await page.evaluate(() => {
    window.setModel('<p>from <strong>parent</strong></p><img src=x onerror=alert(1)>')
  })
  await expect(editor(page)).toHaveText('from parent')
  await expect(editor(page).locator('strong')).toHaveText('parent')
  await expect(editor(page).locator('img')).toHaveCount(0)
  await expect(page.locator('input[type=hidden][name=body]')).toHaveValue(
    '<p>from <strong>parent</strong></p>',
  )
  expect(await modelValue(page)).toBe(
    '<p>from <strong>parent</strong></p><img src=x onerror=alert(1)>',
  )
})

test('loading or setting a value that normalizes differently emits no update', async ({ page }) => {
  await open(page, `?content=${encodeURIComponent('<b>loaded</b>')}`)
  await expect(editor(page).locator('strong')).toHaveText('loaded')
  await page.evaluate(() => {
    window.setModel('plain text')
  })
  await expect(editor(page)).toHaveText('plain text')
  expect(await modelValue(page)).toBe('plain text')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(model(page)).toHaveText('<p>plain text!</p>')
})

test('typing in the middle keeps the caret through the v-model round trip', async ({ page }) => {
  await open(page, '?content=<p>abcdef</p>')
  await editor(page).click()
  await page.keyboard.press('End')
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('ArrowLeft')
  }
  await page.keyboard.type('XYZ', { delay: 30 })
  await expect(model(page)).toHaveText('<p>abcXYZdef</p>')
  await page.keyboard.press('Enter')
  await page.keyboard.type('next')
  await expect(model(page)).toHaveText('<p>abcXYZ</p><p>nextdef</p>')
})

test('a parent echoing the typed value later leaves the DOM and caret in place', async ({
  page,
}) => {
  await open(page, '?content=<p>abcdef</p>&echoDelay=50')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  const paragraph = await editor(page).locator('p').elementHandle()
  await page.keyboard.type('Q')
  await expect(model(page)).toHaveText('<p>abcdQef</p>')
  expect(await paragraph.evaluate((element) => element.isConnected)).toBe(true)
  await page.keyboard.type('R')
  await expect(model(page)).toHaveText('<p>abcdQRef</p>')
})

test('readonly toggle blocks and then allows editing', async ({ page }) => {
  await open(page, '?content=<p>abc</p>&readonly')
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(editor(page)).toHaveText('abc')
  await expect(editor(page).locator('strong')).toHaveCount(0)
  expect(await modelValue(page)).toBe('<p>abc</p>')

  await page.locator('#toggle-readonly').click()
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'false')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('d')
  await expect(model(page)).toHaveText('<p>abcd</p>')

  await page.locator('#toggle-readonly').click()
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await editor(page).click()
  await page.keyboard.type('z')
  await expect(model(page)).toHaveText('<p>abcd</p>')
})

test("clearing the content sets the model to ''", async ({ page }) => {
  await open(page, '?content=<p>abc</p><p>def</p>')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(model(page)).toHaveText('')
  expect(await modelValue(page)).toBe('')
  await page.keyboard.type('new')
  await expect(model(page)).toHaveText('<p>new</p>')
})

test('emits focus and blur', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.locator('#toggle-readonly').focus()
  await expect.poll(async () => page.evaluate(() => window.focusEvents)).toEqual(['focus', 'blur'])
})

test('Tab reaches a readonly editor and it stays readonly', async ({ page }) => {
  await open(page, '?readonly&content=<p>read me</p>')
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await page.locator('body').focus()
  await page.keyboard.press('Tab')
  await expect(editor(page)).toBeFocused()
  await page.keyboard.type('x')
  await expect(editor(page)).toHaveText('read me')
})
