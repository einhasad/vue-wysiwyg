import { nodeLength } from '../core/selection.js'
import type { Editor, TagKind } from '../core/types.js'

const moved = new Map<Node, Node>()

export const kindOf = (editor: Editor, node: Node): TagKind | undefined =>
  editor.schema.tags.get((node as Element).localName)?.kind

export const lineOf = (editor: Editor, node: Node): Element | undefined => {
  for (
    let current: Node | null = node;
    current && current !== editor.root;
    current = current.parentNode
  ) {
    const kind = kindOf(editor, current)
    if (kind === 'block' || kind === 'item') {
      return current as Element
    }
  }
  return undefined
}

export const selectedLines = (editor: Editor): Element[] => {
  const range = editor.selection.range()
  if (!range) {
    return []
  }
  const { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer } = range
  const lines = new Set(range.collapsed ? [lineOf(editor, startContainer)] : [])
  const walker = editor.root.ownerDocument.createTreeWalker(commonAncestorContainer)
  for (let node: Node | null = walker.root; node && !range.collapsed; node = walker.nextNode()) {
    if (
      !node.firstChild &&
      range.intersectsNode(node) &&
      !(node === startContainer && startOffset === nodeLength(node)) &&
      !(node === endContainer && !endOffset)
    ) {
      lines.add(lineOf(editor, node))
    }
  }
  return [...lines].filter((line) => !!line)
}

export const isLineActive = (editor: Editor, test: (line: Element) => boolean): boolean => {
  const lines = selectedLines(editor)
  return lines.length > 0 && lines.every(test)
}

export const retag = (element: Element, tag: string): Element => {
  const copy = element.ownerDocument.createElement(tag)
  copy.append(...element.childNodes)
  element.replaceWith(copy)
  return copy
}

export const retagTracked = (element: Element, tag: string): Element => {
  const copy = retag(element, tag)
  moved.set(element, copy)
  return copy
}

export const keepSelection = (editor: Editor, change: () => void): boolean => {
  const selection = editor.root.ownerDocument.getSelection() as Selection
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
  const at = (node: Node | null, offset: number): [Node, number] => {
    const target = moved.get(node as Node) ?? (node as Node)
    return [target, Math.min(offset, nodeLength(target))]
  }
  moved.clear()
  change()
  selection.setBaseAndExtent(...at(anchorNode, anchorOffset), ...at(focusNode, focusOffset))
  return true
}

export const outdent = (editor: Editor, item: Element): Element => {
  const list = item.parentNode as Element
  const outer = list.parentNode as Node
  let next = item.nextSibling
  if (next) {
    const last = item.lastElementChild
    const sublist =
      last?.localName === list.localName
        ? last
        : item.appendChild(item.ownerDocument.createElement(list.localName))
    for (; next; next = item.nextSibling) {
      sublist.append(next)
    }
  }
  if (outer !== editor.root) {
    ;(outer as Element).after(item)
    return item
  }
  const block = retagTracked(item, 'p')
  list.after(block, ...[...block.children].filter((child) => kindOf(editor, child) === 'list'))
  return block
}

export const lift = (editor: Editor, item: Element): void => {
  for (let line = item; kindOf(editor, line) === 'item';) {
    line = outdent(editor, line)
  }
}

export const setBlocks = (editor: Editor, tag: string): boolean => {
  const blocks = selectedLines(editor).filter((line) => kindOf(editor, line) === 'block')
  const target = blocks.every((block) => block.localName === tag) ? 'p' : tag
  const path = editor.selection.save()
  for (const block of blocks) {
    retag(block, target)
  }
  editor.selection.restore(path)
  return blocks.length > 0
}
