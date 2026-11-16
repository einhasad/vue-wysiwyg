import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/e2e/fixture/index.html?modules=heading,lists${query}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
}

const output = (page: Page): Locator => page.locator('#output')
const editor = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })

const exec = async (page: Page, command: string, arg?: number): Promise<boolean> =>
  page.evaluate(
    ([name, value]) =>
      (window.editor.exec as (name: string, arg?: unknown) => boolean)(name, value),
    [command, arg] as const,
  )

test('the bullet list command turns typed lines into a list and Enter adds items', async ({
  page,
}) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('one')
  expect(await exec(page, 'bulletList')).toBe(true)
  await page.keyboard.type('!')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(output(page)).toHaveText('<ul><li>one!</li><li>two</li></ul>')
})

test('Enter twice exits the list into a paragraph', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('one')
  await exec(page, 'orderedList')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('after')
  await expect(output(page)).toHaveText('<ol><li>one</li></ol><p>after</p>')
})

test('Tab nests an item and Shift+Tab moves it back', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('one')
  await exec(page, 'bulletList')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await page.keyboard.press('Tab')
  await expect(output(page)).toHaveText('<ul><li>one<ul><li>two</li></ul></li></ul>')
  await page.keyboard.type('!')
  await expect(output(page)).toHaveText('<ul><li>one<ul><li>two!</li></ul></li></ul>')
  await page.keyboard.press('Shift+Tab')
  await expect(output(page)).toHaveText('<ul><li>one</li><li>two!</li></ul>')
  await expect(editor(page)).toBeFocused()
})

test('Tab in the first item leaves the editor and keeps the list', async ({ page }) => {
  await open(page, '&content=<ul><li>one</li></ul>')
  await editor(page).click()
  await page.keyboard.press('Tab')
  await expect(editor(page)).not.toBeFocused()
  await expect(output(page)).toHaveText('<ul><li>one</li></ul>')
})

test('a heading toggled into a list and back stays a heading', async ({ page }) => {
  await open(page, '&content=<h2>title</h2><p>text</p>')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await exec(page, 'bulletList')
  await expect(output(page)).toHaveText('<ul><li>title</li><li>text</li></ul>')
  await exec(page, 'bulletList')
  await expect(output(page)).toHaveText('<h2>title</h2><p>text</p>')
})

test('lists with one type offer only its command', async ({ page }) => {
  await open(
    page,
    `&options=${encodeURIComponent('{"lists":{"types":["ol"]}}')}&content=<ul><li>a</li></ul>`,
  )
  await expect(output(page)).toHaveText('<ol><li>a</li></ol>')
  expect(await page.evaluate(() => window.editor.commands)).not.toContain('bulletList')
})

test('Backspace at the start of the first item lifts it out of the list', async ({ page }) => {
  await open(page, '&content=<ul><li>one</li><li>two</li></ul>')
  await editor(page).click()
  await page.evaluate(() => {
    const text = window.editor.root.querySelector('li')?.firstChild as Node
    document.getSelection()?.collapse(text, 0)
  })
  await page.keyboard.press('Backspace')
  await expect(output(page)).toHaveText('<p>one</p><ul><li>two</li></ul>')
  await page.keyboard.type('x')
  await expect(output(page)).toHaveText('<p>xone</p><ul><li>two</li></ul>')
})

test('the list commands switch, toggle and report the active type', async ({ page }) => {
  await open(page, '&content=<p>a</p><p>b</p>')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await exec(page, 'bulletList')
  await expect(output(page)).toHaveText('<ul><li>a</li><li>b</li></ul>')
  await exec(page, 'orderedList')
  await expect(output(page)).toHaveText('<ol><li>a</li><li>b</li></ol>')
  expect(await page.evaluate(() => window.editor.isActive('orderedList'))).toBe(true)
  await exec(page, 'orderedList')
  await expect(output(page)).toHaveText('<p>a</p><p>b</p>')
})

test('the heading command and Mod+Alt+digit toggle a heading', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('Title')
  expect(await exec(page, 'heading', 2)).toBe(true)
  await expect(output(page)).toHaveText('<h2>Title</h2>')
  expect(await page.evaluate(() => window.editor.isActive('heading', 2))).toBe(true)
  await exec(page, 'heading', 2)
  await expect(output(page)).toHaveText('<p>Title</p>')
  await page.keyboard.press('ControlOrMeta+Alt+Digit3')
  await expect(output(page)).toHaveText('<h3>Title</h3>')
  await page.keyboard.type('!')
  await expect(output(page)).toHaveText('<h3>Title!</h3>')
  await page.keyboard.press('ControlOrMeta+Alt+Digit3')
  await expect(output(page)).toHaveText('<p>Title!</p>')
})

test('Enter at the end of a heading starts a paragraph', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('Title')
  await exec(page, 'heading', 1)
  await page.keyboard.press('Enter')
  await page.keyboard.type('text')
  await expect(output(page)).toHaveText('<h1>Title</h1><p>text</p>')
})
