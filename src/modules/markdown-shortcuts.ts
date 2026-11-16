import type { Editor, Module } from '../core/types.js'

interface CommandRunner {
  exec(name: string, arg?: number): boolean
  can(name: string): boolean
  isActive(name: string): boolean
}

const BLOCK_MARKER = /^(#{1,6}|[-*+]|\d{1,9}[.)])$/

const blockCommand = (marker: string): string =>
  marker.startsWith('#') ? 'heading' : marker > '/' ? 'orderedList' : 'bulletList'

const blockShortcut = (editor: Editor, text: Text, marker: string): boolean => {
  const runner = editor as unknown as CommandRunner
  const name = blockCommand(marker)
  const block = text.parentNode as Element
  let done = false
  if (
    block.localName === 'p' &&
    block.parentNode === editor.root &&
    block.firstChild === text &&
    runner.can(name)
  ) {
    editor.transact(() => {
      done = runner.exec(name, marker.length)
      if (done) {
        text.deleteData(0, marker.length)
      }
    })
  }
  return done
}

const markShortcut = (editor: Editor, text: Text, before: string): Element | undefined => {
  const runner = editor as unknown as CommandRunner
  const strong = before.endsWith('*')
  const name = strong ? 'bold' : 'italic'
  const open = strong ? before.lastIndexOf('**', before.length - 3) : before.lastIndexOf('*')
  const start = open + (strong ? 2 : 1)
  const end = before.length - +strong
  const content = before.slice(start, end)
  const selection = editor.root.ownerDocument.getSelection() as Selection
  if (
    open < 0 ||
    content.trim() !== content ||
    !content.length ||
    (!strong && before[open - 1] === '*') ||
    !runner.can(name)
  ) {
    return undefined
  }
  selection.setBaseAndExtent(text, start, text, end)
  if (runner.isActive(name)) {
    selection.collapse(text, before.length)
    return undefined
  }
  let mark: Element | undefined
  editor.transact(() => {
    runner.exec(name)
    mark = (editor.selection.range() as Range).startContainer.parentNode as Element
    const opening = mark.previousSibling as Text
    const caret = editor.root.ownerDocument.createTextNode('')
    opening.deleteData(opening.length - start + open, start - open)
    if (strong) {
      ;(mark.nextSibling as Text).deleteData(0, 1)
    }
    mark.after(caret)
    selection.collapse(caret, 0)
  })
  return mark
}

const isAtMarkEnd = (range: Range, mark: Element): boolean => {
  const between = range.cloneRange()
  const rest = range.cloneRange()
  between.setStartAfter(mark)
  rest.selectNodeContents(mark)
  rest.setStart(range.startContainer, range.startOffset)
  return mark.isConnected && !between.toString() && !rest.toString()
}

const typeAfterMark = (editor: Editor, mark: Element, data: string): boolean => {
  editor.transact(() => {
    let text = mark.nextSibling
    if (text?.nodeType !== 3) {
      text = editor.root.ownerDocument.createTextNode('')
      mark.after(text)
    }
    ;(text as Text).insertData(0, data)
    editor.root.ownerDocument.getSelection()?.collapse(text, data.length)
  })
  return true
}

const lastMarks = new WeakMap<Editor, Element | undefined>()

export const markdownShortcuts = (): Module => ({
  name: 'markdownShortcuts',
  onBeforeInput(event, editor) {
    const range = editor.selection.range()
    const text = range?.startContainer as Text | undefined
    const mark = lastMarks.get(editor)
    lastMarks.delete(editor)
    if (event.inputType !== 'insertText' || !range?.collapsed || !event.data) {
      return false
    }
    if (mark && isAtMarkEnd(range, mark)) {
      return typeAfterMark(editor, mark, event.data)
    }
    if (text?.nodeType !== 3) {
      return false
    }
    const before = text.data.slice(0, range.startOffset)
    if (event.data === ' ' && BLOCK_MARKER.test(before)) {
      return blockShortcut(editor, text, before)
    }
    const created = event.data === '*' ? markShortcut(editor, text, before) : undefined
    lastMarks.set(editor, created)
    return !!created
  },
})
