import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { italic } from '../../../modules/italic.js'
import { isMarkActive, toggleMark } from '../../../shared/marks.js'
import {
  beforeInput,
  keyDown,
  mountEditor,
  select,
  selectedText,
  textOf,
} from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const boldEditor = (content: string): Editor =>
  mountEditor({ content, modules: [bold(), italic()] })

describe('bold module', () => {
  it('declares its schema, keys, input type and command', () => {
    const module = bold()
    expect(module.name).toBe('bold')
    expect(module.schema?.tags?.['strong']?.kind).toBe('inline')
    expect(module.schema?.rename?.['b']).toBe('strong')
    expect(module.keys).toEqual({ 'Mod-b': 'bold' })
    expect(module.inputTypes).toEqual({ formatBold: 'bold' })
  })

  it('renames b to strong on input', () => {
    expect(boldEditor('<p><b>a</b></p>').getHTML()).toBe('<p><strong>a</strong></p>')
  })

  it('wraps the selected text and keeps it selected', () => {
    const editor = boldEditor('<p>hello world</p>')
    select(textOf(editor, [0, 0]), 2, textOf(editor, [0, 0]), 7)
    expect(editor.exec('bold')).toBe(true)
    expect(editor.getHTML()).toBe('<p>he<strong>llo w</strong>orld</p>')
    expect(selectedText()).toBe('llo w')
    expect(editor.isActive('bold')).toBe(true)
  })

  it('unwraps when the whole selection is bold', () => {
    const editor = boldEditor('<p>he<strong>llo w</strong>orld</p>')
    select(textOf(editor, [0, 1, 0]), 1, textOf(editor, [0, 1, 0]), 3)
    editor.exec('bold')
    expect(editor.getHTML()).toBe('<p>he<strong>l</strong>lo<strong> w</strong>orld</p>')
    expect(selectedText()).toBe('lo')
    expect(editor.isActive('bold')).toBe(false)
  })

  it('makes a partially bold selection fully bold and merges marks', () => {
    const editor = boldEditor('<p>ab<strong>cd</strong>ef</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 2]), 1)
    editor.exec('bold')
    expect(editor.getHTML()).toBe('<p>a<strong>bcde</strong>f</p>')
  })

  it('works across paragraphs', () => {
    const editor = boldEditor('<p>ab</p><p>cd</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [1, 0]), 1)
    editor.exec('bold')
    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p><p><strong>c</strong>d</p>')
    expect(editor.isActive('bold')).toBe(true)
    editor.exec('bold')
    expect(editor.getHTML()).toBe('<p>ab</p><p>cd</p>')
  })

  it('lifts text out of a mark with nested marks inside', () => {
    const editor = boldEditor('<p><strong>a<em>bcd</em>e</strong></p>')
    select(textOf(editor, [0, 0, 1, 0]), 1, textOf(editor, [0, 0, 1, 0]), 2)
    editor.exec('bold')
    expect(editor.getHTML()).toBe(
      '<p><strong>a<em>b</em></strong><em>c</em><strong><em>d</em>e</strong></p>',
    )
  })

  it('ignores selection edges that cover no characters', () => {
    const editor = boldEditor('<p>ab</p><p>cd</p>')
    select(textOf(editor, [0, 0]), 2, textOf(editor, [1, 0]), 0)
    expect(editor.exec('bold')).toBe(false)
    select(editor.root, 0, editor.root, 2)
    expect(editor.exec('bold')).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>ab</strong></p><p><strong>cd</strong></p>')
  })

  it('does not touch the DOM when reporting state', () => {
    const editor = boldEditor('<p>a<strong>bcd</strong></p>')
    const text = textOf(editor, [0, 1, 0])
    select(text, 1, text, 2)
    expect(editor.isActive('bold')).toBe(true)
    expect(textOf(editor, [0, 1, 0])).toBe(text)
    expect(text.data).toBe('bcd')
  })

  it('reports the caret state for collapsed selections', () => {
    const editor = boldEditor('<p>a<strong>b</strong></p>')
    select(textOf(editor, [0, 1, 0]), 1)
    expect(editor.isActive('bold')).toBe(true)
    select(textOf(editor, [0, 0]), 1)
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.exec('bold')).toBe(true)
    expect(editor.isActive('bold')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>')
  })

  it('does nothing without a selection', () => {
    const editor = boldEditor('<p>a</p>')
    document.getSelection()?.removeAllRanges()
    expect(editor.exec('bold')).toBe(false)
    expect(editor.isActive('bold')).toBe(false)
    expect(isMarkActive(editor, 'strong')).toBe(false)
    expect(toggleMark(editor, 'strong')).toBe(false)
  })

  it('reports inactive for a selection without text', () => {
    const editor = boldEditor('<p><br></p>')
    select(editor.root, 0, editor.root, 1)
    expect(editor.isActive('bold')).toBe(false)
  })

  it('toggles with Mod-b and formatBold', () => {
    const editor = boldEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(keyDown(editor, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>ab</strong></p>')
    expect(beforeInput(editor, 'formatBold').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('is blocked in readonly mode', () => {
    const editor = mountEditor({ content: '<p>ab</p>', modules: [bold()], readonly: true })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(editor.exec('bold')).toBe(false)
    keyDown(editor, { key: 'b', ctrlKey: true })
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })
})
