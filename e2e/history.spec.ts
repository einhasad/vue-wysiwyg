import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page): Promise<void> => {
  await page.goto('/e2e/fixture/index.html?modules=history,bold')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
}

const output = (page: Page): Locator => page.locator('#output')
const editor = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })
const selectedText = async (page: Page): Promise<string> =>
  page.evaluate(() => document.getSelection()?.toString() ?? '')

const dispatchHistoryInput = async (page: Page, inputType: string): Promise<boolean> =>
  page.evaluate((type) => {
    const event = new InputEvent('beforeinput', {
      inputType: type,
      bubbles: true,
      cancelable: true,
    })
    window.editor.root.dispatchEvent(event)
    return event.defaultPrevented
  }, inputType)

test('undo and redo typing and a mark toggle and keep the caret in the text', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(output(page)).toHaveText('<p><strong>abc</strong></p>')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  expect(await selectedText(page)).toBe('abc')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('')

  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  expect(await selectedText(page)).toBe('abc')

  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('d')
  await expect(output(page)).toHaveText('<p>abcd</p>')
  await expect(editor(page)).toBeFocused()
})

test('redo of a mark toggle restores the mark and its selection', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(output(page)).toHaveText('<p>a<strong>bc</strong></p>')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(output(page)).toHaveText('<p>a<strong>bc</strong></p>')
  expect(await selectedText(page)).toBe('bc')

  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('d')
  await expect(output(page)).toHaveText('<p>a<strong>bcd</strong></p>')
})

test('a pause splits typing into separate steps', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.waitForTimeout(700)
  await page.keyboard.type('def')
  await expect(output(page)).toHaveText('<p>abcdef</p>')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  await page.keyboard.type('x')
  await expect(output(page)).toHaveText('<p>abcx</p>')
})

test('Ctrl and Cmd shortcuts both undo and redo', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('Control+z')
  await expect(output(page)).toHaveText('')
  await page.keyboard.press('Control+Shift+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  await page.keyboard.press('Meta+z')
  await expect(output(page)).toHaveText('')
  await page.keyboard.press('Meta+Shift+z')
  await expect(output(page)).toHaveText('<p>abc</p>')
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Control+y')
  await expect(output(page)).toHaveText('<p>abc</p>')
})

test('beforeinput historyUndo and historyRedo are routed to the history', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await expect(output(page)).toHaveText('<p>abc</p>')

  expect(await dispatchHistoryInput(page, 'historyUndo')).toBe(true)
  await expect(output(page)).toHaveText('')
  expect(await dispatchHistoryInput(page, 'historyRedo')).toBe(true)
  await expect(output(page)).toHaveText('<p>abc</p>')
})

test('readonly blocks undo from keys and beforeinput', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('abc')
  await expect(output(page)).toHaveText('<p>abc</p>')
  await page.evaluate(() => {
    window.editor.setReadonly(true)
  })

  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await page.evaluate(() => {
    window.editor.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
    )
  })
  expect(await dispatchHistoryInput(page, 'historyUndo')).toBe(true)
  await expect(editor(page)).toHaveText('abc')
  expect(await page.evaluate(() => window.editor.getHTML())).toBe('<p>abc</p>')

  await page.evaluate(() => {
    window.editor.setReadonly(false)
  })
  expect(await dispatchHistoryInput(page, 'historyUndo')).toBe(true)
  await expect(output(page)).toHaveText('')
})

test('an outside replacement after a Backspace that changed nothing clears the history', async ({
  page,
}) => {
  await page.goto(
    `/e2e/fixture/index.html?modules=history,bold&content=${encodeURIComponent('<p>record A</p>')}`,
  )
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  await editor(page).click()
  await page.evaluate(() => {
    document.getSelection()?.collapse(window.editor.root.querySelector('p')?.firstChild ?? null, 0)
  })
  await page.keyboard.press('Backspace')
  await expect(output(page)).toHaveText('<p>record A</p>')
  await page.evaluate(async () => new Promise((resolve) => setTimeout(resolve)))
  await page.evaluate(() => {
    window.editor.setHTML('<p>record B</p>')
  })
  expect(await page.evaluate(() => window.editor.can('undo'))).toBe(false)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(output(page)).toHaveText('<p>record B</p>')
})
