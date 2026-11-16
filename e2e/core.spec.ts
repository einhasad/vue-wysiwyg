import { expect, test, type Locator, type Page } from '@playwright/test'

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/e2e/fixture/index.html${query}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
}

const output = (page: Page): Locator => page.locator('#output')
const editor = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })

const paste = async (page: Page, data: Record<string, string>): Promise<void> => {
  await page.evaluate((entries) => {
    const transfer = new DataTransfer()
    for (const [type, value] of Object.entries(entries)) {
      transfer.setData(type, value)
    }
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.editor.root.dispatchEvent(event)
  }, data)
}

test('typing creates a paragraph', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('Hello world')
  await expect(output(page)).toHaveText('<p>Hello world</p>')
})

test('Enter creates a new paragraph', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await expect(output(page)).toHaveText('<p>one</p><p>two</p>')
})

test('Shift+Enter inserts a line break', async ({ page }) => {
  await open(page)
  await editor(page).click()
  await page.keyboard.type('one')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('two')
  await expect(output(page)).toHaveText('<p>one<br>two</p>')
})

test('Mod-b and Mod-i toggle marks on the selection', async ({ page }) => {
  await open(page, '?modules=bold,italic')
  await editor(page).click()
  await page.keyboard.type('abc')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(output(page)).toHaveText('<p><strong>abc</strong></p>')
  await page.keyboard.press('ControlOrMeta+i')
  await expect(output(page)).toHaveText('<p><strong><em>abc</em></strong></p>')
  await page.keyboard.press('ControlOrMeta+b')
  await expect(output(page)).toHaveText('<p><em>abc</em></p>')
  await page.keyboard.press('End')
  await page.keyboard.type('d')
  await expect(output(page)).toContainText('d')
})

test('pasting malicious HTML yields clean output and runs no script', async ({ page }) => {
  await open(page, '?modules=bold,italic&content=<p>x</p>')
  await editor(page).click()
  await page.keyboard.press('End')
  await paste(page, {
    'text/html':
      '<b onclick="alert(1)">bold</b><img src=x onerror=alert(2)><svg><script>alert(3)</script></svg>' +
      '<a href="javascript:alert(5)">link</a><iframe srcdoc="<script>alert(6)</script>"></iframe>' +
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(4)>',
  })
  await expect(output(page)).toHaveText('<p>x<strong>bold</strong>link</p>')
  await expect(
    page.locator('#editor img, #editor svg, #editor script, #editor iframe'),
  ).toHaveCount(0)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.alerts)).toEqual([])
})

test('pasting plain text keeps markup as text', async ({ page }) => {
  await open(page, '?content=<p>x</p>')
  await editor(page).click()
  await page.keyboard.press('End')
  await paste(page, { 'text/plain': '<img src=x onerror=alert(1)>' })
  await expect(output(page)).toHaveText('<p>x&lt;img src=x onerror=alert(1)&gt;</p>')
})

test('readonly blocks typing, marks and undo', async ({ page }) => {
  await open(page, '?modules=bold&readonly&content=<p>abc</p>')
  await expect(editor(page)).toHaveAttribute('aria-readonly', 'true')
  await editor(page).click()
  await page.keyboard.type('zzz')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+b')
  await page.keyboard.press('ControlOrMeta+z')
  await paste(page, { 'text/plain': 'pasted' })
  await expect(output(page)).toHaveText('<p>abc</p>')
  expect(await page.evaluate(() => window.editor.root.innerHTML)).toBe('<p>abc</p>')
})

test('deleting all content yields an empty string', async ({ page }) => {
  await open(page, '?content=<p>abc</p>')
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(output(page)).toHaveText('')
  expect(await page.evaluate(() => window.editor.isEmpty())).toBe(true)
  await page.keyboard.type('a')
  await expect(output(page)).toHaveText('<p>a</p>')
})

test('synthetic composition leaves the DOM untouched until it ends', async ({ page }) => {
  await open(page, '?content=<p>ab</p>')
  const result = await page.evaluate(() => {
    const root = window.editor.root
    const text = root.querySelector('p')?.firstChild as Text
    root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    text.data = 'abか'
    const loose = document.createTextNode('ime')
    root.append(loose)
    root.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        isComposing: true,
        inputType: 'insertCompositionText',
      }),
    )
    const during = root.innerHTML
    const sameDuring = root.querySelector('p')?.firstChild === text && loose.parentNode === root
    root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'か' }))
    return {
      during,
      sameDuring,
      sameAfter: root.querySelector('p')?.firstChild === text,
      after: root.innerHTML,
    }
  })
  expect(result).toEqual({
    during: '<p>abか</p>ime',
    sameDuring: true,
    sameAfter: true,
    after: '<p>abか</p><p>ime</p>',
  })
})

test('IME composition through CDP commits text', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP Input.imeSetComposition is Chromium only')
  await open(page)
  await editor(page).click()
  const session = await page.context().newCDPSession(page)
  await session.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 })
  await session.send('Input.imeSetComposition', {
    text: 'にほ',
    selectionStart: 2,
    selectionEnd: 2,
  })
  await session.send('Input.insertText', { text: '日本' })
  await expect(output(page)).toHaveText('<p>日本</p>')
})

test('100k nested elements stay within the depth cap', async ({ page }) => {
  await open(page, '?modules=bold')
  const depth = await page.evaluate(() => {
    const count = 100_000
    window.editor.setHTML(`${'<strong>'.repeat(count)}x${'</strong>'.repeat(count)}`)
    let level = 0
    for (let node = window.editor.root.firstChild; node?.firstChild; node = node.firstChild) {
      level++
    }
    return { level, text: window.editor.root.textContent }
  })
  expect(depth.level).toBeLessThanOrEqual(129)
  expect(depth.text).toBe('x')
})

test('passes URL options to module factories by export name', async ({ page }) => {
  const options = { placeholder: { text: 'Type here' }, characterCount: { limit: 3 } }
  await open(
    page,
    `?modules=placeholder,character-count&options=${encodeURIComponent(JSON.stringify(options))}`,
  )
  await expect(editor(page)).toHaveAttribute('aria-placeholder', 'Type here')
  await editor(page).click()
  await page.keyboard.type('abcdef')
  await expect(output(page)).toHaveText('<p>abc</p>')
})
