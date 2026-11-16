import { expect, test, type Locator, type Page } from '@playwright/test'
import type * as CoreApi from '../src/index.js'
import type * as CharacterCountApi from '../src/modules/character-count.js'
import type * as PlaceholderApi from '../src/modules/placeholder.js'

interface SmallOptions {
  readonly content?: string
  readonly placeholder?: string
  readonly limit?: number
}

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/e2e/fixture/index.html${query}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
}

const mount = async (page: Page, options: SmallOptions): Promise<void> => {
  await open(page)
  await page.evaluate(async ({ content, placeholder, limit }) => {
    const load = async <T>(path: string): Promise<T> => (await import(path)) as T
    const core = await load<typeof CoreApi>('/src/index.ts')
    const placeholderModule = await load<typeof PlaceholderApi>('/src/modules/placeholder.ts')
    const characterCountModule = await load<typeof CharacterCountApi>(
      '/src/modules/character-count.ts',
    )
    const output = document.getElementById('output') as HTMLElement
    const element = window.editor.root
    window.editor.destroy()
    const editor = core.createEditor({
      element,
      content: content ?? '',
      label: 'Editor',
      modules: [
        placeholderModule.placeholder({ text: placeholder ?? '' }),
        characterCountModule.characterCount({ limit: limit ?? Infinity }),
      ],
    })
    editor.on('update', () => {
      output.textContent = editor.getHTML()
    })
    output.textContent = editor.getHTML()
    window.editor = editor
  }, options)
}

const output = (page: Page): Locator => page.locator('#output')
const editor = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })

const placeholderContent = async (page: Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(window.editor.root, '::before').content)

test('placeholder is visible only while the editor is empty', async ({ page }) => {
  await mount(page, { placeholder: 'Write here' })
  await page.addStyleTag({
    content: '[data-placeholder].is-empty::before { content: attr(data-placeholder) }',
  })
  const root = editor(page)
  await expect(root).toHaveAttribute('aria-placeholder', 'Write here')
  await expect(root).toHaveAttribute('data-placeholder', 'Write here')
  await expect(root).toHaveClass(/\bis-empty\b/)
  expect(await placeholderContent(page)).toBe('"Write here"')
  await root.click()
  await page.keyboard.type('a')
  await expect(output(page)).toHaveText('<p>a</p>')
  await expect(root).not.toHaveClass(/\bis-empty\b/)
  expect(await placeholderContent(page)).toBe('none')
  await page.keyboard.press('Backspace')
  await expect(output(page)).toHaveText('')
  await expect(root).toHaveClass(/\bis-empty\b/)
  expect(await placeholderContent(page)).toBe('"Write here"')
})

test('limit blocks typing beyond it and allows typing after a deletion', async ({ page }) => {
  await mount(page, { limit: 5 })
  await editor(page).click()
  await page.keyboard.type('abcdefgh')
  await expect(output(page)).toHaveText('<p>abcde</p>')
  await page.keyboard.press('Enter')
  await page.keyboard.type('x')
  await expect(output(page)).toHaveText('<p>abcde</p><p><br></p>')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('yz')
  await expect(output(page)).toHaveText('<p>abcdy</p>')
  expect(await page.evaluate(() => window.editor.textLength())).toBe(5)
})

test('limit truncates pasted html instead of dropping it', async ({ page }) => {
  await mount(page, { content: '<p>ab</p>', limit: 5 })
  await editor(page).click()
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.setData('text/html', '<p>cdef</p><p>gh</p>')
    transfer.setData('text/plain', 'cdef\ngh')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.editor.root.dispatchEvent(event)
  })
  await expect(output(page)).toHaveText('<p>ab</p><p>cde</p>')
})

test('limit reverts a synthetic composition that ends over it', async ({ page }) => {
  await mount(page, { content: '<p>ab</p>', limit: 3 })
  const result = await page.evaluate(() => {
    const root = window.editor.root
    const text = root.querySelector('p')?.firstChild as Text
    document.getSelection()?.collapse(text, 2)
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    text.data = 'abかな'
    root.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        isComposing: true,
        inputType: 'insertCompositionText',
      }),
    )
    const during = root.innerHTML
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'かな' }))
    return { during, after: root.innerHTML }
  })
  expect(result).toEqual({ during: '<p>abかな</p>', after: '<p>ab</p>' })
})

test('limit reverts an IME composition through CDP', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP Input.imeSetComposition is Chromium only')
  await mount(page, { content: '<p>ab</p>', limit: 3 })
  await editor(page).click()
  await page.keyboard.press('End')
  const session = await page.context().newCDPSession(page)
  await session.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await session.send('Input.imeSetComposition', {
    text: 'にほ',
    selectionStart: 2,
    selectionEnd: 2,
  })
  await session.send('Input.insertText', { text: '日本' })
  await expect(output(page)).toHaveText('<p>ab</p>')
  await session.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await session.send('Input.insertText', { text: '日' })
  await expect(output(page)).toHaveText('<p>ab日</p>')
})

test('Mod-u toggles underline on the selection', async ({ page }) => {
  await open(page, '?modules=underline')
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+u')
  await expect(output(page)).toHaveText('<p><u>abc</u></p>')
  await page.keyboard.press('ControlOrMeta+u')
  await expect(output(page)).toHaveText('<p>abc</p>')
})
