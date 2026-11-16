import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { heading, type HeadingLevel } from '../../../modules/heading.js'
import { lists } from '../../../modules/lists.js'
import { keyDown, mountEditor, select, selectedText, textOf } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const headingEditor = (content: string, levels?: readonly HeadingLevel[]): Editor =>
  mountEditor({ content, modules: [heading(levels ? { levels } : {}), lists()] })

const caretIn = (editor: Editor, path: number[], offset = 0): void => {
  select(textOf(editor, path), offset)
}

describe('heading module', () => {
  it('contributes h1-h6 as blocks by default', () => {
    const module = heading()
    expect(module.name).toBe('heading')
    expect(Object.keys(module.schema?.tags ?? {})).toEqual(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    expect(module.schema?.tags?.['h1']).toEqual({ kind: 'block', attrs: [] })
  })

  it('contributes only the configured levels and renames the others to p', () => {
    const module = heading({ levels: [2, 3] })
    expect(Object.keys(module.schema?.tags ?? {})).toEqual(['h2', 'h3'])
    expect(module.schema?.rename?.['h1']).toBe('p')
    expect(module.schema?.rename?.['h4']).toBe('p')
  })

  it('keeps enabled levels and turns a disabled level into p on input', () => {
    const editor = headingEditor('<h1>a</h1><h2>b</h2><h4>c</h4>', [2])
    expect(editor.getHTML()).toBe('<p>a</p><h2>b</h2><p>c</p>')
  })

  it('turns a disabled heading in pasted HTML into a paragraph', () => {
    const editor = headingEditor('<p>x</p>', [2])
    caretIn(editor, [0, 0], 1)
    editor.root.dispatchEvent(
      Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
        clipboardData: { getData: (type: string) => (type === 'text/html' ? '<h5>y</h5>' : '') },
      }),
    )
    expect(editor.getHTML()).toBe('<p>x</p><p>y</p>')
  })

  it('sets the caret block to a heading and keeps the caret', () => {
    const editor = headingEditor('<p>hello</p>')
    caretIn(editor, [0, 0], 3)
    expect(editor.exec('heading', 2)).toBe(true)
    expect(editor.getHTML()).toBe('<h2>hello</h2>')
    const selection = document.getSelection() as Selection
    expect(selection.anchorNode).toBe(textOf(editor, [0, 0]))
    expect(selection.anchorOffset).toBe(3)
    expect(editor.isActive('heading', 2)).toBe(true)
    expect(editor.isActive('heading', 3)).toBe(false)
  })

  it('toggles the same level back to a paragraph', () => {
    const editor = headingEditor('<h3>hello</h3>')
    caretIn(editor, [0, 0], 1)
    expect(editor.isActive('heading', 3)).toBe(true)
    editor.exec('heading', 3)
    expect(editor.getHTML()).toBe('<p>hello</p>')
    expect(editor.isActive('heading', 3)).toBe(false)
  })

  it('switches one heading level to another', () => {
    const editor = headingEditor('<h3>hello</h3>')
    caretIn(editor, [0, 0])
    editor.exec('heading', 1)
    expect(editor.getHTML()).toBe('<h1>hello</h1>')
  })

  it('converts an empty paragraph with the caret inside it', () => {
    const editor = headingEditor('<p>a</p><p></p>')
    select(editor.root.childNodes[1] as Node, 0)
    editor.exec('heading', 4)
    expect(editor.root.innerHTML).toBe('<p>a</p><h4><br></h4>')
    expect(document.getSelection()?.anchorNode).toBe(editor.root.childNodes[1])
  })

  it('sets every selected block and keeps the selection', () => {
    const editor = headingEditor('<p>one</p><p>two</p><p>three</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [2, 0]), 2)
    editor.exec('heading', 2)
    expect(editor.getHTML()).toBe('<h2>one</h2><h2>two</h2><h2>three</h2>')
    expect(selectedText()).toBe('netwoth')
    expect(editor.isActive('heading', 2)).toBe(true)
  })

  it('sets the whole selection when only some blocks are already that heading', () => {
    const editor = headingEditor('<h2>one</h2><p>two</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [1, 0]), 3)
    expect(editor.isActive('heading', 2)).toBe(false)
    editor.exec('heading', 2)
    expect(editor.getHTML()).toBe('<h2>one</h2><h2>two</h2>')
    editor.exec('heading', 2)
    expect(editor.getHTML()).toBe('<p>one</p><p>two</p>')
  })

  it('ignores a block the selection only touches at its edge', () => {
    const editor = headingEditor('<p>one</p><p>two</p><p>three</p>')
    select(textOf(editor, [0, 0]), 3, textOf(editor, [2, 0]), 0)
    editor.exec('heading', 2)
    expect(editor.getHTML()).toBe('<p>one</p><h2>two</h2><p>three</p>')
  })

  it('covers blocks reached through inline marks', () => {
    const editor = mountEditor({
      content: '<p>a<strong>b</strong></p><p><strong>c</strong>d</p>',
      modules: [heading(), bold()],
    })
    const strong = editor.root.querySelectorAll('strong')
    select(strong[0]?.firstChild as Node, 0, strong[1]?.firstChild as Node, 1)
    editor.exec('heading', 1)
    expect(editor.getHTML()).toBe('<h1>a<strong>b</strong></h1><h1><strong>c</strong>d</h1>')
  })

  it('leaves list items alone in a mixed heading and list selection', () => {
    const editor = headingEditor('<p>one</p><ul><li>two</li></ul><h2>three</h2>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [2, 0]), 5)
    expect(editor.isActive('heading', 2)).toBe(false)
    expect(editor.exec('heading', 2)).toBe(true)
    expect(editor.getHTML()).toBe('<h2>one</h2><ul><li>two</li></ul><h2>three</h2>')
    expect(editor.isActive('heading', 2)).toBe(false)
  })

  it('does nothing when only list items are selected', () => {
    const editor = headingEditor('<ul><li>one</li><li>two</li></ul>')
    select(textOf(editor, [0, 0, 0]), 0, textOf(editor, [0, 1, 0]), 2)
    expect(editor.exec('heading', 2)).toBe(false)
    expect(editor.getHTML()).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('rejects a level that is not enabled', () => {
    const editor = headingEditor('<p>a</p>', [2, 3])
    caretIn(editor, [0, 0])
    expect(editor.exec('heading', 1)).toBe(false)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('does nothing without a selection inside the editor', () => {
    const editor = headingEditor('<p>a</p>')
    document.getSelection()?.removeAllRanges()
    expect(editor.exec('heading', 1)).toBe(false)
    expect(editor.isActive('heading', 1)).toBe(false)
    const outside = document.body.appendChild(document.createElement('p'))
    outside.textContent = 'x'
    select(outside.firstChild as Node, 0)
    expect(editor.exec('heading', 1)).toBe(false)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('does nothing in readonly mode', () => {
    const editor = mountEditor({ content: '<p>a</p>', modules: [heading()], readonly: true })
    caretIn(editor, [0, 0])
    expect(editor.exec('heading', 1)).toBe(false)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it.each([1, 2, 3, 4, 5, 6] as const)('Mod-Alt-%i sets that heading level', (level) => {
    const editor = headingEditor('<p>a</p>')
    caretIn(editor, [0, 0])
    const event = keyDown(editor, {
      key: '¡',
      code: `Digit${String(level)}`,
      ctrlKey: true,
      altKey: true,
    })
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe(`<h${String(level)}>a</h${String(level)}>`)
  })

  it('accepts Meta as Mod for the heading keys', () => {
    const editor = headingEditor('<p>a</p>')
    caretIn(editor, [0, 0])
    keyDown(editor, { key: '2', code: 'Digit2', metaKey: true, altKey: true })
    expect(editor.getHTML()).toBe('<h2>a</h2>')
  })

  it.each([
    ['a disabled level', { code: 'Digit1', ctrlKey: true, altKey: true }],
    ['no Alt', { code: 'Digit2', ctrlKey: true }],
    ['no Mod', { code: 'Digit2', altKey: true }],
    ['Shift', { code: 'Digit2', ctrlKey: true, altKey: true, shiftKey: true }],
    ['a level outside 1-6', { code: 'Digit7', ctrlKey: true, altKey: true }],
    ['a numpad digit', { code: 'Numpad2', ctrlKey: true, altKey: true }],
    ['a letter', { code: 'KeyA', ctrlKey: true, altKey: true }],
  ])('ignores the key with %s', (_name, init) => {
    const editor = headingEditor('<p>a</p>', [2, 3])
    caretIn(editor, [0, 0])
    const event = keyDown(editor, { key: 'x', ...init })
    expect(event.defaultPrevented).toBe(false)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('does not take the key when the command cannot run', () => {
    const editor = headingEditor('<p>a</p>')
    document.getSelection()?.removeAllRanges()
    const event = keyDown(editor, { key: '¡', code: 'Digit1', ctrlKey: true, altKey: true })
    expect(event.defaultPrevented).toBe(false)
  })

  it('emits one update per command', () => {
    const editor = headingEditor('<p>a</p>')
    let updates = 0
    editor.on('update', () => updates++)
    caretIn(editor, [0, 0])
    editor.exec('heading', 2)
    expect(updates).toBe(1)
  })
})
