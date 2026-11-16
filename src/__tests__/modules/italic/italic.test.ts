import { afterEach, describe, expect, it } from 'vitest'
import { bold } from '../../../modules/bold.js'
import { italic } from '../../../modules/italic.js'
import { markModule } from '../../../shared/marks.js'
import { beforeInput, keyDown, mountEditor, select, textOf } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

describe('italic module', () => {
  it('declares its schema, keys, input type and command', () => {
    const module = italic()
    expect(module.name).toBe('italic')
    expect(module.schema?.tags?.['em']?.kind).toBe('inline')
    expect(module.schema?.rename?.['i']).toBe('em')
    expect(module.keys).toEqual({ 'Mod-i': 'italic' })
    expect(module.inputTypes).toEqual({ formatItalic: 'italic' })
  })

  it('renames i to em and drops it without the module', () => {
    expect(mountEditor({ content: '<p><i>a</i></p>', modules: [italic()] }).getHTML()).toBe(
      '<p><em>a</em></p>',
    )
    expect(mountEditor({ content: '<p><i>a</i><em>b</em></p>' }).getHTML()).toBe('<p>ab</p>')
  })

  it('toggles with Mod-i and formatItalic', () => {
    const editor = mountEditor({ content: '<p>abc</p>', modules: [italic()] })
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 2)
    expect(keyDown(editor, { key: 'i', metaKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<em>b</em>c</p>')
    expect(editor.isActive('italic')).toBe(true)
    expect(beforeInput(editor, 'formatItalic').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>abc</p>')
  })

  it('builds marks without an alias', () => {
    expect(markModule('mark', 'mark', 'Mod-m', 'formatMark').schema?.rename).toEqual({})
  })

  it('combines with bold', () => {
    const editor = mountEditor({ content: '<p>abc</p>', modules: [bold(), italic()] })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 3)
    editor.exec('bold')
    editor.exec('italic')
    expect(editor.getHTML()).toBe('<p><strong><em>abc</em></strong></p>')
    expect(editor.isActive('bold')).toBe(true)
    expect(editor.isActive('italic')).toBe(true)
  })
})
