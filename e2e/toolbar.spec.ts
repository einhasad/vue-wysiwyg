import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

const ALL_MODULES = 'bold,italic,underline,heading,lists,link,history'
const HEADING_OPTIONS = encodeURIComponent(JSON.stringify({ heading: { levels: [2, 3] } }))

const open = async (
  page: Page,
  content = '<p>hello world</p>',
  { modules = ALL_MODULES, extra = '' }: { modules?: string; extra?: string } = {},
): Promise<void> => {
  await page.goto(
    `/e2e/fixture-theme/index.html?modules=${modules}&options=${HEADING_OPTIONS}&content=${encodeURIComponent(content)}${extra}`,
  )
  await page.waitForSelector('body[data-ready=true]')
}

const editorBox = (page: Page): Locator => page.getByRole('textbox', { name: 'Editor' })
const toolbar = (page: Page): Locator => page.getByRole('toolbar', { name: 'Formatting' })
const tool = (page: Page, name: string): Locator =>
  toolbar(page).getByRole('button', { name, exact: true })
const html = async (page: Page): Promise<string> => page.evaluate(() => window.editor.getHTML())

const selectText = async (
  page: Page,
  selector: string,
  start: number,
  end: number,
  child = 0,
): Promise<void> => {
  await editorBox(page).focus()
  await page.evaluate(
    ([target, index, from, to]) => {
      const text = window.editor.root.querySelector(target)?.childNodes[index] as Text
      document.getSelection()?.setBaseAndExtent(text, from, text, to)
    },
    [selector, child, start, end] as const,
  )
}

const expectNoAxeViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).include('#app').analyze()
  expect(results.violations.map(({ id, nodes }) => `${id}: ${String(nodes.length)}`)).toEqual([])
}

test.describe('toolbar', () => {
  test('shows buttons only for the editor modules and heading levels', async ({ page }) => {
    await open(page)
    await expect
      .poll(async () =>
        toolbar(page)
          .getByRole('button')
          .evaluateAll((buttons) =>
            buttons.map((button) => getComputedStyle(button, '::before').content),
          ),
      )
      .toEqual(['"B"', '"I"', '"U"', '"H2"', '"H3"', '"•"', '"1."', '"↗"', '"↶"', '"↷"'])
    await open(page, '<p>a</p>', { modules: 'bold' })
    await expect(toolbar(page).getByRole('button')).toHaveCount(1)
    await expect(tool(page, 'Bold')).toBeVisible()
  })

  test('Tab reaches the toolbar once, arrows Home and End move inside it', async ({ page }) => {
    await open(page)
    await page.locator('#before').focus()
    await page.keyboard.press('Tab')
    await expect(tool(page, 'Bold')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(editorBox(page)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(tool(page, 'Bold')).toBeFocused()

    for (const [key, name] of [
      ['ArrowRight', 'Italic'],
      ['ArrowRight', 'Underline'],
      ['ArrowLeft', 'Italic'],
      ['End', 'Redo'],
      ['ArrowRight', 'Bold'],
      ['ArrowLeft', 'Redo'],
      ['Home', 'Bold'],
    ] as const) {
      await page.keyboard.press(key)
      await expect(tool(page, name)).toBeFocused()
    }
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+Tab')
    await expect(page.locator('#before')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(tool(page, 'Italic')).toBeFocused()
    await expect(toolbar(page).locator('[tabindex="0"]')).toHaveCount(1)
  })

  test('Alt+F10 focuses the toolbar and Escape returns to the caret', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 5, 5)
    await page.keyboard.press('Alt+F10')
    await expect(tool(page, 'Bold')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(editorBox(page)).toBeFocused()
    await page.keyboard.type(',')
    await expect.poll(async () => html(page)).toBe('<p>hello, world</p>')

    await page.keyboard.press('Alt+F10')
    await expect(tool(page, 'Italic')).toBeFocused()
  })

  test('applies formatting by mouse and by keyboard on the editor selection', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 0, 5)
    await tool(page, 'Bold').click()
    await expect.poll(async () => html(page)).toBe('<p><strong>hello</strong> world</p>')
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true')

    await selectText(page, 'p', 1, 6, 1)
    await page.keyboard.press('Alt+F10')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect.poll(async () => html(page)).toBe('<p><strong>hello</strong> <em>world</em></p>')
    await expect(editorBox(page)).toBeFocused()

    await page.keyboard.press('Alt+F10')
    await expect(tool(page, 'Italic')).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Space')
    await expect.poll(async () => html(page)).toBe('<p><strong>hello</strong> world</p>')
  })

  test('aria-pressed follows the caret', async ({ page }) => {
    await open(page, '<p><strong>bold</strong> plain</p><h2>title</h2>')
    await editorBox(page).locator('strong').click()
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool(page, 'Heading 2')).toHaveAttribute('aria-pressed', 'false')
    await editorBox(page).locator('h2').click()
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'false')
    await expect(tool(page, 'Heading 2')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Home')
    await expect(tool(page, 'Heading 2')).toHaveAttribute('aria-pressed', 'false')
    await expect(tool(page, 'Undo')).not.toHaveAttribute('aria-pressed')
  })

  test('readonly disables every button', async ({ page }) => {
    await open(page, '<p>locked</p>', { extra: '&readonly' })
    for (const button of await toolbar(page).getByRole('button').all()) {
      await expect(button).toHaveAttribute('aria-disabled', 'true')
    }
    await selectText(page, 'p', 0, 3)
    await tool(page, 'Bold').click({ force: true })
    expect(await html(page)).toBe('<p>locked</p>')
  })
})

test.describe('link popover', () => {
  const REL = 'rel="noopener noreferrer nofollow"'

  test('adds a link from the toolbar and rejects unsafe urls', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 0, 5)
    await tool(page, 'Link').click()
    const url = page.getByRole('textbox', { name: 'URL' })
    await expect(url).toBeFocused()

    await url.fill('javascript:alert(1)')
    await url.press('Enter')
    await expect(page.getByRole('alert')).toHaveText('Enter a valid, safe URL')
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    expect(await html(page)).toBe('<p>hello world</p>')

    await url.fill('https://example.com')
    await url.press('Enter')
    await expect(url).toBeHidden()
    await expect(editorBox(page)).toBeFocused()
    await expect
      .poll(async () => html(page))
      .toBe(`<p><a href="https://example.com" ${REL}>hello</a> world</p>`)
    await expect(tool(page, 'Link')).toHaveAttribute('aria-pressed', 'true')
  })

  test('inserts the url as linked text at a collapsed caret', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 6, 6)
    await page.keyboard.press('ControlOrMeta+k')
    const url = page.getByRole('textbox', { name: 'URL' })
    await url.fill('https://caret.example')
    await url.press('Enter')
    await expect
      .poll(async () => html(page))
      .toBe(`<p>hello <a href="https://caret.example" ${REL}>https://caret.example</a>world</p>`)
    await expect(editorBox(page)).toBeFocused()
  })

  test('a bare domain gets https:// and a relative path stays relative', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 0, 5)
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('textbox', { name: 'URL' }).fill('example.com')
    await page.keyboard.press('Enter')
    await expect.poll(async () => html(page)).toContain('href="https://example.com"')
    await selectText(page, 'p', 1, 1, 1)
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('textbox', { name: 'URL' }).fill('/docs/page')
    await page.keyboard.press('Enter')
    await expect.poll(async () => html(page)).toContain('href="/docs/page"')
  })

  test('one undo removes the url inserted and linked at a collapsed caret', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 6, 6)
    await page.keyboard.press('ControlOrMeta+k')
    const url = page.getByRole('textbox', { name: 'URL' })
    await url.fill('https://caret.example')
    await url.press('Enter')
    await expect.poll(async () => html(page)).toContain('https://caret.example</a>')
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => html(page)).toBe('<p>hello world</p>')
  })

  test('Alt+F10 without toolbar buttons keeps the focus in the editor', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, '<p>hello world</p>', { modules: 'placeholder' })
    await expect(toolbar(page).getByRole('button')).toHaveCount(0)
    await editorBox(page).click()
    await page.keyboard.press('Alt+F10')
    await expect(editorBox(page)).toBeFocused()
    expect(errors).toEqual([])
  })

  test('edits and removes a link with Mod+K, Escape cancels', async ({ page }) => {
    await open(page, `<p><a href="https://old.example">site</a> text</p>`)
    await editorBox(page).locator('a').click()
    await page.keyboard.press('ControlOrMeta+k')
    const url = page.getByRole('textbox', { name: 'URL' })
    await expect(url).toHaveValue('https://old.example')
    await page.keyboard.press('Escape')
    await expect(url).toBeHidden()
    await expect(editorBox(page)).toBeFocused()

    await page.keyboard.press('ControlOrMeta+k')
    await url.fill('https://new.example')
    await url.press('Enter')
    await expect
      .poll(async () => html(page))
      .toBe(`<p><a href="https://new.example" ${REL}>site</a> text</p>`)

    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('button', { name: 'Remove link' }).click()
    await expect.poll(async () => html(page)).toBe('<p>site text</p>')
  })

  test('opens from the keyboard toolbar and keeps the selection', async ({ page }) => {
    await open(page)
    await selectText(page, 'p', 6, 11)
    await page.keyboard.press('Alt+F10')
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(tool(page, 'Link')).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.type('https://kb.example')
    await page.keyboard.press('Enter')
    await expect
      .poll(async () => html(page))
      .toBe(`<p>hello <a href="https://kb.example" ${REL}>world</a></p>`)
  })
})

test.describe('accessibility', () => {
  test('has no axe violations in light, dark, readonly and with the link popover', async ({
    page,
  }) => {
    await open(page, '<p><strong>hello</strong> world</p>')
    await expectNoAxeViolations(page)

    await open(page, '<p>hello world</p>', { extra: '&theme=vw-dark' })
    await expectNoAxeViolations(page)

    await open(page, '<p>hello world</p>', { extra: '&readonly' })
    await expectNoAxeViolations(page)

    await open(page)
    await selectText(page, 'p', 0, 5)
    await tool(page, 'Link').click()
    await expectNoAxeViolations(page)
    const url = page.getByRole('textbox', { name: 'URL' })
    await url.fill('javascript:alert(1)')
    await url.press('Enter')
    await expect(page.getByRole('alert')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('has no axe violations with the system dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await open(page, '<p><strong>hello</strong> world</p>', {
      modules: `${ALL_MODULES},placeholder`,
    })
    await expectNoAxeViolations(page)
    const background = await editorBox(page).evaluate(
      (element) => getComputedStyle(element.closest('.vw-editor') as Element).backgroundColor,
    )
    expect(background).toBe('rgb(13, 17, 23)')
  })
})
