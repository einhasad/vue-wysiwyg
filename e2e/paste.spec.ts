import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

const fixture = (name: string): string =>
  readFileSync(new URL(`../src/__tests__/modules/paste/fixtures/${name}`, import.meta.url), 'utf8')

const REL = 'rel="noopener noreferrer nofollow"'
const MODULES = 'bold,italic,underline,heading,lists,link,paste'

const open = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/e2e/fixture/index.html?modules=${MODULES}&content=<p>x</p>${query}`)
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
}

const output = (page: Page): Locator => page.locator('#output')

const caretAfterFirstText = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const text = window.editor.root.querySelector('p')?.firstChild as Node
    document.getSelection()?.collapse(text, 1)
  })
}

const pasteData = async (
  page: Page,
  data: Record<string, string>,
  type: 'paste' | 'drop' = 'paste',
): Promise<void> => {
  await caretAfterFirstText(page)
  await page.evaluate(
    ([entries, eventType]) => {
      const transfer = new DataTransfer()
      for (const [mime, value] of Object.entries(entries)) {
        transfer.setData(mime, value)
      }
      const paragraph = window.editor.root.querySelector('p') as HTMLElement
      const range = document.createRange()
      range.selectNodeContents(paragraph)
      const { right, top, height } = range.getBoundingClientRect()
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX: right - 1,
        clientY: top + height / 2,
      })
      Object.defineProperty(event, eventType === 'paste' ? 'clipboardData' : 'dataTransfer', {
        value: transfer,
      })
      paragraph.dispatchEvent(event)
    },
    [data, type] as const,
  )
}

test('pastes Word html as clean lists and marks', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/html': fixture('word-windows.html.txt') })
  await expect(output(page)).toHaveText(
    '<p>x</p>' +
      '<p>Intro with <strong>bold</strong>, <em>italic</em> and <strong><em>both</em></strong></p>' +
      '<ul><li>First bullet<ul><li>Nested bullet</li></ul></li><li>Second <strong>bullet</strong></li></ul>' +
      '<p><br></p>' +
      '<ol><li>Step one</li><li>Step two</li></ol>' +
      `<p>Closing <strong>words</strong> <a href="https://example.com/doc" ${REL}>link</a></p>`,
  )
})

test('pastes Word for Mac nested lists', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/html': fixture('word-mac.html.txt') })
  await expect(output(page)).toHaveText(
    '<p>x</p><ol><li>Alpha<ol><li>Roman<ul><li>Deep bullet</li></ul></li></ol></li><li>Beta</li></ol>' +
      '<p>After list</p>',
  )
})

test('pastes Google Docs html without the bold wrapper', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/html': fixture('google-docs.html.txt') })
  await expect(output(page)).toHaveText(
    '<p>x</p><h2>Heading</h2>' +
      '<p>Plain <strong>bold</strong> <em>italic</em> <u><em><strong>all</strong></em></u> ' +
      `<a href="https://docs.example.com/x" ${REL}>site</a></p>` +
      '<ul><li>One<ul><li><strong>Nested</strong></li></ul></li><li>Two</li></ul>' +
      '<p><br></p><p>End</p>',
  )
})

test('pasted XSS html runs no script and keeps only allowed markup', async ({ page }) => {
  await open(page)
  await pasteData(page, {
    'text/html':
      '<b id="docs-internal-guid-1"><span style="font-weight:700" onclick="alert(1)">bold</span>' +
      '<img src=x onerror="alert(1)"><a href="javascript:alert(1)">js</a>' +
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span><svg><script>alert(1)</script></svg>item</p></b>' +
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  })
  await expect(output(page)).toHaveText(
    `<p>x</p><p><strong>bold</strong><a ${REL}>js</a></p><ol><li>item</li></ol>`,
  )
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.alerts)).toEqual([])
  expect(await page.locator('#editor [onclick], #editor img, #editor svg').count()).toBe(0)
})

test('pastes plain text with blank lines as paragraphs', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/plain': 'one\r\ntwo\r\n\r\n<b>three</b>' })
  await expect(output(page)).toHaveText('<p>x</p><p>one<br>two</p><p>&lt;b&gt;three&lt;/b&gt;</p>')
})

test('Mod-Shift-v pastes rich html as plain text', async ({ page }) => {
  await open(page)
  await caretAfterFirstText(page)
  await page.evaluate(() => {
    window.editor.root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true }),
    )
    const transfer = new DataTransfer()
    transfer.setData('text/html', '<strong>rich</strong>')
    transfer.setData('text/plain', 'rich')
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    window.editor.root.dispatchEvent(event)
  })
  await expect(output(page)).toHaveText('<p>xrich</p>')
})

test('pastes and drops a text/uri-list as a link', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/uri-list': 'https://a.example/?q=1', 'text/plain': 'ignored' })
  await expect(output(page)).toHaveText(
    `<p>x<a href="https://a.example/?q=1" ${REL}>https://a.example/?q=1</a></p>`,
  )
  await page.evaluate(() => {
    window.editor.setHTML('<p>x</p>')
  })
  await pasteData(page, { 'text/uri-list': 'https://b.example' }, 'drop')
  await expect(output(page)).toHaveText(
    `<p>x<a href="https://b.example" ${REL}>https://b.example</a></p>`,
  )
})

test('a javascript: text/uri-list is pasted as text only', async ({ page }) => {
  await open(page)
  await pasteData(page, { 'text/uri-list': 'javascript:alert(1)', 'text/plain': 'plain' })
  await expect(output(page)).toHaveText('<p>xplain</p>')
  expect(await page.locator('#editor a').count()).toBe(0)
})

test('link command links the selection and rejects javascript: urls', async ({ page }) => {
  await open(page, '&options={"link":{"target":"_blank"}}')
  const results = await page.evaluate(() => {
    const text = window.editor.root.querySelector('p')?.firstChild as Node
    document.getSelection()?.setBaseAndExtent(text, 0, text, 1)
    return [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' java\tscript:alert(1)',
      'data:text/html,x',
      '//evil.example',
    ].map((url) => window.editor.exec('link', url))
  })
  expect(results).toEqual([false, false, false, false, false])
  await expect(output(page)).toHaveText('<p>x</p>')
  expect(await page.evaluate(() => window.editor.exec('link', 'https://a.example'))).toBe(true)
  await expect(output(page)).toHaveText(
    `<p><a href="https://a.example" ${REL} target="_blank">x</a></p>`,
  )
  expect(await page.evaluate(() => window.editor.isActive('link'))).toBe(true)
  expect(await page.evaluate(() => window.editor.exec('link', null))).toBe(true)
  await expect(output(page)).toHaveText('<p>x</p>')
})

test('beforeinput insertLink is routed to the link command', async ({ page }) => {
  await open(page)
  await page.evaluate(() => {
    const text = window.editor.root.querySelector('p')?.firstChild as Node
    document.getSelection()?.setBaseAndExtent(text, 0, text, 1)
    for (const data of ['javascript:alert(1)', 'https://a.example']) {
      window.editor.root.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertLink',
          data,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  })
  await expect(output(page)).toHaveText(`<p><a href="https://a.example" ${REL}>x</a></p>`)
})

test('a pasted spreadsheet table keeps its rows and cell boundaries', async ({ page }) => {
  await open(page)
  await pasteData(page, {
    'text/html':
      '<table><tr><td class=xl65>a1</td><td>b1</td></tr><tr><td>a2</td><td></td><td>c2</td></tr></table>',
    'text/plain': 'a1\tb1\na2\t\tc2',
  })
  await expect(output(page)).toHaveText('<p>x</p><p>a1\tb1</p><p>a2\t\tc2</p>')
})
