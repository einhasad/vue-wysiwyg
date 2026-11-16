import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../core/editor.js'
import type { Editor, Module } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { history } from '../../modules/history.js'
import { link } from '../../modules/link.js'
import { EditorToolbar } from '../../theme/editor-toolbar.js'
import { LinkPopover } from '../../theme/link-popover.js'
import { defaultMessages } from '../../theme/messages.js'
import { dispatch, keyDown, select } from '../core/helpers.js'

type Toolbar = VueWrapper<InstanceType<typeof EditorToolbar>>

const REL = 'rel="noopener noreferrer nofollow"'

const mountToolbar = (
  content: string,
  modules: readonly Module[] = [],
): { editor: Editor; wrapper: Toolbar } => {
  const element = document.body.appendChild(document.createElement('div'))
  const editor = createEditor({ element, content, modules: [bold(), link(), ...modules] })
  const wrapper = mount(EditorToolbar, { props: { editor }, attachTo: document.body })
  return { editor, wrapper }
}

const linkButton = (wrapper: Toolbar): HTMLButtonElement =>
  wrapper.get<HTMLButtonElement>('[aria-label="Link"]').element

const openWithSelection = async (
  content: string,
  start: number,
  end: number,
  modules: readonly Module[] = [],
): Promise<{ editor: Editor; wrapper: Toolbar }> => {
  const mounted = mountToolbar(content, modules)
  const text = mounted.editor.root.querySelector('p')?.firstChild as Text
  select(text, start, text, end)
  await nextTick()
  dispatch(document, 'selectionchange')
  await new Promise((resolve) => requestAnimationFrame(resolve))
  linkButton(mounted.wrapper).click()
  await nextTick()
  return mounted
}

const urlInput = (wrapper: Toolbar): HTMLInputElement =>
  wrapper.get<HTMLInputElement>('.vw-link-popover input').element

const typeUrl = async (wrapper: Toolbar, value: string): Promise<void> => {
  const input = urlInput(wrapper)
  input.value = value
  dispatch(input, 'input')
  await nextTick()
}

const popoverButton = (wrapper: Toolbar, label: string): HTMLButtonElement => {
  const found = wrapper
    .findAll<HTMLButtonElement>('.vw-link-popover button')
    .find((candidate) => candidate.text() === label)
  if (!found) {
    throw new Error(`No ${label} button`)
  }
  return found.element
}

const outlastVueAttachTime = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 5))
}

const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('LinkPopover', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('inserts the url as linked text at a collapsed caret outside a link', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 1, 1)
    expect(linkButton(wrapper).getAttribute('aria-disabled')).toBe('false')
    await typeUrl(wrapper, ' https://new.example ')
    document.getSelection()?.removeAllRanges()
    press(urlInput(wrapper), 'Enter')
    await nextTick()
    expect(editor.getHTML()).toBe(
      `<p>a<a href="https://new.example" ${REL}>https://new.example</a>bc</p>`,
    )
    expect(wrapper.find('.vw-link-popover').exists()).toBe(false)
  })

  it('inserts and links the url at a collapsed caret as one undo step', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 1, 1, [history()])
    await typeUrl(wrapper, 'https://new.example')
    press(urlInput(wrapper), 'Enter')
    await nextTick()
    expect(editor.getHTML()).toBe(
      `<p>a<a href="https://new.example" ${REL}>https://new.example</a>bc</p>`,
    )
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>abc</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('does not insert text for an unsafe url at a collapsed caret', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 1, 1)
    await typeUrl(wrapper, 'javascript:alert(1)')
    press(urlInput(wrapper), 'Enter')
    await nextTick()
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('updates the link around a collapsed caret without inserting text', async () => {
    const { editor, wrapper } = mountToolbar('<p>abc <a href="https://x.dev">x</a></p>')
    select(editor.root.querySelector('a')?.firstChild as Text, 1)
    dispatch(document, 'selectionchange')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(linkButton(wrapper).getAttribute('aria-pressed')).toBe('true')
    linkButton(wrapper).click()
    await nextTick()
    await typeUrl(wrapper, 'https://y.dev')
    press(urlInput(wrapper), 'Enter')
    expect(editor.getHTML()).toBe(`<p>abc <a href="https://y.dev" ${REL}>x</a></p>`)
  })

  it('keeps the link button disabled in readonly', async () => {
    const { editor, wrapper } = mountToolbar('<p>abc</p>')
    editor.setReadonly(true)
    await nextTick()
    expect(linkButton(wrapper).getAttribute('aria-disabled')).toBe('true')
    linkButton(wrapper).click()
    await nextTick()
    expect(wrapper.find('.vw-link-popover').exists()).toBe(false)
  })

  it('opens with an empty focused url field for new links', async () => {
    const { wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    const group = wrapper.get('.vw-link-popover')
    expect(group.attributes('role')).toBe('group')
    expect(group.attributes('aria-label')).toBe('Link')
    expect(urlInput(wrapper).value).toBe('')
    expect(document.activeElement).toBe(urlInput(wrapper))
    expect(urlInput(wrapper).closest('label')?.textContent).toContain('URL')
    expect(
      wrapper.findAll('.vw-link-popover button').map((button) => button.attributes('type')),
    ).toEqual(['button', 'button'])
  })

  it('applies a safe url to the selection with Enter and returns to the editor', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    const focus = vi.spyOn(editor, 'focus')
    await typeUrl(wrapper, '  https://example.com/a  ')
    document.getSelection()?.removeAllRanges()
    expect(press(urlInput(wrapper), 'Enter').defaultPrevented).toBe(true)
    await nextTick()
    expect(editor.getHTML()).toBe(`<p><a href="https://example.com/a" ${REL}>ab</a>c</p>`)
    expect(focus).toHaveBeenCalledOnce()
    expect(wrapper.find('.vw-link-popover').exists()).toBe(false)
  })

  it.each([
    ['example.com', 'https://example.com'],
    [' www.x.org ', 'https://www.x.org'],
    ['sub.example.co.uk/a/b?q=1#top', 'https://sub.example.co.uk/a/b?q=1#top'],
    ['example.com:8080/x', 'https://example.com:8080/x'],
    ['/docs/page', '/docs/page'],
    ['./page.html', './page.html'],
    ['#section', '#section'],
    ['?q=1', '?q=1'],
    ['localhost', 'localhost'],
    ['http://plain.example', 'http://plain.example'],
    ['mailto:me@example.com', 'mailto:me@example.com'],
  ])('applies %j as %j', async (typed, href) => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    await typeUrl(wrapper, typed)
    press(urlInput(wrapper), 'Enter')
    await nextTick()
    expect(editor.root.querySelector('a')?.getAttribute('href')).toBe(href)
  })

  it('applies with the Apply button', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 1, 3)
    await typeUrl(wrapper, 'mailto:me@example.com')
    popoverButton(wrapper, 'Apply').click()
    await nextTick()
    expect(editor.getHTML()).toBe(`<p>a<a href="mailto:me@example.com" ${REL}>bc</a></p>`)
  })

  it.each(['javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', '//evil.example'])(
    'rejects the unsafe url %s and keeps the popover open',
    async (url) => {
      const { editor, wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
      await typeUrl(wrapper, url)
      press(urlInput(wrapper), 'Enter')
      await nextTick()
      expect(editor.getHTML()).toBe('<p>abc</p>')
      expect(urlInput(wrapper).getAttribute('aria-invalid')).toBe('true')
      const error = wrapper.get('[role=alert]')
      expect(error.text()).toBe(defaultMessages.linkInvalid)
      expect(urlInput(wrapper).getAttribute('aria-describedby')).toBe(error.attributes('id'))

      await typeUrl(wrapper, 'https://ok.example')
      popoverButton(wrapper, 'Apply').click()
      await nextTick()
      expect(editor.getHTML()).toBe(`<p><a href="https://ok.example" ${REL}>ab</a>c</p>`)
    },
  )

  it('rejects an empty url', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    await typeUrl(wrapper, '')
    popoverButton(wrapper, 'Apply').click()
    await nextTick()
    expect(editor.getHTML()).toBe('<p>abc</p>')
    expect(urlInput(wrapper).getAttribute('aria-invalid')).toBe('true')
  })

  it('edits and removes an existing link at the caret', async () => {
    const { editor, wrapper } = mountToolbar('<p><a href="https://old.example">abc</a></p>')
    select(editor.root.querySelector('a')?.firstChild as Text, 1)
    keyDown(editor, { key: 'k', ctrlKey: true })
    await nextTick()
    expect(urlInput(wrapper).value).toBe('https://old.example')
    await typeUrl(wrapper, 'https://new.example')
    press(urlInput(wrapper), 'Enter')
    await nextTick()
    expect(editor.getHTML()).toBe(`<p><a href="https://new.example" ${REL}>abc</a></p>`)

    select(editor.root.querySelector('a')?.firstChild as Text, 2)
    const shortcut = keyDown(editor, { key: 'k', metaKey: true })
    expect(shortcut.defaultPrevented).toBe(true)
    await nextTick()
    popoverButton(wrapper, 'Remove link').click()
    await nextTick()
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('reads the href when the selection starts on the link element', async () => {
    const { editor, wrapper } = mountToolbar('<p><a href="https://el.example">abc</a></p>')
    const anchor = editor.root.querySelector('a') as HTMLAnchorElement
    select(anchor, 0, anchor, 1)
    keyDown(editor, { key: 'k', ctrlKey: true })
    await nextTick()
    expect(urlInput(wrapper).value).toBe('https://el.example')
  })

  it('has no remove button for a new link', async () => {
    const { wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    expect(() => popoverButton(wrapper, 'Remove link')).toThrow()
  })

  it('cancels with Escape or the Cancel button and restores the selection', async () => {
    const { editor, wrapper } = await openWithSelection('<p>abc</p>', 1, 2)
    const text = editor.root.querySelector('p')?.firstChild as Text
    await typeUrl(wrapper, 'https://example.com')
    document.getSelection()?.removeAllRanges()
    await outlastVueAttachTime()
    expect(press(urlInput(wrapper), 'Escape').defaultPrevented).toBe(true)
    await nextTick()
    expect(wrapper.find('.vw-link-popover').exists()).toBe(false)
    expect(editor.getHTML()).toBe('<p>abc</p>')
    const range = editor.selection.range() as Range
    expect([range.startContainer, range.startOffset, range.endOffset]).toEqual([text, 1, 2])
    expect(press(editor.root, 'a').defaultPrevented).toBe(false)

    linkButton(wrapper).click()
    await nextTick()
    popoverButton(wrapper, 'Cancel').click()
    await nextTick()
    expect(wrapper.find('.vw-link-popover').exists()).toBe(false)
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('ignores other keys in the popover', async () => {
    const { wrapper } = await openWithSelection('<p>abc</p>', 0, 2)
    expect(press(urlInput(wrapper), 'a').defaultPrevented).toBe(false)
    expect(press(popoverButton(wrapper, 'Apply'), 'Enter').defaultPrevented).toBe(false)
    expect(wrapper.find('.vw-link-popover').exists()).toBe(true)
  })

  it('opens from the keyboard after the editor lost the selection', async () => {
    const { editor, wrapper } = mountToolbar('<p>abc</p>')
    const text = editor.root.querySelector('p')?.firstChild as Text
    select(text, 0, text, 3)
    dispatch(document, 'selectionchange')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    dispatch(editor.root, 'blur')
    document.getSelection()?.removeAllRanges()
    linkButton(wrapper).click()
    await nextTick()
    await typeUrl(wrapper, 'https://example.com')
    press(urlInput(wrapper), 'Enter')
    expect(editor.getHTML()).toBe(`<p><a href="https://example.com" ${REL}>abc</a></p>`)
  })

  it('renders standalone with given messages', () => {
    const element = document.body.appendChild(document.createElement('div'))
    const editor = createEditor({ element, content: '<p>a</p>', modules: [link()] })
    const onClose = vi.fn()
    const wrapper = mount(LinkPopover, {
      props: { editor, messages: { ...defaultMessages, linkUrl: 'Adresse' }, onClose },
      attachTo: document.body,
    })
    expect(wrapper.get('label').text()).toBe('Adresse')
    wrapper.findAll('button').at(-1)?.element.click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
