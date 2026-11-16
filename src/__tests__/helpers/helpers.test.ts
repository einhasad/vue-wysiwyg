import { afterEach, describe, expect, it } from 'vitest'
import {
  activeMark,
  isLineActive,
  isMarkActive,
  keyOf,
  markModule,
  selectedLines,
  setBlocks,
  setMark,
  toggleMark,
  typeWithStoredMarks,
} from '../../helpers/index.js'
import { defineModule } from '../../index.js'
import { beforeInput, keyDown, mountEditor, select, textOf } from '../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

describe('./helpers subpath for custom modules', () => {
  it('builds a mark module with markModule and toggles it', () => {
    const editor = mountEditor({
      content: '<p>abc</p>',
      modules: [markModule('strike', 's', 'Mod-Shift-x', 'formatStrikeThrough', 'strike')],
    })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(keyDown(editor, { key: 'x', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p><s>ab</s>c</p>')
    expect(editor.isActive('strike' as 'undo')).toBe(true)
    editor.setHTML('<p><strike>x</strike></p>')
    expect(editor.getHTML()).toBe('<p><s>x</s></p>')
  })

  it('reuses mark and block helpers in a hand-written module', () => {
    const custom = defineModule({
      name: 'custom',
      schema: {
        tags: {
          mark: { kind: 'inline', attrs: ['class'] },
          h3: { kind: 'block', attrs: [] },
        },
      },
      commands: {
        highlight: { run: (editor) => toggleMark(editor, 'mark', { class: 'hl' }) },
        clearHighlight: { run: (editor) => setMark(editor, 'mark', null) },
        subtitle: {
          run: (editor) => setBlocks(editor, 'h3'),
          isActive: (editor) => isLineActive(editor, (line) => line.localName === 'h3'),
        },
      },
    })
    const editor = mountEditor({ content: '<p>abc</p>', modules: [custom] })
    const run = (name: string): boolean => editor.exec(name as 'undo')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 2)
    expect(run('highlight')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<mark class="hl">b</mark>c</p>')
    select(textOf(editor, [0, 1, 0]), 1)
    expect(activeMark(editor, 'mark')?.className).toBe('hl')
    expect(selectedLines(editor).map((line) => line.localName)).toEqual(['p'])
    expect(run('subtitle')).toBe(true)
    expect(editor.isActive('subtitle' as 'undo')).toBe(true)
    select(textOf(editor, [0, 1, 0]), 0, textOf(editor, [0, 1, 0]), 1)
    expect(run('clearHighlight')).toBe(true)
    expect(editor.getHTML()).toBe('<h3>abc</h3>')
  })

  it('exposes keyOf for onKeyDown handlers', () => {
    expect(keyOf(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, shiftKey: true }))).toBe(
      'Mod-Shift-k',
    )
  })

  it('types with a mark toggled on a collapsed caret through typeWithStoredMarks', () => {
    const custom = defineModule({
      name: 'custom',
      schema: { tags: { mark: { kind: 'inline', attrs: [] } } },
      commands: {
        highlight: {
          run: (editor) => toggleMark(editor, 'mark'),
          isActive: (editor) => isMarkActive(editor, 'mark'),
        },
      },
      onBeforeInput: typeWithStoredMarks,
    })
    const editor = mountEditor({ content: '<p>a</p>', modules: [custom] })
    select(textOf(editor, [0, 0]), 1)
    expect(editor.exec('highlight' as 'undo')).toBe(true)
    expect(editor.isActive('highlight' as 'undo')).toBe(true)
    expect(beforeInput(editor, 'insertText', { data: 'b' }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<mark>b</mark></p>')
  })
})
