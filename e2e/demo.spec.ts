import { expect, test, type Locator, type Page } from '@playwright/test'

const DANGEROUS_MARKUP =
  /<(script|iframe|svg|img|form|button|style)\b|\s(on\w+|style|formaction)=|="?\s*javascript:/i

const pageErrors = (page: Page): string[] => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  return errors
}

const caretToEndOf = async (page: Page, label: string): Promise<void> => {
  const textbox = page.getByRole('textbox', { name: label })
  await textbox.click()
  await textbox.evaluate((root) => {
    let node: Node = root
    while (node.lastChild) {
      node = node.lastChild
    }
    const range = document.createRange()
    range.setStart(node, node instanceof Text ? node.length : 0)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
  })
}

const pasteInto = async (page: Page, label: string, html: string): Promise<void> => {
  await caretToEndOf(page, label)
  await page.getByRole('textbox', { name: label }).evaluate((root, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', value)
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    root.dispatchEvent(event)
  }, html)
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('renders both editors, the toolbar and the outputs without errors', async ({ page }) => {
  const errors = pageErrors(page)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('vue-wysiwyg v')
  await expect(page.getByRole('textbox', { name: 'Full editor' })).toContainText('Try it')
  await expect(page.getByRole('toolbar', { name: 'Formatting', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bold' }).first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Restricted editor' })).toContainText(
    'Allowed tags',
  )
  await expect(page.getByTestId('html-output')).toContainText('<h2>Try it</h2>')
  await expect(page.getByTestId('markdown-output')).toContainText('## Try it')
  await expect(page.getByTestId('character-count')).toHaveText(
    /^[1-9]\d* \/ 2000 characters, \d+ words?$/,
  )
  expect(errors).toEqual([])
})

test('typing updates the HTML pane, the Markdown pane and the character count', async ({
  page,
}) => {
  const count = page.getByTestId('character-count')
  const before = await count.textContent()
  await caretToEndOf(page, 'Full editor')
  await page.keyboard.type(' Typed in the demo')

  await expect(page.getByTestId('html-output')).toContainText(
    'documentation</a>. Typed in the demo</p>',
  )
  await expect(page.getByTestId('markdown-output')).toContainText('). Typed in the demo')
  await expect(count).not.toHaveText(before ?? '')
})

test('toolbar formatting reaches the Markdown pane', async ({ page }) => {
  await caretToEndOf(page, 'Full editor')
  await page.keyboard.press('Enter')
  await page.keyboard.type('strong words')
  await page.getByRole('textbox', { name: 'Full editor' }).evaluate((root) => {
    document.getSelection()?.selectAllChildren(root.lastElementChild as Element)
  })
  await page
    .getByRole('toolbar', { name: 'Formatting', exact: true })
    .getByRole('button', { name: 'Bold' })
    .click()

  await expect(page.getByTestId('html-output')).toContainText(
    '<p><strong>strong words</strong></p>',
  )
  await expect(page.getByTestId('markdown-output')).toContainText('**strong words**')
})

test('the XSS sample is pasted without scripts, handlers or unsafe URLs', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })

  await page.getByTestId('paste-xss').click()

  const output = page.getByTestId('xss-output')
  await expect(output).toContainText('Pasted <strong>bold</strong>')
  await expect(page.getByTestId('xss-input')).toContainText('<script>alert(5)</script>')
  expect(await output.textContent()).not.toMatch(DANGEROUS_MARKUP)
  expect(await page.getByTestId('html-output').textContent()).not.toMatch(DANGEROUS_MARKUP)

  const textbox = page.getByRole('textbox', { name: 'Full editor' })
  await expect(textbox.locator('script, iframe, svg, img, form, button, [style]')).toHaveCount(0)
  const unsafeAttributes = await textbox.evaluate((root) =>
    [...root.querySelectorAll('*')].flatMap((element) =>
      [...element.attributes]
        .filter(({ name, value }) => name.startsWith('on') || /javascript:/i.test(value))
        .map(({ name }) => name),
    ),
  )
  expect(unsafeAttributes).toEqual([])
  await page.waitForTimeout(300)
  expect(dialogs).toEqual([])
})

test('the character count says "1 word" for a single word', async ({ page }) => {
  const textbox = page.getByRole('textbox', { name: 'Full editor' })
  await textbox.click()
  await textbox.evaluate((root) => {
    document.getSelection()?.selectAllChildren(root)
  })
  await page.keyboard.press('Delete')
  await page.keyboard.type('Hello')

  await expect(page.getByTestId('character-count')).toHaveText('5 / 2000 characters, 1 word')
  await page.keyboard.type(' world')
  await expect(page.getByTestId('character-count')).toHaveText('11 / 2000 characters, 2 words')
})

test('readonly blocks typing and pasting', async ({ page }) => {
  const toggle = page.getByTestId('readonly-toggle')
  const textbox = page.getByRole('textbox', { name: 'Full editor' })
  const html = page.getByTestId('html-output')
  const before = await html.textContent()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(textbox).toHaveAttribute('aria-readonly', 'true')
  await expect(page.getByTestId('paste-xss')).toBeDisabled()
  await textbox.click()
  await page.keyboard.type('blocked')
  await expect(html).toHaveText(before ?? '')

  await toggle.click()
  await expect(textbox).not.toHaveAttribute('aria-readonly', 'true')
})

test('dark mode switches the page and the editors', async ({ page }) => {
  const toggle = page.getByTestId('dark-mode-toggle')
  const editors = page.locator('.vw-editor')
  const pressed = (await toggle.getAttribute('aria-pressed')) === 'true'

  await toggle.click()
  const scheme = pressed ? 'light' : 'dark'
  await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
  await expect(editors).toHaveCount(2)
  for (const editor of await editors.all()) {
    await expect(editor).toHaveClass(new RegExp(`\\bvw-${scheme}\\b`))
  }
})

test('the restricted editor keeps only p, strong, em, ul/li and h2', async ({ page }) => {
  await pasteInto(
    page,
    'Restricted editor',
    '<h3>Sub</h3><ol><li>first</li></ol><p><u>under</u> <a href="https://example.com">link</a> <em>kept</em></p><table><tr><td>cell</td></tr></table>',
  )

  const output = page.getByTestId('restricted-html-output')
  await expect(output).toContainText('<em>kept</em>')
  const html = (await output.textContent()) ?? ''
  const tags = new Set([...html.matchAll(/<([a-z][a-z0-9]*)/g)].map(([, tag]) => tag))
  expect(
    [...tags].filter((tag) => !['p', 'strong', 'em', 'ul', 'li', 'h2'].includes(tag ?? '')),
  ).toEqual([])
  expect(html).toContain('<li>first</li>')
  expect(html).toContain('cell')
})

test('the restricted demo uses the public bullet-only lists option', async ({ page }) => {
  const section = page.getByRole('region', { name: 'Restricted schema with a custom toolbar' })
  await expect(section).toContainText("lists({ types: ['ul'] })")
  await expect(section).not.toContainText('module renames ol to ul')
  await expect(page.getByRole('textbox', { name: 'Restricted editor' })).not.toContainText(
    /Steel bumper|LED light bar|Standard build/,
  )
})

const restrictedToolbar = (page: Page): Locator =>
  page.getByRole('group', { name: 'Restricted formatting' })

test('the custom toolbar turns a paragraph into h2 in the restricted editor', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Restricted editor' }).getByText('Only').click()
  const h2 = restrictedToolbar(page).getByRole('button', { name: 'Heading 2', exact: true })
  await expect(h2).toHaveAttribute('aria-pressed', 'false')
  await h2.click()

  await expect(h2).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('restricted-html-output')).toContainText(
    '<h2>Only <strong>p</strong>',
  )
})

test('the custom toolbar is a group of plain tab stops, not a toolbar widget', async ({
  page,
  browserName,
}) => {
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'
  await expect(page.getByRole('toolbar', { name: 'Restricted formatting' })).toHaveCount(0)
  const buttons = restrictedToolbar(page).getByRole('button')
  await expect(buttons).toHaveText(['Bold', 'Italic', 'Heading 2', 'List', 'Undo', 'Redo'])
  for (const button of await buttons.all()) {
    await expect(button).not.toHaveAttribute('tabindex', '-1')
  }

  await buttons.first().focus()
  const focused = [await page.evaluate(() => document.activeElement?.textContent)]
  for (let step = 1; step < 6; step++) {
    await page.keyboard.press(tab)
    focused.push(await page.evaluate(() => document.activeElement?.textContent))
  }
  expect(focused).toEqual(['Bold', 'Italic', 'Heading 2', 'List', 'Undo', 'Redo'])
})

test('the custom toolbar marks Undo and Redo aria-disabled from editor.can()', async ({ page }) => {
  const undo = restrictedToolbar(page).getByRole('button', { name: 'Undo' })
  const redo = restrictedToolbar(page).getByRole('button', { name: 'Redo' })
  await expect(undo).toHaveAttribute('aria-disabled', 'true')
  await expect(redo).toHaveAttribute('aria-disabled', 'true')
  await expect(restrictedToolbar(page).getByRole('button', { name: 'Bold' })).toHaveAttribute(
    'aria-disabled',
    'false',
  )

  await caretToEndOf(page, 'Restricted editor')
  await page.keyboard.type(' typed')
  await expect(undo).toHaveAttribute('aria-disabled', 'false')
  await expect(redo).toHaveAttribute('aria-disabled', 'true')

  await undo.click()
  await expect(page.getByTestId('restricted-html-output')).not.toContainText(' typed')
  await expect(redo).toHaveAttribute('aria-disabled', 'false')
})

test('the usage snippet sanitizes stored HTML with the schema of the editor modules', async ({
  page,
}) => {
  await page.goto('./')
  const usage = page.getByRole('region', { name: 'Usage' })
  await expect(usage).toContainText('const schema = createSchema([bold(), italic()])')
  await expect(usage).toContainText('sanitize(storedHtml, { schema })')
})

const PUBLISHED = [
  { version: '0.0.1', toolbar: 'none (/theme not in this version)', toolbarCount: 0 },
  { version: '0.1.0', toolbar: 'EditorToolbar from /theme', toolbarCount: 1 },
] as const

for (const { version, toolbar, toolbarCount } of PUBLISHED) {
  test(
    `npm.html runs the published ${version} package from jsDelivr`,
    { tag: '@network' },
    async ({ page }) => {
      await page.goto(`./npm.html?v=${version}`)
      await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', {
        timeout: 30_000,
      })
      await expect(page.locator('#requested-version')).toHaveText(version)
      await expect(page.locator('#loaded-version')).toHaveText(version)
      await expect(page.locator('#toolbar-status')).toHaveText(toolbar)
      await expect(page.getByRole('toolbar')).toHaveCount(toolbarCount)

      const textbox = page.getByRole('textbox', { name: 'Published editor' })
      await textbox.click()
      await textbox.evaluate((root) => {
        document.getSelection()?.selectAllChildren(root.lastElementChild as Element)
        document.getSelection()?.collapseToEnd()
      })
      await page.keyboard.type(' from npm')
      await page.keyboard.press('Enter')
      await page.keyboard.type('second line')

      await expect(page.locator('#output')).toHaveText(
        '<p>Published <strong>package</strong> page from npm</p><p>second line</p>',
      )
    },
  )
}

test('npm.html resolves latest to a concrete version', { tag: '@network' }, async ({ page }) => {
  await page.goto('./npm.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await expect(page.locator('#requested-version')).toHaveText('latest')
  await expect(page.locator('#loaded-version')).toHaveText(/^\d+\.\d+\.\d+/)
})
