import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../core/editor.js'
import type { Editor, Module } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { heading } from '../../modules/heading.js'
import { history } from '../../modules/history.js'
import { italic } from '../../modules/italic.js'
import { link } from '../../modules/link.js'
import { lists } from '../../modules/lists.js'
import { underline } from '../../modules/underline.js'
import { EditorToolbar, type ToolbarItem } from '../../theme/editor-toolbar.js'
import type { EditorMessages } from '../../theme/messages.js'
import { dispatch, keyDown, select } from '../core/helpers.js'

type Toolbar = VueWrapper<InstanceType<typeof EditorToolbar>>

const ALL_MODULES = (): Module[] => [
  bold(),
  italic(),
  underline(),
  heading({ levels: [2, 3] }),
  lists(),
  link(),
  history(),
]

const mountToolbar = (
  content = '<p>abc</p>',
  modules: Module[] = ALL_MODULES(),
  messages?: Partial<EditorMessages>,
): { editor: Editor; wrapper: Toolbar } => {
  const element = document.body.appendChild(document.createElement('div'))
  const editor = createEditor({ element, content, modules })
  const wrapper = mount(EditorToolbar, { props: { editor, messages }, attachTo: document.body })
  return { editor, wrapper }
}

const buttons = (wrapper: Toolbar): HTMLButtonElement[] =>
  wrapper.findAll<HTMLButtonElement>('[role=toolbar] button').map((button) => button.element)

const button = (wrapper: Toolbar, label: string): HTMLButtonElement =>
  wrapper.get<HTMLButtonElement>(`[role=toolbar] [aria-label="${label}"]`).element

const selectionChange = async (): Promise<void> => {
  document.dispatchEvent(new Event('selectionchange'))
  await new Promise((resolve) => requestAnimationFrame(resolve))
}

const selectText = (editor: Editor, start: number, end: number, index = 0): Text => {
  const text = editor.root.children[index]?.firstChild as Text
  select(text, start, text, end)
  return text
}

const pressOn = (target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('EditorToolbar', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders nothing without an editor', () => {
    const wrapper = mount(EditorToolbar, { props: { editor: null } })
    expect(wrapper.find('[role=toolbar]').exists()).toBe(false)
  })

  it('shows buttons only for the commands of the editor, headings from its levels', () => {
    const { wrapper } = mountToolbar()
    expect(buttons(wrapper).map((element) => element.getAttribute('aria-label'))).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Heading 2',
      'Heading 3',
      'Bulleted list',
      'Numbered list',
      'Link',
      'Undo',
      'Redo',
    ])
    expect(buttons(wrapper).map((element) => element.dataset['glyph'])).toEqual([
      'B',
      'I',
      'U',
      'H2',
      'H3',
      '•',
      '1.',
      '↗',
      '↶',
      '↷',
    ])
    for (const element of buttons(wrapper)) {
      expect(element.textContent).toBe('')
      expect(element.type).toBe('button')
      expect(element.title).toBe(element.getAttribute('aria-label'))
    }
  })

  it('shows only bold when the editor has only bold', () => {
    const { wrapper } = mountToolbar('<p>a</p>', [bold()])
    expect(buttons(wrapper).map((element) => element.getAttribute('aria-label'))).toEqual(['Bold'])
  })

  it.each([
    [['ul'], 'Bulleted list', 'Numbered list'],
    [['ol'], 'Numbered list', 'Bulleted list'],
  ] as const)('shows only the list button of lists %j', (types, shown, hidden) => {
    const { wrapper } = mountToolbar('<p>a</p>', [lists({ types })])
    const labels = buttons(wrapper).map((element) => element.getAttribute('aria-label'))
    expect(labels).toContain(shown)
    expect(labels).not.toContain(hidden)
  })

  it('takes labels from messages merged over the defaults', () => {
    const { wrapper } = mountToolbar('<p>a</p>', [bold(), heading({ levels: [1] })], {
      toolbar: 'Format',
      bold: 'Fett',
      heading: 'Überschrift {level}',
    })
    expect(wrapper.get('[role=toolbar]').attributes('aria-label')).toBe('Format')
    expect(buttons(wrapper).map((element) => element.getAttribute('aria-label'))).toEqual([
      'Fett',
      'Überschrift 1',
    ])
  })

  it('renders icons through the icon slot', () => {
    const element = document.body.appendChild(document.createElement('div'))
    const editor = createEditor({ element, modules: [bold(), heading({ levels: [2] })] })
    const wrapper = mount(EditorToolbar, {
      props: { editor },
      slots: {
        icon: (item?: ToolbarItem) =>
          h('i', `${String(item?.command)}${String(item?.level ?? '')}:${String(item?.glyph)}`),
      },
    })
    expect(wrapper.findAll('i').map((icon) => icon.text())).toEqual(['bold:B', 'heading2:H2'])
  })

  it('links the toolbar to the editor root id and keeps an existing id', () => {
    const { editor, wrapper } = mountToolbar()
    expect(editor.root.id).not.toBe('')
    expect(wrapper.get('[role=toolbar]').attributes('aria-controls')).toBe(editor.root.id)

    const element = document.body.appendChild(document.createElement('div'))
    element.id = 'body-editor'
    const own = createEditor({ element, modules: [bold()] })
    const second = mount(EditorToolbar, { props: { editor: own } })
    expect(second.get('[role=toolbar]').attributes('aria-controls')).toBe('body-editor')
  })

  it('updates aria-pressed when the caret moves', async () => {
    const { editor, wrapper } = mountToolbar('<p><strong>ab</strong>cd</p><h2>title</h2>')
    expect(button(wrapper, 'Bold').getAttribute('aria-pressed')).toBe('false')
    expect(button(wrapper, 'Undo').hasAttribute('aria-pressed')).toBe(false)

    select(editor.root.querySelector('strong')?.firstChild as Text, 1)
    await selectionChange()
    expect(button(wrapper, 'Bold').getAttribute('aria-pressed')).toBe('true')
    expect(button(wrapper, 'Heading 2').getAttribute('aria-pressed')).toBe('false')

    select(editor.root.querySelector('h2')?.firstChild as Text, 2)
    await selectionChange()
    expect(button(wrapper, 'Bold').getAttribute('aria-pressed')).toBe('false')
    expect(button(wrapper, 'Heading 2').getAttribute('aria-pressed')).toBe('true')
    expect(button(wrapper, 'Heading 3').getAttribute('aria-pressed')).toBe('false')
  })

  it('runs the command on click and keeps the editor selection on mousedown', async () => {
    const { editor, wrapper } = mountToolbar()
    selectText(editor, 0, 2)
    const mousedown = dispatch(button(wrapper, 'Bold'), 'mousedown')
    expect(mousedown.defaultPrevented).toBe(true)
    button(wrapper, 'Bold').click()
    await nextTick()
    expect(editor.getHTML()).toBe('<p><strong>ab</strong>c</p>')
    expect(button(wrapper, 'Bold').getAttribute('aria-pressed')).toBe('true')
  })

  it('applies heading, list and history commands with their arguments', async () => {
    const { editor, wrapper } = mountToolbar()
    selectText(editor, 1, 1)
    button(wrapper, 'Heading 3').click()
    expect(editor.getHTML()).toBe('<h3>abc</h3>')
    button(wrapper, 'Bulleted list').click()
    expect(editor.getHTML()).toBe('<ul><li>abc</li></ul>')
    await nextTick()
    expect(button(wrapper, 'Undo').getAttribute('aria-disabled')).toBe('false')
    button(wrapper, 'Undo').click()
    expect(editor.getHTML()).toBe('<h3>abc</h3>')
    button(wrapper, 'Redo').click()
    expect(editor.getHTML()).toBe('<ul><li>abc</li></ul>')
  })

  it('marks unavailable commands aria-disabled and ignores clicks on them', async () => {
    const { editor, wrapper } = mountToolbar()
    expect(button(wrapper, 'Undo').getAttribute('aria-disabled')).toBe('true')
    expect(button(wrapper, 'Bold').getAttribute('aria-disabled')).toBe('false')

    editor.setReadonly(true)
    await nextTick()
    for (const element of buttons(wrapper)) {
      expect(element.getAttribute('aria-disabled')).toBe('true')
    }
    selectText(editor, 0, 2)
    button(wrapper, 'Bold').click()
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('restores the last editor selection when it left the editor', async () => {
    const { editor, wrapper } = mountToolbar()
    selectText(editor, 0, 2)
    await selectionChange()
    document.getSelection()?.removeAllRanges()
    button(wrapper, 'Italic').click()
    expect(editor.getHTML()).toBe('<p><em>ab</em>c</p>')
  })

  it('keeps the remembered selection when a later event has none', async () => {
    const { editor, wrapper } = mountToolbar()
    selectText(editor, 1, 3)
    await selectionChange()
    document.getSelection()?.removeAllRanges()
    keyDown(editor, { key: 'Shift' })
    button(wrapper, 'Underline').click()
    expect(editor.getHTML()).toBe('<p>a<u>bc</u></p>')
  })

  describe('keyboard', () => {
    it('has one tab stop and moves it with arrows, Home and End', async () => {
      const { wrapper } = mountToolbar()
      const toolbar = wrapper.get('[role=toolbar]').element
      const tabStops = (): string[] =>
        buttons(wrapper)
          .filter((element) => element.tabIndex === 0)
          .map((element) => element.getAttribute('aria-label') as string)
      expect(tabStops()).toEqual(['Bold'])

      const moves: [string, string][] = [
        ['ArrowRight', 'Italic'],
        ['ArrowLeft', 'Bold'],
        ['ArrowLeft', 'Redo'],
        ['ArrowRight', 'Bold'],
        ['End', 'Redo'],
        ['Home', 'Bold'],
      ]
      for (const [key, label] of moves) {
        const event = pressOn(
          document.activeElement === document.body ? toolbar : (document.activeElement as Element),
          key,
        )
        expect(event.defaultPrevented).toBe(true)
        await nextTick()
        expect(document.activeElement?.getAttribute('aria-label')).toBe(label)
        expect(tabStops()).toEqual([label])
      }
      expect(pressOn(toolbar, 'a').defaultPrevented).toBe(false)
    })

    it('moves the tab stop to a button that gets focus', async () => {
      const { wrapper } = mountToolbar()
      button(wrapper, 'Underline').focus()
      await nextTick()
      expect(button(wrapper, 'Underline').tabIndex).toBe(0)
      expect(button(wrapper, 'Bold').tabIndex).toBe(-1)
    })

    it('focuses the toolbar on Alt+F10 in the editor and returns on Escape', async () => {
      const { editor, wrapper } = mountToolbar()
      button(wrapper, 'Italic').focus()
      await nextTick()
      ;(document.activeElement as HTMLElement).blur()
      const text = selectText(editor, 1, 2)

      expect(keyDown(editor, { key: 'F10' }).defaultPrevented).toBe(false)
      const altF10 = keyDown(editor, { key: 'F10', altKey: true })
      expect(altF10.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(button(wrapper, 'Italic'))

      document.getSelection()?.removeAllRanges()
      const focus = vi.spyOn(editor, 'focus')
      const escape = pressOn(button(wrapper, 'Italic'), 'Escape')
      expect(escape.defaultPrevented).toBe(true)
      expect(focus).toHaveBeenCalledOnce()
      const range = editor.selection.range() as Range
      expect([range.startContainer, range.startOffset, range.endOffset]).toEqual([text, 1, 2])
    })

    it('leaves Alt+F10 to the browser when the toolbar has no buttons', () => {
      const { editor, wrapper } = mountToolbar('<p>abc</p>', [])
      expect(buttons(wrapper)).toEqual([])
      expect(keyDown(editor, { key: 'F10', altKey: true }).defaultPrevented).toBe(false)
    })

    it('keeps Mod-k for the editor when there is no link command', () => {
      const { editor } = mountToolbar('<p>abc</p>', [bold()])
      selectText(editor, 0, 2)
      expect(keyDown(editor, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false)
    })

    it('stops listening when the editor changes', async () => {
      const element = document.body.appendChild(document.createElement('div'))
      const first = createEditor({ element, modules: [bold()] })
      const editor = shallowRef<Editor | null>(first)
      const wrapper = mount(
        defineComponent({ setup: () => () => h(EditorToolbar, { editor: editor.value }) }),
        { attachTo: document.body },
      )
      editor.value = null
      await nextTick()
      expect(wrapper.find('[role=toolbar]').exists()).toBe(false)
      expect(keyDown(first, { key: 'F10', altKey: true }).defaultPrevented).toBe(false)
    })
  })
})
