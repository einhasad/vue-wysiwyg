import type { Editor, Module } from '../core/types.js'

const markAncestor = (
  editor: Editor,
  node: Node | null | undefined,
  tag: string,
): Element | undefined => {
  for (let current = node; current && current !== editor.root; current = current.parentNode) {
    if ((current as Element).localName === tag) {
      return current as Element
    }
  }
  return undefined
}

const selectedTexts = (editor: Editor, range: Range, split?: boolean): Text[] => {
  const { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer } = range
  const walker = editor.root.ownerDocument.createTreeWalker(commonAncestorContainer, 4)
  const texts: Text[] = []
  for (
    let node = commonAncestorContainer.nodeType === 3 ? commonAncestorContainer : walker.nextNode();
    node;
    node = walker.nextNode()
  ) {
    const text = node as Text
    if (
      text.data &&
      range.intersectsNode(text) &&
      !(text === startContainer && startOffset === text.length) &&
      !(text === endContainer && !endOffset)
    ) {
      texts.push(text)
    }
  }
  const last = texts.at(-1)
  if (split && last === endContainer && endOffset < last.length) {
    last.splitText(endOffset)
  }
  const first = texts[0]
  if (split && first === startContainer && startOffset) {
    texts[0] = first.splitText(startOffset)
  }
  return texts
}

const liftOut = (text: Text, mark: Element): void => {
  const range = text.ownerDocument.createRange()
  const extractPart = (): Element => {
    const part = mark.cloneNode() as Element
    part.append(range.extractContents())
    return part
  }
  range.setStart(mark, 0)
  range.setEndBefore(text)
  mark.before(extractPart())
  range.setStartAfter(text)
  range.setEnd(mark, mark.childNodes.length)
  mark.after(extractPart())
  mark.replaceWith(...mark.childNodes)
}

export type MarkAttributes = Readonly<Record<string, string>>

const applyAttributes = (element: Element, attributes: MarkAttributes): Element => {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
  return element
}

export function activeMark(editor: Editor, tag: string): Element | undefined {
  return markAncestor(editor, editor.selection.range()?.startContainer, tag)
}

export function isMarkActive(editor: Editor, tag: string): boolean {
  const range = editor.selection.range()
  const nodes: Node[] = range
    ? range.collapsed
      ? [range.startContainer]
      : selectedTexts(editor, range)
    : []
  return !!nodes[0] && nodes.every((node) => markAncestor(editor, node, tag))
}

export function setMark(editor: Editor, tag: string, attributes: MarkAttributes | null): boolean {
  const range = editor.selection.range()
  const texts = range && !range.collapsed ? selectedTexts(editor, range, true) : []
  const first = texts[0]
  const last = texts.at(-1) as Text
  if (!first) {
    return false
  }
  for (const text of texts) {
    const wrapper = attributes && applyAttributes(text.ownerDocument.createElement(tag), attributes)
    let mark = markAncestor(editor, text, tag)
    while (mark && !mark.cloneNode().isEqualNode(wrapper)) {
      liftOut(text, mark)
      mark = markAncestor(editor, text, tag)
    }
    if (wrapper && !mark) {
      text.replaceWith(wrapper)
      wrapper.append(text)
    }
  }
  editor.root.ownerDocument.getSelection()?.setBaseAndExtent(first, 0, last, last.length)
  return true
}

export function setMarkAtCaret(
  editor: Editor,
  tag: string,
  attributes: MarkAttributes | null,
): boolean {
  const range = editor.selection.range()
  if (!range?.collapsed) {
    return setMark(editor, tag, attributes)
  }
  const { startContainer, startOffset } = range
  const mark = markAncestor(editor, startContainer, tag)
  if (mark && attributes) {
    applyAttributes(mark, attributes)
  } else if (mark) {
    mark.replaceWith(...mark.childNodes)
    editor.root.ownerDocument.getSelection()?.collapse(startContainer, startOffset)
  }
  return !!mark
}

export function toggleMark(editor: Editor, tag: string, attributes: MarkAttributes = {}): boolean {
  return setMark(editor, tag, isMarkActive(editor, tag) ? null : attributes)
}

export const markModule = (
  name: string,
  tag: string,
  key: string,
  inputType: string,
  alias?: string,
): Module => ({
  name,
  schema: { tags: { [tag]: { kind: 'inline', attrs: [] } }, rename: alias ? { [alias]: tag } : {} },
  keys: { [key]: name },
  inputTypes: { [inputType]: name },
  commands: {
    [name]: {
      run: (editor: Editor) => toggleMark(editor, tag),
      isActive: (editor: Editor) => isMarkActive(editor, tag),
    },
  },
})
