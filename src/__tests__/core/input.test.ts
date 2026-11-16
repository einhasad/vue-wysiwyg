import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor, Module } from '../../core/types.js'
import {
  beforeInput,
  dispatch,
  keyDown,
  mountEditor,
  select,
  selectedText,
  textOf,
  transfer,
} from './helpers.js'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const recorder = (): { calls: string[]; module: Module } => {
  const calls: string[] = []
  const command = (name: string): { run: (editor: Editor, arg?: string | null) => boolean } => ({
    run: (_editor: Editor, arg?: string | null) => {
      calls.push(arg === undefined ? name : `${name}:${String(arg)}`)
      return true
    },
  })
  return {
    calls,
    module: {
      name: 'recorder',
      commands: {
        undo: command('undo'),
        redo: command('redo'),
        link: command('link'),
        bold: command('bold'),
      },
      keys: { 'Shift-Mod-z': 'redo', 'Mod-b': 'bold', 'Alt-F10': 'undo' },
      inputTypes: { formatBold: 'bold' },
    },
  }
}

describe('beforeinput routing', () => {
  it('routes history input types to undo and redo', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    expect(beforeInput(editor, 'historyUndo').defaultPrevented).toBe(true)
    expect(beforeInput(editor, 'historyRedo').defaultPrevented).toBe(true)
    expect(calls).toEqual(['undo:null', 'redo:null'])
  })

  it('cancels history input types without a history module', () => {
    const editor = mountEditor()
    expect(beforeInput(editor, 'historyUndo').defaultPrevented).toBe(true)
  })

  it('maps format input types to commands and cancels unmapped ones', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    expect(beforeInput(editor, 'formatBold').defaultPrevented).toBe(true)
    expect(beforeInput(editor, 'formatItalic').defaultPrevented).toBe(true)
    expect(calls).toEqual(['bold:null'])
  })

  it('routes insertLink to the link command with the URL', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    expect(beforeInput(editor, 'insertLink', { data: 'https://a.example' }).defaultPrevented).toBe(
      true,
    )
    expect(calls).toEqual(['link:https://a.example'])
  })

  it('offers hooked input types to modules in priority order', () => {
    const order: string[] = []
    const hook = (name: string, handled: boolean): Module => ({
      name,
      priority: name === 'high' ? 10 : 0,
      onBeforeInput: () => {
        order.push(name)
        return handled
      },
    })
    const editor = mountEditor({ modules: [hook('low', true), hook('high', false)] })
    expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(true)
    expect(order).toEqual(['high', 'low'])
  })

  it('lets unhandled native input through and emits beforeChange', () => {
    const editor = mountEditor({ modules: [{ name: 'm', onBeforeInput: () => false }] })
    const beforeChange = vi.fn()
    editor.on('beforeChange', beforeChange)
    for (const type of ['insertText', 'deleteContentBackward', 'insertReplacementText']) {
      expect(beforeInput(editor, type).defaultPrevented).toBe(false)
    }
    expect(beforeChange).toHaveBeenCalledTimes(3)
  })

  it('never cancels composition and skips hooks while composing', () => {
    const hook = vi.fn(() => true)
    const editor = mountEditor({ modules: [{ name: 'm', onBeforeInput: hook }] })
    expect(beforeInput(editor, 'insertText', { isComposing: true }).defaultPrevented).toBe(false)
    dispatch(editor.root, 'compositionstart')
    expect(beforeInput(editor, 'insertCompositionText').defaultPrevented).toBe(false)
    expect(beforeInput(editor, 'insertText').defaultPrevented).toBe(false)
    expect(hook).not.toHaveBeenCalled()
  })
})

describe('input and composition', () => {
  it('normalizes after native input and keeps the caret on the same text node', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    const update = vi.fn()
    editor.on('update', update)
    const typed = document.createTextNode('typed')
    editor.root.append(typed)
    select(typed, 3)
    dispatch(editor.root, 'input')
    expect(editor.root.innerHTML).toBe('<p>ab</p><p>typed</p>')
    expect(document.getSelection()?.anchorNode).toBe(typed)
    expect(document.getSelection()?.anchorOffset).toBe(3)
    expect(update).toHaveBeenCalledOnce()
  })

  it('restores the caret by path when the anchor node was replaced', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    const block = document.createElement('div')
    block.append('cd')
    editor.root.append(block)
    select(block, 1)
    dispatch(editor.root, 'input')
    expect(editor.root.innerHTML).toBe('<p>ab</p><p>cd</p>')
    expect(document.getSelection()?.anchorNode).toBe(editor.root.childNodes[1])
    expect(document.getSelection()?.anchorOffset).toBe(1)
  })

  it('does not touch the DOM when it is already valid', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    const text = textOf(editor, [0, 0])
    select(text, 1)
    const setBaseAndExtent = vi.spyOn(Selection.prototype, 'setBaseAndExtent')
    dispatch(editor.root, 'input')
    expect(textOf(editor, [0, 0])).toBe(text)
    expect(setBaseAndExtent).not.toHaveBeenCalled()
  })

  it('defers normalization until composition ends', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    const update = vi.fn()
    const beforeChange = vi.fn()
    editor.on('update', update)
    editor.on('beforeChange', beforeChange)
    dispatch(editor.root, 'compositionstart')
    expect(beforeChange).toHaveBeenCalledOnce()
    editor.root.append(document.createTextNode('ime'))
    dispatch(editor.root, 'input')
    expect(editor.root.innerHTML).toBe('<p>ab</p>ime')
    expect(update).not.toHaveBeenCalled()
    dispatch(editor.root, 'compositionend')
    expect(editor.root.innerHTML).toBe('<p>ab</p><p>ime</p>')
    expect(update).toHaveBeenCalledOnce()
  })
})

describe('keymap', () => {
  it('runs commands for normalized key specs with Ctrl or Meta as Mod', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    expect(keyDown(editor, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(keyDown(editor, { key: 'B', metaKey: true, shiftKey: false }).defaultPrevented).toBe(
      true,
    )
    expect(keyDown(editor, { key: 'Z', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true)
    expect(keyDown(editor, { key: 'F10', altKey: true }).defaultPrevented).toBe(true)
    expect(keyDown(editor, { key: 'b' }).defaultPrevented).toBe(false)
    expect(calls).toEqual(['bold', 'bold', 'redo', 'undo'])
  })

  it('falls back to the physical key for non-latin layouts', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    expect(keyDown(editor, { key: 'и', code: 'KeyB', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(keyDown(editor, { key: 'и', code: 'Digit1', ctrlKey: true }).defaultPrevented).toBe(
      false,
    )
    expect(calls).toEqual(['bold'])
  })

  it('emits keydown first and skips handling when a listener prevented it', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    editor.on('keydown', (_editor, event) => event?.preventDefault())
    keyDown(editor, { key: 'b', ctrlKey: true })
    expect(calls).toEqual([])
  })

  it('lets module key hooks take precedence over the keymap', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({
      modules: [module, { name: 'hook', onKeyDown: (event) => event.key === 'b' }],
    })
    expect(keyDown(editor, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(calls).toEqual([])
  })

  it('ignores keys while composing', () => {
    const { calls, module } = recorder()
    const editor = mountEditor({ modules: [module] })
    keyDown(editor, { key: 'b', ctrlKey: true, isComposing: true })
    dispatch(editor.root, 'compositionstart')
    keyDown(editor, { key: 'b', ctrlKey: true })
    expect(calls).toEqual([])
  })
})

describe('paste and drop', () => {
  it('inserts sanitized HTML at the caret', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    select(textOf(editor, [0, 0]), 1)
    const event = dispatch(editor.root, 'paste', {
      clipboardData: transfer({
        'text/html': '<span onclick="x()">X</span><img src=x onerror=alert(1)>',
      }),
    })
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>aXb</p>')
  })

  it('replaces the selected content', () => {
    const editor = mountEditor({ content: '<p>abc</p>' })
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 2)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/plain': 'X' }) })
    expect(editor.getHTML()).toBe('<p>aXc</p>')
  })

  it('inserts plain text lines separated by line breaks', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    select(textOf(editor, [0, 0]), 2)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/plain': '1\r\n2\n3<b>' }) })
    expect(editor.getHTML()).toBe('<p>ab1<br>2<br>3&lt;b&gt;</p>')
    const selection = document.getSelection()
    expect(selection?.anchorNode?.childNodes[selection.anchorOffset - 1]?.textContent).toBe('3<b>')
  })

  it('splits the current block when pasting blocks', () => {
    const editor = mountEditor({ content: '<p>abcd</p>' })
    select(textOf(editor, [0, 0]), 2)
    dispatch(editor.root, 'paste', {
      clipboardData: transfer({ 'text/html': '<p>1</p><div>2</div>' }),
    })
    expect(editor.getHTML()).toBe('<p>ab</p><p>1</p><p>2</p><p>cd</p>')
    expect(document.getSelection()?.anchorNode).toBe(editor.root.childNodes[2])
  })

  it('drops empty halves when pasting blocks at a block edge', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    select(textOf(editor, [0, 0]), 0)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/html': '<p>1</p>' }) })
    expect(editor.getHTML()).toBe('<p>1</p><p>ab</p>')
    select(textOf(editor, [1, 0]), 2)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/html': '<p>2</p>tail' }) })
    expect(editor.getHTML()).toBe('<p>1</p><p>ab</p><p>2</p><p>tail</p>')
  })

  it('inserts blocks directly when the caret is between root blocks', () => {
    const editor = mountEditor({ content: '<p>a</p><p>b</p>' })
    select(editor.root, 1)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/html': '<p>x</p>' }) })
    expect(editor.getHTML()).toBe('<p>a</p><p>x</p><p>b</p>')
  })

  it('runs module paste transforms before sanitizing', () => {
    const editor = mountEditor({
      content: '<p>ab</p>',
      modules: [
        {
          name: 'clean',
          transformPastedHTML: (html) => html.replace('word', '<p>clean</p>'),
          transformPastedText: (text) => text.toUpperCase(),
        },
        { name: 'none' },
      ],
    })
    select(textOf(editor, [0, 0]), 2)
    dispatch(editor.root, 'paste', {
      clipboardData: transfer({ 'text/html': 'word<script>x</script>' }),
    })
    expect(editor.getHTML()).toBe('<p>ab</p><p>clean</p>')
    select(textOf(editor, [1, 0]), 5)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/plain': 'up' }) })
    expect(editor.getHTML()).toBe('<p>ab</p><p>cleanUP</p>')
  })

  it('ignores paste without data, without content or without a selection', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    const update = vi.fn()
    editor.on('update', update)
    dispatch(editor.root, 'paste', { clipboardData: transfer({ 'text/html': 'x' }) })
    select(textOf(editor, [0, 0]), 1)
    dispatch(editor.root, 'paste', { clipboardData: null })
    dispatch(editor.root, 'paste', { clipboardData: transfer({}) })
    expect(editor.getHTML()).toBe('<p>ab</p>')
    expect(update).toHaveBeenCalledOnce()
  })

  it('cancels transfer input types as a backstop and inserts their data', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    select(textOf(editor, [0, 0]), 2)
    for (const type of [
      'insertFromPaste',
      'insertFromPasteAsQuotation',
      'insertFromYank',
      'insertFromDrop',
    ]) {
      const event = beforeInput(editor, type, {
        dataTransfer: transfer({ 'text/html': '<img src=x onerror=alert(1)>!' }),
      })
      expect(event.defaultPrevented).toBe(true)
    }
    expect(editor.getHTML()).toBe('<p>ab!!!!</p>')
  })

  it('inserts external drops at the pointer position', () => {
    const editor = mountEditor({ content: '<p>abcd</p>' })
    const text = textOf(editor, [0, 0])
    select(text, 4)
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({ offsetNode: text, offset: 1 })),
    })
    const event = dispatch(editor.root, 'drop', {
      clientX: 5,
      clientY: 6,
      dataTransfer: transfer({ 'text/html': '<b onclick=x>X</b>' }),
    })
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>aXbcd</p>')
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({ offsetNode: document.body, offset: 0 })),
    })
    dispatch(editor.root, 'drop', { dataTransfer: transfer({ 'text/plain': 'Y' }) })
    expect(editor.getHTML()).toBe('<p>aXYbcd</p>')
    delete (document as unknown as Record<string, unknown>)['caretPositionFromPoint']
    dispatch(editor.root, 'drop', { dataTransfer: transfer({ 'text/plain': 'Z' }) })
    expect(editor.getHTML()).toBe('<p>aXYZbcd</p>')
  })

  it('leaves internal drags to the browser', () => {
    const editor = mountEditor({ content: '<p>abcd</p>' })
    const beforeChange = vi.fn()
    editor.on('beforeChange', beforeChange)
    dispatch(editor.root, 'dragstart')
    expect(
      dispatch(editor.root, 'drop', { dataTransfer: transfer({ 'text/plain': 'x' }) })
        .defaultPrevented,
    ).toBe(false)
    expect(beforeInput(editor, 'insertFromDrop').defaultPrevented).toBe(false)
    expect(beforeChange).toHaveBeenCalledOnce()
    dispatch(editor.root, 'dragend')
    select(textOf(editor, [0, 0]), 0)
    expect(
      dispatch(editor.root, 'drop', { dataTransfer: transfer({ 'text/plain': 'x' }) })
        .defaultPrevented,
    ).toBe(true)
  })
})

describe('selection API', () => {
  it('returns null without a selection inside the editor', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    document.getSelection()?.removeAllRanges()
    expect(editor.selection.range()).toBeNull()
    expect(editor.selection.save()).toBeNull()
    select(document.body, 0)
    expect(editor.selection.save()).toBeNull()
    editor.selection.restore(null)
  })

  it('saves and restores selections as paths with direction', () => {
    const editor = mountEditor({ content: '<p>ab</p><p>cd</p>' })
    select(textOf(editor, [1, 0]), 1, textOf(editor, [0, 0]), 1)
    const path = editor.selection.save()
    expect(path).toEqual({ anchor: [1, 0, 1], focus: [0, 0, 1] })
    editor.setHTML('<p>ab</p><p>cd</p>')
    editor.selection.restore(path)
    expect(selectedText()).toBe('bc')
    expect(document.getSelection()?.anchorNode).toBe(textOf(editor, [1, 0]))
    expect(editor.selection.range()?.collapsed).toBe(false)
  })

  it('collapses invalid paths to the end of the deepest existing node', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    editor.selection.restore({ anchor: [0, 5, 2], focus: [0, 0, 99] })
    const selection = document.getSelection()
    expect(selection?.anchorNode).toBe(editor.root.firstChild)
    expect(selection?.anchorOffset).toBe(1)
    expect(selection?.focusOffset).toBe(2)
    editor.selection.restore({ anchor: [], focus: [] })
    expect(selection?.anchorNode).toBe(editor.root.firstChild)
    expect(selection?.anchorOffset).toBe(0)
  })

  it('moves carets that land directly in the root into the nearest block', () => {
    const editor = mountEditor({ content: '<p>ab</p><p>cd</p>' })
    editor.selection.restore({ anchor: [1], focus: [2] })
    const selection = document.getSelection()
    expect(selection?.anchorNode).toBe(editor.root.childNodes[1])
    expect(selection?.anchorOffset).toBe(0)
    expect(selection?.focusNode).toBe(editor.root.childNodes[1])
    expect(selection?.focusOffset).toBe(1)
  })

  it('keeps typing inside a block after the root was emptied', () => {
    const editor = mountEditor({ content: '<p>ab</p>' })
    editor.root.replaceChildren(document.createElement('br'))
    select(editor.root, 0)
    dispatch(editor.root, 'input')
    expect(editor.root.innerHTML).toBe('<p><br></p>')
    expect(document.getSelection()?.anchorNode).toBe(editor.root.firstChild)
  })
})

describe('line breaks', () => {
  it('inserts a line break with a placeholder at the end of a block', () => {
    const editor = mountEditor({ content: '<p>one</p>' })
    select(textOf(editor, [0, 0]), 3)
    expect(beforeInput(editor, 'insertLineBreak').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>one<br><br></p>')
    const selection = document.getSelection()
    expect(selection?.anchorNode?.childNodes[selection.anchorOffset - 1]?.nodeName).toBe('BR')
    editor.root.firstChild?.insertBefore(
      document.createTextNode('two'),
      editor.root.firstChild.childNodes[2] ?? null,
    )
    dispatch(editor.root, 'input')
    expect(editor.getHTML()).toBe('<p>one<br>two</p>')
  })

  it('inserts a single line break in the middle of text', () => {
    const editor = mountEditor({ content: '<p>onetwo</p>' })
    select(textOf(editor, [0, 0]), 3)
    expect(keyDown(editor, { key: 'Enter', shiftKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>one<br>two</p>')
  })

  it('finds the enclosing block through inline marks and list items', () => {
    const editor = mountEditor({
      content: '<ul><li><strong>a</strong></li><li>b</li></ul>',
      modules: [
        {
          name: 'm',
          schema: {
            tags: {
              ul: { kind: 'list', attrs: [] },
              li: { kind: 'item', attrs: [] },
              strong: { kind: 'inline', attrs: [] },
            },
          },
        },
      ],
    })
    select(textOf(editor, [0, 0, 0, 0]), 1)
    beforeInput(editor, 'insertLineBreak')
    expect(editor.getHTML()).toBe('<ul><li><strong>a<br><br></strong></li><li>b</li></ul>')
  })

  it('leaves line breaks to modules that handle them and ignores missing selections', () => {
    const editor = mountEditor({
      content: '<p>ab</p>',
      modules: [
        {
          name: 'm',
          onBeforeInput: (event) => event.inputType === 'insertLineBreak' && event.data === 'x',
        },
      ],
    })
    expect(beforeInput(editor, 'insertLineBreak', { data: 'x' }).defaultPrevented).toBe(true)
    document.getSelection()?.removeAllRanges()
    expect(beforeInput(editor, 'insertLineBreak').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })
})
