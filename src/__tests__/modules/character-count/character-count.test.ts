import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../../core/editor.js'
import type { Editor } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import {
  characterCount,
  type CharacterCountModule,
  type CharacterCountOptions,
} from '../../../modules/character-count.js'
import { history } from '../../../modules/history.js'
import { beforeInput, dispatch, mountEditor, select, textOf, transfer } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

interface Counted {
  readonly editor: Editor
  readonly counter: CharacterCountModule
}

const countedEditor = (content: string, options?: CharacterCountOptions): Counted => {
  const counter = characterCount(options)
  return { editor: mountEditor({ content, modules: [bold(), counter] }), counter }
}

const caretAtEnd = (editor: Editor): void => {
  select(editor.root, editor.root.childNodes.length)
}

const paste = (editor: Editor, data: Readonly<Record<string, string>>): Event =>
  dispatch(editor.root, 'paste', { clipboardData: transfer(data) })

describe('characterCount module', () => {
  it('declares a low priority so it sees content after other transforms', () => {
    const counter = characterCount()
    expect(counter.name).toBe('characterCount')
    expect(counter.priority).toBe(-1)
  })

  it('counts nothing before it is mounted and after destroy', () => {
    const counter = characterCount()
    expect(counter.count()).toBe(0)
    expect(counter.words()).toBe(0)
    const editor = mountEditor({ content: '<p>a b</p>', modules: [counter] })
    expect(counter.count()).toBe(3)
    editor.destroy()
    expect(counter.count()).toBe(0)
    expect(counter.words()).toBe(0)
  })

  it('counts each editor separately when they share one module instance', () => {
    const counter = characterCount({ limit: 10 })
    const first = createEditor({ content: '<p>aaaa</p>', modules: [counter] })
    const second = createEditor({ content: '<p>bb bbbbbb</p>', modules: [counter] })
    expect(counter.count(first)).toBe(4)
    expect(counter.words(first)).toBe(1)
    expect(counter.count(second)).toBe(9)
    expect(counter.words(second)).toBe(2)
    first.destroy()
    expect(counter.count()).toBe(9)
  })

  it('limits each editor by its own text when they share one module instance', () => {
    const counter = characterCount({ limit: 5 })
    const element = document.body.appendChild(document.createElement('div'))
    const first = createEditor({ element, content: '<p>a</p>', modules: [counter] })
    createEditor({ content: '<p>bbbbb</p>', modules: [counter] })
    select(textOf(first, [0, 0]), 1)
    expect(beforeInput(first, 'insertText', { data: 'cd' }).defaultPrevented).toBe(false)
  })

  it('counts characters as the editor text length', () => {
    const { editor, counter } = countedEditor('<p>ab <strong>c</strong></p><p>d</p>')
    expect(counter.count()).toBe(5)
    expect(counter.count()).toBe(editor.textLength())
  })

  it('counts words across marks, blocks and line breaks', () => {
    const { counter } = countedEditor(
      '<p>one <strong>tw</strong>o</p><p>three<br>four</p><p>  five six </p>',
    )
    expect(counter.words()).toBe(6)
  })

  it('counts no words in an empty editor', () => {
    expect(countedEditor('').counter.words()).toBe(0)
    expect(countedEditor('<p>  </p>').counter.words()).toBe(0)
  })

  it('reports fresh counts to update listeners', () => {
    const { editor, counter } = countedEditor('<p>a</p>')
    const counts: number[] = []
    editor.on('update', () => counts.push(counter.count()))
    editor.setHTML('<p>abc def</p>')
    textOf(editor, [0, 0]).appendData('g')
    dispatch(editor.root, 'input')
    expect(counts).toEqual([7, 8])
    expect(counter.words()).toBe(2)
  })

  it('lets insertText through up to the limit', () => {
    const { editor } = countedEditor('<p>abcd</p>', { limit: 5 })
    caretAtEnd(editor)
    expect(beforeInput(editor, 'insertText', { data: 'e' }).defaultPrevented).toBe(false)
  })

  it('checks insertText against the whole text without a selection', () => {
    const { editor } = countedEditor('<p>abcd</p>', { limit: 5 })
    document.getSelection()?.removeAllRanges()
    expect(beforeInput(editor, 'insertText', { data: 'e' }).defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText', { data: 'ef' }).defaultPrevented).toBe(true)
  })

  it('blocks insertText beyond the limit', () => {
    const { editor } = countedEditor('<p>abcd</p>', { limit: 5 })
    caretAtEnd(editor)
    expect(beforeInput(editor, 'insertText', { data: 'ef' }).defaultPrevented).toBe(true)
    textOf(editor, [0, 0]).appendData('e')
    expect(beforeInput(editor, 'insertText', { data: 'f' }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>abcde</p>')
  })

  it('counts the selected text as replaced by insertText', () => {
    const { editor } = countedEditor('<p>abcde</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 3)
    expect(beforeInput(editor, 'insertText', { data: 'xy' }).defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText', { data: 'xyz' }).defaultPrevented).toBe(true)
  })

  it('leaves deletions, paragraphs and other input alone at the limit', () => {
    const { editor } = countedEditor('<p>abcde</p>', { limit: 5 })
    caretAtEnd(editor)
    expect(beforeInput(editor, 'deleteContentBackward').defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText', { data: null }).defaultPrevented).toBe(false)
  })

  it('never blocks without a limit', () => {
    const { editor } = countedEditor('<p>abcde</p>')
    caretAtEnd(editor)
    expect(beforeInput(editor, 'insertText', { data: 'x'.repeat(10_000) }).defaultPrevented).toBe(
      false,
    )
  })

  it('truncates pasted plain text to the room left', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 2)
    paste(editor, { 'text/plain': 'cdefgh' })
    expect(editor.getHTML()).toBe('<p>abcde</p>')
    expect(editor.textLength()).toBe(5)
  })

  it('does not count line ends of pasted plain text and drops trailing ones', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 2)
    paste(editor, { 'text/plain': 'c\r\nd\ne\n\nf' })
    expect(editor.getHTML()).toBe('<p>abc<br>d<br>e</p>')
    expect(editor.textLength()).toBe(5)
  })

  it('does not split a surrogate pair of pasted plain text', () => {
    const { editor } = countedEditor('<p>a</p>', { limit: 4 })
    select(textOf(editor, [0, 0]), 1)
    paste(editor, { 'text/plain': '\u{1F600}\u{1F600}' })
    expect(editor.getHTML()).toBe('<p>a\u{1F600}</p>')
  })

  it('replaces the selection when pasting at the limit', () => {
    const { editor } = countedEditor('<p>abcde</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 4)
    paste(editor, { 'text/plain': 'xyzw' })
    expect(editor.getHTML()).toBe('<p>axyze</p>')
  })

  it('truncates pasted html inside its marks', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 2)
    paste(editor, { 'text/html': '<strong>cd</strong>ef<em>gh</em>' })
    expect(editor.getHTML()).toBe('<p>ab<strong>cd</strong>e</p>')
  })

  it('cuts pasted html blocks without leaving an empty paragraph', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 4 })
    select(textOf(editor, [0, 0]), 2)
    paste(editor, { 'text/html': '<p>cd</p><p>ef</p><p>gh</p>' })
    expect(editor.getHTML()).toBe('<p>ab</p><p>cd</p>')
  })

  it('counts only the text that survives sanitizing', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 5 })
    select(textOf(editor, [0, 0]), 2)
    paste(editor, {
      'text/html': '<style>p{color:red}</style><script>alert(1)</script><p>cdefg</p>',
    })
    expect(editor.getHTML()).toBe('<p>ab</p><p>cde</p>')
    expect(editor.root.querySelector('script, style')).toBeNull()
  })

  it('does not split a surrogate pair of pasted html', () => {
    const { editor } = countedEditor('<p>a</p>', { limit: 4 })
    select(textOf(editor, [0, 0]), 1)
    paste(editor, { 'text/html': '<strong>\u{1F600}\u{1F600}</strong>' })
    expect(editor.getHTML()).toBe('<p>a<strong>\u{1F600}</strong></p>')
  })

  it('passes pasted html that fits through unchanged', () => {
    const { editor, counter } = countedEditor('<p>ab</p>', { limit: 10 })
    select(textOf(editor, [0, 0]), 2)
    const html = '<b data-x="1">cd</b><o:p></o:p>'
    expect(counter.transformPastedHTML?.(html, editor)).toBe(html)
    paste(editor, { 'text/html': html })
    expect(editor.getHTML()).toBe('<p>ab<strong>cd</strong></p>')
  })

  it('pastes nothing when there is no room left', () => {
    const { editor } = countedEditor('<p>abcde</p>', { limit: 5 })
    caretAtEnd(editor)
    paste(editor, { 'text/html': '<p>x</p>', 'text/plain': 'x' })
    expect(editor.getHTML()).toBe('<p>abcde</p>')
  })

  it('truncates dropped content the same way', () => {
    const { editor } = countedEditor('<p>ab</p>', { limit: 3 })
    select(textOf(editor, [0, 0]), 2)
    dispatch(editor.root, 'drop', { dataTransfer: transfer({ 'text/plain': 'cdef' }) })
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('emits update after a truncated paste', () => {
    const { editor, counter } = countedEditor('<p>ab</p>', { limit: 3 })
    const counts: number[] = []
    editor.on('update', () => counts.push(counter.count()))
    select(textOf(editor, [0, 0]), 2)
    paste(editor, { 'text/plain': 'cdef' })
    expect(counts).toEqual([3])
  })

  describe('composition', () => {
    const compose = (editor: Editor, text: string): void => {
      dispatch(editor.root, 'compositionstart')
      textOf(editor, [0, 0]).appendData(text)
      dispatch(editor.root, 'input', { isComposing: true })
    }

    it('does not check while composing', () => {
      const { editor } = countedEditor('<p>ab</p>', { limit: 3 })
      select(textOf(editor, [0, 0]), 2)
      compose(editor, 'かなかな')
      expect(textOf(editor, [0, 0]).data).toBe('abかなかな')
    })

    it('keeps a composition that fits', () => {
      const { editor } = countedEditor('<p>ab</p>', { limit: 3 })
      select(textOf(editor, [0, 0]), 2)
      compose(editor, 'か')
      dispatch(editor.root, 'compositionend')
      expect(editor.getHTML()).toBe('<p>abか</p>')
    })

    it('reverts to the content before the composition when it ends over the limit', () => {
      const { editor, counter } = countedEditor('<p>a<strong>b</strong></p>', { limit: 3 })
      const counts: number[] = []
      select(textOf(editor, [0, 0]), 1)
      dispatch(editor.root, 'compositionstart')
      textOf(editor, [0, 0]).appendData('かなか')
      editor.on('update', () => counts.push(counter.count()))
      dispatch(editor.root, 'compositionend')
      expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>')
      expect(counts.at(-1)).toBe(2)
      const range = editor.selection.range()
      expect(range?.startContainer).toBe(textOf(editor, [0, 0]))
      expect(range?.startOffset).toBe(1)
    })

    it('drops the reverted composition from history and keeps the earlier steps', () => {
      const editor = mountEditor({
        content: '<p>a</p>',
        modules: [history(), characterCount({ limit: 3 })],
      })
      editor.setHTML('<p>ab</p>', { history: true })
      select(textOf(editor, [0, 0]), 2)
      compose(editor, 'かなか')
      dispatch(editor.root, 'compositionend')
      expect(editor.getHTML()).toBe('<p>ab</p>')
      expect(editor.can('redo')).toBe(false)
      expect(editor.exec('undo')).toBe(true)
      expect(editor.getHTML()).toBe('<p>a</p>')
      expect(editor.exec('redo')).toBe(true)
      expect(editor.getHTML()).toBe('<p>ab</p>')
      expect(editor.can('redo')).toBe(false)
    })

    it('never reverts without a limit', () => {
      const { editor } = countedEditor('<p>ab</p>')
      select(textOf(editor, [0, 0]), 2)
      compose(editor, 'か'.repeat(100))
      dispatch(editor.root, 'compositionend')
      expect(editor.textLength()).toBe(102)
    })

    it('stops listening on destroy', () => {
      const { editor } = countedEditor('<p>ab</p>', { limit: 3 })
      select(textOf(editor, [0, 0]), 2)
      compose(editor, 'かなか')
      editor.destroy()
      dispatch(editor.root, 'compositionend')
      expect(editor.root.innerHTML).toBe('<p>abかなか</p>')
    })
  })
})
