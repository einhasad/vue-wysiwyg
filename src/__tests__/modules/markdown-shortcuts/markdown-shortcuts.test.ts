import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../../core/editor.js'
import type { Editor, Module } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { heading } from '../../../modules/heading.js'
import { history } from '../../../modules/history.js'
import { italic } from '../../../modules/italic.js'
import { lists } from '../../../modules/lists.js'
import { markdownShortcuts } from '../../../modules/markdown-shortcuts.js'
import { beforeInput, mountEditor, select } from '../../core/helpers.js'

let editor: Editor | undefined

afterEach(() => {
  editor?.destroy()
  editor = undefined
})

const allModules = (): Module[] => [
  markdownShortcuts(),
  heading(),
  lists(),
  bold(),
  italic(),
  history(),
]

const typeAt = (
  content: string,
  path: number[],
  offset: number,
  data: string,
  modules: readonly Module[] = allModules(),
  props: Readonly<Record<string, unknown>> = {},
): InputEvent => {
  editor = mountEditor({ modules, content })
  let node: Node = editor.root
  for (const step of path) {
    node = node.childNodes[step] as Node
  }
  select(node, offset)
  return beforeInput(editor, 'insertText', { data, ...props })
}

const html = (): string => editor?.root.innerHTML ?? ''

describe('markdownShortcuts block rules', () => {
  it.each([
    ['#', '<h1><br></h1>'],
    ['###', '<h3><br></h3>'],
    ['######', '<h6><br></h6>'],
    ['-', '<ul><li><br></li></ul>'],
    ['*', '<ul><li><br></li></ul>'],
    ['+', '<ul><li><br></li></ul>'],
    ['1.', '<ol><li><br></li></ol>'],
    ['12)', '<ol><li><br></li></ol>'],
  ])('%j then space converts the paragraph', (marker, expected) => {
    const event = typeAt(`<p>${marker}</p>`, [0, 0], marker.length, ' ')
    expect(event.defaultPrevented).toBe(true)
    expect(html()).toBe(expected)
  })

  it('keeps the text after the marker and puts the caret before it', () => {
    typeAt('<p>##Title</p>', [0, 0], 2, ' ')
    expect(html()).toBe('<h2>Title</h2>')
    const range = editor?.selection.range()
    expect(range?.startOffset).toBe(0)
    expect(range?.startContainer.textContent).toBe('Title')
  })

  it.each([
    ['#######', '<p>#######</p>', [0, 0], 7],
    ['text before the marker', '<p>a #</p>', [0, 0], 3],
    ['marker not in the first text node', '<p><strong>x</strong>#</p>', [0, 1], 1],
    ['inside a list item', '<ul><li>#</li></ul>', [0, 0, 0], 1],
    ['inside a heading', '<h2>-</h2>', [0, 0], 1],
  ])('does nothing for %s', (_case, content, path, offset) => {
    const event = typeAt(content, path, offset, ' ')
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe(content)
  })

  it('does nothing when the matching command is not registered', () => {
    const event = typeAt('<p>#</p>', [0, 0], 1, ' ', [markdownShortcuts()])
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe('<p>#</p>')
  })

  it('does nothing when the heading level is not allowed', () => {
    const event = typeAt('<p>#</p>', [0, 0], 1, ' ', [
      markdownShortcuts(),
      heading({ levels: [2, 3] }),
    ])
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe('<p>#</p>')
  })

  it('is undone in one step and restores the typed marker', () => {
    typeAt('<p>##</p>', [0, 0], 2, ' ')
    expect(html()).toBe('<h2><br></h2>')
    expect(editor?.exec('undo')).toBe(true)
    expect(html()).toBe('<p>##</p>')
    expect(editor?.can('undo')).toBe(false)
  })
})

describe('markdownShortcuts mark rules', () => {
  it('**text* then * makes bold and drops the delimiters', () => {
    const event = typeAt('<p>a **bold*</p>', [0, 0], 9, '*')
    expect(event.defaultPrevented).toBe(true)
    expect(html()).toBe('<p>a <strong>bold</strong></p>')
  })

  it('*text then * makes italic and keeps the text after the caret', () => {
    const event = typeAt('<p>a *it rest</p>', [0, 0], 5, '*')
    expect(event.defaultPrevented).toBe(true)
    expect(html()).toBe('<p>a <em>it</em> rest</p>')
  })

  it('places the caret after the new mark', () => {
    typeAt('<p>**b* tail</p>', [0, 0], 4, '*')
    const range = editor?.selection.range() as Range
    expect(range.collapsed).toBe(true)
    const probe = range.cloneRange()
    probe.setStart(editor?.root as Node, 0)
    expect(probe.toString()).toBe('b')
    expect(range.startContainer.parentNode?.nodeName).toBe('P')
  })

  it('is undone in one step', () => {
    typeAt('<p>**b*</p>', [0, 0], 4, '*')
    expect(html()).toBe('<p><strong>b</strong></p>')
    editor?.exec('undo')
    expect(html()).toBe('<p>**b*</p>')
  })

  it.each([
    ['an empty italic', '<p>a *</p>', 3],
    ['the first closing star of bold', '<p>**b</p>', 3],
    ['content starting with a space', '<p>* b</p>', 3],
    ['content ending with a space', '<p>*b </p>', 3],
    ['no opening delimiter', '<p>b</p>', 1],
    ['an empty bold', '<p>***</p>', 3],
    ['bold without an opener', '<p>b*</p>', 2],
  ])('does nothing for %s', (_case, content, offset) => {
    const event = typeAt(content, [0, 0], offset, '*')
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe(content)
  })

  it('does nothing when the mark module is not registered', () => {
    const event = typeAt('<p>*b</p>', [0, 0], 2, '*', [markdownShortcuts(), bold()])
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe('<p>*b</p>')
  })

  it('does nothing inside an existing mark of the same kind and keeps the caret', () => {
    const event = typeAt('<p><em>*b</em></p>', [0, 0, 0], 2, '*')
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe('<p><em>*b</em></p>')
    const range = editor?.selection.range() as Range
    expect([range.collapsed, range.startOffset]).toEqual([true, 2])
  })
})

describe('markdownShortcuts typing after a new mark', () => {
  const typeNext = (data: string): InputEvent =>
    beforeInput(editor as Editor, 'insertText', { data })

  it('puts the next character outside the mark when the caret ends inside it', () => {
    typeAt('<p>**b*</p>', [0, 0], 4, '*')
    const strong = editor?.root.querySelector('strong') as Element
    select(strong.firstChild as Node, 1)
    expect(typeNext('x').defaultPrevented).toBe(true)
    expect(html()).toBe('<p><strong>b</strong>x</p>')
    const range = editor?.selection.range() as Range
    expect([range.startContainer.textContent, range.startOffset]).toEqual(['x', 1])
  })

  it('creates a text node after the mark when the browser dropped the empty one', () => {
    typeAt('<p>**b*</p>', [0, 0], 4, '*')
    const strong = editor?.root.querySelector('strong') as Element
    for (let next = strong.nextSibling; next; next = strong.nextSibling) {
      next.remove()
    }
    select(strong.firstChild as Node, 1)
    expect(typeNext('x').defaultPrevented).toBe(true)
    expect(html()).toBe('<p><strong>b</strong>x</p>')
  })

  it('prepends to the text that follows the mark', () => {
    typeAt('<p>*i rest</p>', [0, 0], 2, '*')
    expect(typeNext('x').defaultPrevented).toBe(true)
    expect(html()).toBe('<p><em>i</em>x rest</p>')
  })

  it('handles only the first input after the shortcut', () => {
    typeAt('<p>**b*</p>', [0, 0], 4, '*')
    expect(beforeInput(editor as Editor, 'deleteContentBackward').defaultPrevented).toBe(false)
    const strong = editor?.root.querySelector('strong') as Element
    select(strong.firstChild as Node, 1)
    expect(typeNext('x').defaultPrevented).toBe(false)
  })

  it.each([
    ['inside the mark before its end', (mark: Element) => [mark.firstChild, 0]],
    ['after other text', (mark: Element) => [mark.parentNode?.lastChild, 2]],
  ])('leaves typing native with the caret %s', (_case, caret) => {
    typeAt('<p>**ab* cd</p>', [0, 0], 5, '*')
    const mark = editor?.root.querySelector('strong') as Element
    const [node, offset] = caret(mark) as [Node, number]
    select(node, offset)
    expect(typeNext('x').defaultPrevented).toBe(false)
  })

  it('keeps the pending mark per editor when the module instance is shared', () => {
    const shared = allModules()
    typeAt('<p>**b*</p>', [0, 0], 4, '*', shared)
    const other = createEditor({
      element: document.body.appendChild(document.createElement('div')),
      content: '<p>y</p>',
      modules: shared,
    })
    select(other.root.firstChild?.firstChild as Node, 1)
    expect(beforeInput(other, 'insertText', { data: 'z' }).defaultPrevented).toBe(false)
    const strong = editor?.root.querySelector('strong') as Element
    select(strong.firstChild as Node, 1)
    expect(typeNext('x').defaultPrevented).toBe(true)
    expect(html()).toBe('<p><strong>b</strong>x</p>')
    other.destroy()
  })

  it('leaves typing native when the mark was removed', () => {
    typeAt('<p>**b*</p>', [0, 0], 4, '*')
    editor?.setHTML('<p>new</p>')
    select(editor?.root.firstChild?.firstChild as Node, 3)
    expect(typeNext('x').defaultPrevented).toBe(false)
  })
})

describe('markdownShortcuts input filtering', () => {
  it('ignores input while composing', () => {
    const event = typeAt('<p>#</p>', [0, 0], 1, ' ', allModules(), { isComposing: true })
    expect(event.defaultPrevented).toBe(false)
    expect(html()).toBe('<p>#</p>')
  })

  it('ignores other input types, characters and selections', () => {
    editor = mountEditor({ modules: allModules(), content: '<p>#</p>' })
    const text = editor.root.firstChild?.firstChild as Text
    select(text, 1)
    expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText', { data: 'x' }).defaultPrevented).toBe(false)
    select(text, 0, text, 1)
    expect(beforeInput(editor, 'insertText', { data: ' ' }).defaultPrevented).toBe(false)
    select(editor.root.firstChild as Node, 1)
    expect(beforeInput(editor, 'insertText', { data: ' ' }).defaultPrevented).toBe(false)
    document.getSelection()?.removeAllRanges()
    expect(beforeInput(editor, 'insertText', { data: ' ' }).defaultPrevented).toBe(false)
    expect(editor.getHTML()).toBe('<p>#</p>')
  })

  it('is blocked in readonly mode', () => {
    editor = mountEditor({ modules: allModules(), content: '<p>#</p>', readonly: true })
    select(editor.root.firstChild?.firstChild as Node, 1)
    beforeInput(editor, 'insertText', { data: ' ' })
    expect(editor.getHTML()).toBe('<p>#</p>')
  })
})
