import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../core/editor.js'
import type { Editor, Module } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { history } from '../../modules/history.js'
import { italic } from '../../modules/italic.js'
import { underline } from '../../modules/underline.js'
import { beforeInput, keyDown, mountEditor, select, textOf } from '../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const markEditor = (content: string, modules: Module[] = []): Editor =>
  mountEditor({ content, modules: [bold(), italic(), underline(), ...modules] })

const type = (editor: Editor, data: string): InputEvent =>
  beforeInput(editor, 'insertText', { data })

const caret = (): [Node | null, number] => {
  const selection = document.getSelection()
  return [selection?.anchorNode ?? null, selection?.anchorOffset ?? -1]
}

describe('stored marks on a collapsed caret', () => {
  it('Mod-b then typing wraps the typed text in bold and keeps the caret after it', () => {
    const editor = markEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    expect(keyDown(editor, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.isActive('bold')).toBe(true)
    expect(type(editor, 'b').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>')
    expect(caret()).toEqual([editor.root.querySelector('strong')?.firstChild, 1])
    expect(editor.isActive('bold')).toBe(true)
  })

  it('Mod-b at the end of a bold run types outside the bold', () => {
    const editor = markEditor('<p><strong>bold</strong></p>')
    select(textOf(editor, [0, 0, 0]), 4)
    expect(editor.isActive('bold')).toBe(true)
    expect(editor.exec('bold')).toBe(true)
    expect(editor.isActive('bold')).toBe(false)
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><strong>bold</strong>x</p>')
    expect(editor.isActive('bold')).toBe(false)
  })

  it('splits the bold run when toggled off in its middle', () => {
    const editor = markEditor('<p><strong>abcd</strong></p>')
    select(textOf(editor, [0, 0, 0]), 2)
    editor.exec('bold')
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><strong>ab</strong>x<strong>cd</strong></p>')
  })

  it('combines several stored marks', () => {
    const editor = markEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    editor.exec('italic')
    expect(editor.isActive('underline')).toBe(false)
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p>a<strong><em>x</em></strong></p>')
  })

  it('types plain text after a stored mark is toggled twice', () => {
    const editor = markEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    editor.exec('bold')
    expect(editor.isActive('bold')).toBe(false)
    expect(type(editor, 'x').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>ax</p>')
  })

  it('forgets stored marks when the caret moves', () => {
    const editor = markEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    select(textOf(editor, [0, 0]), 2)
    expect(editor.isActive('bold')).toBe(false)
    expect(type(editor, 'x').defaultPrevented).toBe(false)
    select(textOf(editor, [0, 0]), 1)
    expect(editor.isActive('bold')).toBe(false)
  })

  it('clears stored marks on a selection change away from the caret', async () => {
    const editor = markEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(editor.isActive('bold')).toBe(true)
    select(textOf(editor, [0, 0]), 2)
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    select(textOf(editor, [0, 0]), 1)
    expect(editor.isActive('bold')).toBe(false)
  })

  it('uses stored marks only once', () => {
    const editor = markEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    type(editor, 'b')
    expect(type(editor, 'c').defaultPrevented).toBe(false)
  })

  it('leaves other input types to the browser and keeps the stored marks', () => {
    const editor = markEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText', { data: null }).defaultPrevented).toBe(false)
    expect(editor.isActive('bold')).toBe(true)
  })

  it('replaces the line break of an empty paragraph', () => {
    const editor = markEditor('<p><br></p>')
    select(editor.root.firstChild as Node, 0)
    editor.exec('bold')
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><strong>x</strong></p>')
  })

  it('types non-bold after Enter carried the bold into a new paragraph', () => {
    const editor = markEditor('<p><strong>bold</strong></p><p><strong><br></strong></p>')
    select(editor.root.querySelectorAll('strong')[1] as Node, 0)
    expect(editor.isActive('bold')).toBe(true)
    editor.exec('bold')
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><strong>bold</strong></p><p>x</p>')
  })

  it('carries a mark toggled off through Enter into the new paragraph', () => {
    const editor = markEditor('<p><strong><em>Includes:</em></strong></p>')
    select(textOf(editor, [0, 0, 0, 0]), 9)
    editor.exec('bold')
    expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    editor.root.insertAdjacentHTML('beforeend', '<p><strong><em><br></em></strong></p>')
    select(editor.root.querySelectorAll('em')[1] as Node, 0)
    expect(editor.isActive('bold')).toBe(false)
    expect(editor.isActive('italic')).toBe(true)
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><strong><em>Includes:</em></strong></p><p><em>x</em></p>')
    expect(editor.isActive('bold')).toBe(false)
  })

  it('carries a mark toggled on through Enter on an empty paragraph', () => {
    const editor = markEditor('<p><br></p>')
    select(editor.root.firstChild as Node, 0)
    editor.exec('bold')
    beforeInput(editor, 'insertParagraph')
    editor.root.insertAdjacentHTML('beforeend', '<p><br></p>')
    select(editor.root.lastChild as Node, 0)
    expect(editor.isActive('bold')).toBe(true)
    type(editor, 'x')
    expect(editor.getHTML()).toBe('<p><br></p><p><strong>x</strong></p>')
  })

  it('drops carried marks when the selection after Enter is not collapsed', () => {
    const editor = markEditor('<p><strong>ab</strong></p>')
    select(textOf(editor, [0, 0, 0]), 2)
    editor.exec('bold')
    beforeInput(editor, 'insertParagraph')
    select(textOf(editor, [0, 0, 0]), 0, textOf(editor, [0, 0, 0]), 2)
    expect(editor.isActive('bold')).toBe(true)
    select(textOf(editor, [0, 0, 0]), 2)
    expect(editor.isActive('bold')).toBe(true)
  })

  it('carries nothing through Enter without stored marks', () => {
    const editor = markEditor('<p><strong>ab</strong></p>')
    select(textOf(editor, [0, 0, 0]), 2)
    beforeInput(editor, 'insertParagraph')
    editor.root.insertAdjacentHTML('beforeend', '<p><br></p>')
    select(editor.root.lastChild as Node, 0)
    expect(editor.isActive('bold')).toBe(false)
    expect(type(editor, 'x').defaultPrevented).toBe(false)
  })

  it('is one undo step', () => {
    const editor = markEditor('<p>a</p>', [history()])
    select(textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    type(editor, 'b')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('keeps stored marks per editor', () => {
    const modules = [bold()]
    const first = markEditor('<p>a</p>')
    const element = document.body.appendChild(document.createElement('div'))
    const second = createEditor({ element, content: '<p>b</p>', modules })
    select(textOf(first, [0, 0]), 1)
    first.exec('bold')
    expect(second.isActive('bold')).toBe(false)
    select(textOf(second, [0, 0]), 1)
    expect(type(second, 'x').defaultPrevented).toBe(false)
  })

  it('is blocked in readonly mode', () => {
    const editor = markEditor('<p>a</p>')
    editor.setReadonly(true)
    select(textOf(editor, [0, 0]), 1)
    expect(editor.exec('bold')).toBe(false)
    expect(editor.isActive('bold')).toBe(false)
  })
})
