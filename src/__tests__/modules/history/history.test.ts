import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { createEditor } from '../../../core/editor.js'
import { bold } from '../../../modules/bold.js'
import { history, type HistoryOptions } from '../../../modules/history.js'
import {
  beforeInput,
  dispatch,
  keyDown,
  mountEditor,
  select,
  selectedText,
  textOf,
} from '../../core/helpers.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(0)
})

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

const historyEditor = (content: string, options?: HistoryOptions): Editor =>
  mountEditor({ content, modules: [history(options), bold()] })

const typeText = (editor: Editor, data: string, inputType = 'insertText'): void => {
  beforeInput(editor, inputType, { data })
  const text = textOf(editor, [0, 0])
  text.appendData(data)
  select(text, text.length)
  dispatch(editor.root, 'input')
}

const deleteBackward = (editor: Editor): void => {
  beforeInput(editor, 'deleteContentBackward')
  const text = textOf(editor, [0, 0])
  text.deleteData(text.length - 1, 1)
  select(text, text.length)
  dispatch(editor.root, 'input')
}

const advance = (milliseconds: number): void => {
  vi.setSystemTime(Date.now() + milliseconds)
}

const boldAll = (editor: Editor): void => {
  const text = textOf(editor, [0, 0])
  select(text, 0, text, text.length)
  editor.exec('bold')
}

describe('history module', () => {
  it('declares its commands and keys', () => {
    const module = history()
    expect(module.name).toBe('history')
    expect(Object.keys(module.commands ?? {})).toEqual(['undo', 'redo'])
    expect(module.keys).toEqual({ 'Mod-z': 'undo', 'Mod-Shift-z': 'redo', 'Mod-y': 'redo' })
  })

  it('cannot undo or redo before any change', () => {
    const editor = historyEditor('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
    expect(editor.can('redo')).toBe(false)
    expect(editor.exec('undo')).toBe(false)
    expect(editor.exec('redo')).toBe(false)
  })

  it('undoes and redoes a mark toggle with its selection', () => {
    const editor = historyEditor('<p>hello world</p>')
    select(textOf(editor, [0, 0]), 2, textOf(editor, [0, 0]), 7)
    editor.exec('bold')
    expect(editor.getHTML()).toBe('<p>he<strong>llo w</strong>orld</p>')
    expect(editor.can('undo')).toBe(true)

    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello world</p>')
    expect(selectedText()).toBe('llo w')
    expect(editor.can('undo')).toBe(false)
    expect(editor.can('redo')).toBe(true)

    expect(editor.exec('redo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>he<strong>llo w</strong>orld</p>')
    expect(selectedText()).toBe('llo w')
    expect(editor.can('redo')).toBe(false)
    expect(editor.can('undo')).toBe(true)
  })

  it('coalesces a typing burst into one step', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    advance(300)
    typeText(editor, 'c')
    advance(400)
    typeText(editor, 'd')
    expect(editor.getHTML()).toBe('<p>abcd</p>')

    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
    expect(document.getSelection()?.anchorOffset).toBe(1)
  })

  it('starts a new step after a pause longer than the group delay', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    advance(501)
    typeText(editor, 'c')

    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>ab</p>')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('honours a custom group delay', () => {
    const editor = historyEditor('<p>a</p>', { groupDelay: 50 })
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    advance(100)
    typeText(editor, 'c')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('starts a new step when the input type changes', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    typeText(editor, 'c')
    deleteBackward(editor)
    deleteBackward(editor)
    expect(editor.getHTML()).toBe('<p>a</p>')

    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>abc</p>')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('starts a new step after a command between typing', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    boldAll(editor)
    const text = textOf(editor, [0, 0, 0])
    select(text, text.length)
    beforeInput(editor, 'insertText', { data: 'c' })
    text.appendData('c')
    dispatch(editor.root, 'input')
    expect(editor.getHTML()).toBe('<p><strong>abc</strong></p>')

    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p><strong>ab</strong></p>')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>ab</p>')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('starts a new typing step after an undo', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    typeText(editor, 'c')
    editor.exec('undo')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'x')
    typeText(editor, 'y')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('clears redo after a new change', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    editor.exec('undo')
    expect(editor.can('redo')).toBe(true)

    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'c')
    expect(editor.can('redo')).toBe(false)
    expect(editor.exec('redo')).toBe(false)
    expect(editor.getHTML()).toBe('<p>ac</p>')
  })

  it('keeps redo after a change that leaves the content unchanged', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    editor.exec('undo')
    editor.transact(() => undefined)
    expect(editor.can('redo')).toBe(true)
  })

  it('drops the oldest steps beyond the depth', () => {
    const editor = historyEditor('<p>a</p>', { depth: 2 })
    for (const html of ['<p>b</p>', '<p>c</p>', '<p>d</p>']) {
      editor.setHTML(html, { history: true })
    }
    expect(editor.exec('undo')).toBe(true)
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>b</p>')
    expect(editor.exec('undo')).toBe(false)
  })

  it('keeps 100 steps by default', () => {
    const editor = historyEditor('<p>0</p>')
    for (let step = 1; step <= 101; step++) {
      editor.setHTML(`<p>${String(step)}</p>`, { history: true })
    }
    let undone = 0
    while (editor.exec('undo')) {
      undone++
    }
    expect(undone).toBe(100)
    expect(editor.getHTML()).toBe('<p>1</p>')
  })

  it('records setHTML only when history is requested', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>')
    expect(editor.can('undo')).toBe(false)

    editor.setHTML('<p>c</p>', { history: true })
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>b</p>')
  })

  it('clears undo and redo when the content is replaced from outside', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    editor.setHTML('<p>c</p>', { history: true })
    editor.exec('undo')
    editor.setHTML('<p>reset</p>')
    expect(editor.can('undo')).toBe(false)
    expect(editor.can('redo')).toBe(false)
    expect(editor.exec('undo')).toBe(false)
    expect(editor.getHTML()).toBe('<p>reset</p>')
  })

  it('records the typing that continues right after an outside replacement', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'b')
    editor.setHTML('<p>x</p>')
    select(textOf(editor, [0, 0]), 1)
    typeText(editor, 'y')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>x</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('clears the stacks on an outside replacement after a keystroke that changed nothing', async () => {
    const editor = historyEditor('<p>record A</p>')
    select(textOf(editor, [0, 0]), 0)
    beforeInput(editor, 'deleteContentBackward')
    await new Promise((resolve) => setTimeout(resolve))
    editor.setHTML('<p>record B</p>')
    expect(editor.can('undo')).toBe(false)
    expect(editor.exec('undo')).toBe(false)
    expect(editor.getHTML()).toBe('<p>record B</p>')
  })

  it('records the same kind of typing after a keystroke that changed nothing', async () => {
    const editor = historyEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0)
    beforeInput(editor, 'deleteContentBackward')
    await new Promise((resolve) => setTimeout(resolve))
    select(textOf(editor, [0, 0]), 2)
    deleteBackward(editor)
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('keeps the stacks when an outside setHTML leaves the content unchanged', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    editor.setHTML('<p>b</p>')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('drops only the last step when an outside change restores its snapshot', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    editor.setHTML('<p>c</p>', { history: true })
    editor.setHTML('<p>b</p>')
    expect(editor.can('redo')).toBe(false)
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('keeps the stacks for a transaction that changes more after a nested command', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>ab</p>', { history: true })
    const text = textOf(editor, [0, 0])
    editor.transact(() => {
      select(text, 0, text, 2)
      editor.exec('bold')
      editor.root.append(document.createElement('p'))
    })
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('emits beforeChange and update once per undo and redo', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    const events: string[] = []
    editor.on('beforeChange', () => events.push('beforeChange'))
    editor.on('update', () => events.push(`update ${editor.getHTML()}`))
    editor.exec('undo')
    editor.exec('redo')
    expect(events).toEqual(['beforeChange', 'update <p>a</p>', 'beforeChange', 'update <p>b</p>'])
  })

  it('skips a no-op command and does not leak its snapshot into a later setHTML', async () => {
    const editor = historyEditor('<p>a</p>')
    expect(editor.exec('bold')).toBe(false)
    await Promise.resolve()
    editor.setHTML('<p>b</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('skips identical snapshots from unchanged transactions', () => {
    const editor = historyEditor('<p>a</p>')
    editor.transact(() => undefined)
    editor.transact(() => undefined)
    expect(editor.can('undo')).toBe(false)
  })

  it('records a typed step whose first input left the content unchanged', () => {
    const editor = historyEditor('<p>a</p>')
    select(textOf(editor, [0, 0]), 1)
    beforeInput(editor, 'insertText', { data: 'b' })
    dispatch(editor.root, 'input')
    typeText(editor, 'b')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('routes the keys to undo and redo', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })

    expect(keyDown(editor, { key: 'z', ctrlKey: true }).defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    keyDown(editor, { key: 'Z', metaKey: true, shiftKey: true })
    expect(editor.getHTML()).toBe('<p>b</p>')
    editor.exec('undo')
    keyDown(editor, { key: 'y', ctrlKey: true })
    expect(editor.getHTML()).toBe('<p>b</p>')
  })

  it('routes beforeinput historyUndo and historyRedo', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })

    expect(beforeInput(editor, 'historyUndo').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(beforeInput(editor, 'historyRedo').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>b</p>')
  })

  it('blocks undo and redo while readonly', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    editor.exec('undo')
    editor.setHTML('<p>c</p>', { history: true })
    editor.exec('undo')
    editor.setReadonly(true)

    expect(editor.can('undo')).toBe(false)
    expect(editor.can('redo')).toBe(false)
    expect(editor.exec('undo')).toBe(false)
    keyDown(editor, { key: 'z', ctrlKey: true })
    expect(beforeInput(editor, 'historyRedo').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')

    editor.setReadonly(false)
    expect(editor.exec('undo')).toBe(false)
    expect(editor.exec('redo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>c</p>')
  })

  it('records a composition as one step and never snapshots during it', () => {
    const editor = historyEditor('<p>x</p>')
    editor.setHTML('<p>a</p>', { history: true })
    const text = textOf(editor, [0, 0])
    select(text, 1)
    dispatch(editor.root, 'compositionstart')
    for (const data of ['k', 'ka', 'か']) {
      beforeInput(editor, 'insertCompositionText', { data, isComposing: true })
      text.replaceData(1, text.length - 1, data)
      dispatch(editor.root, 'input')
    }
    expect(editor.can('undo')).toBe(false)
    expect(editor.exec('undo')).toBe(false)
    expect(beforeInput(editor, 'historyUndo').defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe('<p>aか</p>')

    dispatch(editor.root, 'compositionend')
    expect(editor.can('undo')).toBe(true)
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>x</p>')
    expect(editor.can('undo')).toBe(false)
  })

  it('keeps the composition snapshot across microtasks', async () => {
    const editor = historyEditor('<p>a</p>')
    const text = textOf(editor, [0, 0])
    select(text, 1)
    dispatch(editor.root, 'compositionstart')
    await Promise.resolve()
    text.appendData('か')
    dispatch(editor.root, 'compositionend')
    editor.exec('undo')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })

  it('restores snapshots through the sanitizing path', () => {
    const editor = historyEditor('<p>a</p>')
    editor.root.innerHTML = '<p>a<img src="x" onerror="alert(1)"><script>alert(2)</script></p>'
    editor.setHTML('<p>b</p>', { history: true })
    editor.exec('undo')
    expect(editor.root.innerHTML).toBe('<p>a</p>')
    expect(editor.root.querySelector('img, script, [onerror]')).toBeNull()
  })

  it('restores an empty document', () => {
    const editor = historyEditor('')
    editor.setHTML('<p>b</p>', { history: true })
    editor.exec('undo')
    expect(editor.getHTML()).toBe('')
    expect(editor.isEmpty()).toBe(true)
  })

  it('keeps separate stacks per editor', () => {
    const editor = historyEditor('<p>a</p>')
    const other = historyEditor('<p>x</p>')
    other.setHTML('<p>y</p>', { history: true })
    expect(editor.can('undo')).toBe(false)
    expect(other.can('undo')).toBe(true)
  })

  it('keeps the stacks of two editors apart when they share one module instance', () => {
    const shared = [history(), bold()]
    const first = createEditor({ content: '<p>secret A</p>', modules: shared })
    const second = createEditor({ content: '<p>B</p>', modules: shared })
    first.setHTML('<p>A edited</p>', { history: true })
    expect(second.can('undo')).toBe(false)
    expect(second.exec('undo')).toBe(false)
    expect(second.getHTML()).toBe('<p>B</p>')
    second.setHTML('<p>B edited</p>', { history: true })
    expect(first.exec('undo')).toBe(true)
    expect(first.getHTML()).toBe('<p>secret A</p>')
    expect(second.exec('undo')).toBe(true)
    expect(second.getHTML()).toBe('<p>B</p>')
  })

  it('tracks composition per editor when the module instance is shared', () => {
    const shared = [history()]
    const first = createEditor({ content: '<p>a</p>', modules: shared })
    const second = createEditor({ content: '<p>b</p>', modules: shared })
    second.setHTML('<p>c</p>', { history: true })
    dispatch(first.root, 'compositionstart')
    expect(second.can('undo')).toBe(true)
  })

  it('records a transaction that runs a command as one step', () => {
    const editor = historyEditor('<p>a</p>')
    const text = textOf(editor, [0, 0])
    editor.transact(() => {
      text.appendData('b')
      select(text, 1, text, 2)
      editor.exec('bold')
    })
    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>')
    expect(editor.exec('undo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(editor.can('undo')).toBe(false)
    expect(editor.exec('redo')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a<strong>b</strong></p>')
  })

  it('starts a new step for a command after typing that left the content unchanged', () => {
    const editor = historyEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 2)
    beforeInput(editor, 'insertText', { data: 'c' })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 1)
    editor.exec('bold')
    editor.exec('undo')
    expect(selectedText()).toBe('a')
  })

  it('stops tracking composition after destroy', () => {
    const editor = historyEditor('<p>a</p>')
    editor.setHTML('<p>b</p>', { history: true })
    editor.destroy()
    dispatch(editor.root, 'compositionstart')
    expect(editor.can('undo')).toBe(true)
  })
})
