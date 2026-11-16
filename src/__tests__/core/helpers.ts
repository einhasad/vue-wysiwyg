import { createEditor } from '../../core/editor.js'
import type { Editor, EditorOptions } from '../../core/types.js'

export const mountEditor = (options: EditorOptions = {}): Editor => {
  const element = document.createElement('div')
  document.body.replaceChildren(element)
  return createEditor({ element, ...options })
}

export const transfer = (data: Readonly<Record<string, string>>): DataTransfer =>
  ({ getData: (type: string) => data[type] ?? '' }) as DataTransfer

export const dispatch = (
  target: EventTarget,
  type: string,
  props: Readonly<Record<string, unknown>> = {},
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { value })
  }
  target.dispatchEvent(event)
  return event
}

export const beforeInput = (
  editor: Editor,
  inputType: string,
  props: Readonly<Record<string, unknown>> = {},
): InputEvent =>
  dispatch(editor.root, 'beforeinput', {
    inputType,
    data: null,
    isComposing: false,
    dataTransfer: null,
    ...props,
  }) as InputEvent

export const keyDown = (editor: Editor, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  editor.root.dispatchEvent(event)
  return event
}

export const select = (
  startNode: Node,
  startOffset: number,
  endNode: Node = startNode,
  endOffset: number = startOffset,
): void => {
  document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
}

export const textOf = (editor: Editor, index: number[]): Text => {
  let node: Node = editor.root
  for (const step of index) {
    node = node.childNodes[step] as Node
  }
  return node as Text
}

export const selectedText = (): string => document.getSelection()?.toString() ?? ''
