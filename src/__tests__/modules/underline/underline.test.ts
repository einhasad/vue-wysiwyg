import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { underline } from '../../../modules/underline.js'
import { beforeInput, keyDown, mountEditor, select, textOf } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const underlineEditor = (content: string, readonly = false): Editor =>
  mountEditor({ content, readonly, modules: [underline(), bold()] })

describe('underline module', () => {
  it('declares its schema, keys, input type and command', () => {
    const module = underline()
    expect(module.name).toBe('underline')
    expect(module.schema?.tags?.['u']).toEqual({ kind: 'inline', attrs: [] })
    expect(module.schema?.rename).toEqual({})
    expect(module.keys).toEqual({ 'Mod-u': 'underline' })
    expect(module.inputTypes).toEqual({ formatUnderline: 'underline' })
  })

  it('keeps u on input and drops it without the module', () => {
    expect(underlineEditor('<p><u>a</u>b</p>').getHTML()).toBe('<p><u>a</u>b</p>')
    expect(mountEditor({ content: '<p><u>a</u>b</p>' }).getHTML()).toBe('<p>ab</p>')
  })

  it('wraps and unwraps the selection with the command', () => {
    const editor = underlineEditor('<p>hello</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 4)
    expect(editor.exec('underline')).toBe(true)
    expect(editor.getHTML()).toBe('<p>h<u>ell</u>o</p>')
    expect(editor.isActive('underline')).toBe(true)
    expect(editor.exec('underline')).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello</p>')
    expect(editor.isActive('underline')).toBe(false)
  })

  it('combines with another mark', () => {
    const editor = underlineEditor('<p><strong>ab</strong></p>')
    select(textOf(editor, [0, 0, 0]), 0, textOf(editor, [0, 0, 0]), 2)
    editor.exec('underline')
    expect(editor.getHTML()).toBe('<p><strong><u>ab</u></strong></p>')
    expect(editor.isActive('bold')).toBe(true)
  })

  it('toggles with Mod-u and formatUnderline', () => {
    const editor = underlineEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(keyDown(editor, { key: 'u', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p><u>ab</u></p>')
    expect(keyDown(editor, { key: 'U', metaKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
    expect(beforeInput(editor, 'formatUnderline').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p><u>ab</u></p>')
  })

  it('is blocked in readonly mode', () => {
    const editor = underlineEditor('<p>ab</p>', true)
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(editor.exec('underline')).toBe(false)
    keyDown(editor, { key: 'u', ctrlKey: true })
    expect(beforeInput(editor, 'formatUnderline').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })
})
