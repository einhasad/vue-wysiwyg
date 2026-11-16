import { keyOf } from '../core/keys.js'
import type { CommandSpec, Editor, Module } from '../core/types.js'
import { isEmptyNode } from '../normalize/empty.js'
import {
  isLineActive,
  keepSelection,
  lift,
  lineOf,
  outdent,
  retagTracked,
  selectedLines,
} from '../shared/blocks.js'

declare module '../core/types.js' {
  interface Commands {
    bulletList: undefined
    orderedList: undefined
    indentList: undefined
    outdentList: undefined
  }
}

const TAB_COMMANDS: Readonly<Record<string, 'indentList' | 'outdentList' | undefined>> = {
  tab: 'indentList',
  'Shift-tab': 'outdentList',
}

const isItem = (line: Element): boolean => line.localName === 'li'

const inList = (line: Element, tag: string): boolean =>
  isItem(line) && (line.parentNode as Element).localName === tag

const topItems = (editor: Editor): Element[] => {
  const items = selectedLines(editor).filter(isItem)
  return items.filter((item) => !items.some((other) => other !== item && other.contains(item)))
}

const mergeAdjacent = (editor: Editor, tag: string): void => {
  for (const list of editor.root.querySelectorAll(tag)) {
    const previous = list.previousElementSibling
    if (previous?.localName === tag) {
      previous.append(...list.childNodes)
      list.remove()
    }
  }
}

const toggleList = (editor: Editor, tag: string): boolean => {
  const lines = selectedLines(editor)
  const active = lines.every((line) => inList(line, tag))
  return (
    lines.length > 0 &&
    keepSelection(editor, () => {
      for (const line of lines) {
        const list = line.parentNode as Element
        if (active) {
          lift(editor, line)
        } else if (!isItem(line)) {
          const wrapper = line.ownerDocument.createElement(tag)
          line.before(wrapper)
          wrapper.append(retagTracked(line, 'li'))
        } else if (list.localName !== tag) {
          retagTracked(list, tag)
        }
      }
      mergeAdjacent(editor, tag)
    })
  )
}

const indent = (item: Element): void => {
  const previous = item.previousElementSibling
  const tag = (item.parentNode as Element).localName
  const last = previous?.lastElementChild
  if (previous) {
    ;(last?.localName === tag
      ? last
      : previous.appendChild(item.ownerDocument.createElement(tag))
    ).append(item)
  }
}

const listCommand = (tag: string): CommandSpec => ({
  run: (editor: Editor) => toggleList(editor, tag),
  isActive: (editor: Editor) => isLineActive(editor, (line) => inList(line, tag)),
})

const itemsCommand = (move: (item: Element, editor: Editor) => unknown): CommandSpec => ({
  run: (editor: Editor) =>
    keepSelection(editor, () => {
      for (const item of topItems(editor)) {
        move(item, editor)
      }
    }),
  isEnabled: (editor: Editor) => selectedLines(editor).some(isItem),
})

const isAtStart = (range: Range, line: Element): boolean => {
  const before = range.cloneRange()
  before.setStart(line, 0)
  return !before.toString() && !before.cloneContents().querySelector('br')
}

const exitItem = (editor: Editor, inputType: string): boolean => {
  const range = editor.selection.range()
  const line = range?.collapsed ? lineOf(editor, range.startContainer) : undefined
  if (
    !line ||
    !isItem(line) ||
    (inputType === 'insertParagraph'
      ? !isEmptyNode(line)
      : inputType !== 'deleteContentBackward' ||
        !!line.previousElementSibling ||
        !isAtStart(range as Range, line))
  ) {
    return false
  }
  editor.transact(() => keepSelection(editor, () => outdent(editor, line)))
  return true
}

export const lists = (): Module => ({
  name: 'lists',
  schema: {
    tags: {
      ul: { kind: 'list', attrs: [] },
      ol: { kind: 'list', attrs: [] },
      li: { kind: 'item', attrs: [] },
    },
  },
  commands: {
    bulletList: listCommand('ul'),
    orderedList: listCommand('ol'),
    indentList: itemsCommand(indent),
    outdentList: itemsCommand((item, editor) => outdent(editor, item)),
  },
  onBeforeInput: (event, editor) => exitItem(editor, event.inputType),
  onKeyDown(event, editor) {
    const key = keyOf(event)
    const command = TAB_COMMANDS[key]
    return key === 'backspace'
      ? exitItem(editor, 'deleteContentBackward')
      : !!command && editor.can(command) && editor.exec(command)
  },
})
