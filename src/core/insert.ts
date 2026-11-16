import type { Schema } from './types.js'
import { isEmptyNode } from '../normalize/empty.js'
import { isBlockLevel } from '../sanitize/schema.js'
import { nodeLength } from './selection.js'

const removeIfEmpty = (node: ChildNode | null): void => {
  if (node && isEmptyNode(node as Element)) {
    node.remove()
  }
}

const placeCaret = (range: Range): void => {
  range.collapse(true)
  range.startContainer.ownerDocument
    ?.getSelection()
    ?.collapse(range.startContainer, range.startOffset)
}

export function textToFragment(document: Document, text: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  text.split(/\r\n?|\n/).forEach((line, index) => {
    if (index) {
      fragment.appendChild(document.createElement('br'))
    }
    fragment.appendChild(document.createTextNode(line))
  })
  return fragment
}

export function insertFragment(
  root: Element,
  schema: Schema,
  range: Range,
  fragment: DocumentFragment,
): void {
  const last = fragment.lastChild
  range.deleteContents()
  if (!last) {
    return
  }
  let block = range.startContainer
  if (
    block !== root &&
    Array.from(fragment.childNodes).some((node) => isBlockLevel(schema, node))
  ) {
    while (block.parentNode !== root) {
      block = block.parentNode as Node
    }
    const tail = range.cloneRange()
    tail.setEndAfter(block)
    const rest = tail.extractContents()
    const restBlock = rest.firstChild
    ;(block as ChildNode).after(fragment, rest)
    removeIfEmpty(block as ChildNode)
    removeIfEmpty(restBlock)
    range.setStart(last, nodeLength(last))
  } else {
    range.insertNode(fragment)
    range.setStartAfter(last)
  }
  placeCaret(range)
}

export function insertLineBreak(root: Element, schema: Schema, range: Range): void {
  const document = root.ownerDocument
  const lineBreak = document.createElement('br')
  range.deleteContents()
  range.insertNode(lineBreak)
  const next = lineBreak.nextSibling
  if (next?.nodeType === 3 && !(next as Text).data) {
    next.remove()
  }
  let block = lineBreak.parentNode as Node
  while (block !== root && !isBlockLevel(schema, block)) {
    block = block.parentNode as Node
  }
  const rest = document.createRange()
  rest.setStartAfter(lineBreak)
  rest.setEnd(block, block.childNodes.length)
  if (!rest.toString() && !rest.cloneContents().querySelector('br')) {
    lineBreak.after(document.createElement('br'))
  }
  range.setStartAfter(lineBreak)
  placeCaret(range)
}
