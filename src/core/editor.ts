import { isEmptyNode } from '../normalize/empty.js'
import { normalizeElement } from '../normalize/normalize.js'
import { sanitizeToFragment } from '../sanitize/sanitizer.js'
import { createSchema } from '../sanitize/schema.js'
import { htmlFormat } from './html-format.js'
import { insertFragment, insertLineBreak, textToFragment } from './insert.js'
import { keyOf, normalizeKeySpec } from './keys.js'
import { nodeLength, pathOf, resolvePath } from './selection.js'
import type {
  CommandSpec,
  Editor,
  EditorEvent,
  EditorListener,
  EditorOptions,
  EditorSelection,
} from './types.js'

const TRANSFER_INPUT = /^insertFrom(Paste|PasteAsQuotation|Drop|Yank)$/
const HOOKED_INPUT = /^(insertText|insertParagraph|insertLineBreak|delete.*)$/
const ROUTED_INPUT: Readonly<Record<string, string | undefined>> = {
  historyUndo: 'undo',
  historyRedo: 'redo',
  insertLink: 'link',
}

export function createEditor(options: EditorOptions = {}): Editor {
  const root = options.element ?? document.createElement('div')
  const ownerDocument = root.ownerDocument
  const modules = [...(options.modules ?? [])].sort(
    (first, second) => (second.priority ?? 0) - (first.priority ?? 0),
  )
  const schema = createSchema(modules, options)
  const format = options.format ?? htmlFormat
  const commands = new Map<string, CommandSpec<never>>()
  const keys = new Map<string, string>()
  const inputTypes = new Map<string, string>()
  const listeners = new Map<EditorEvent, Set<EditorListener>>()
  const cleanups: (() => void)[] = []
  let readonly = false
  let composing = false
  let internalDrag = false
  let frame = 0

  for (const module of modules) {
    for (const [name, spec] of Object.entries(module.commands ?? {})) {
      if (commands.has(name)) {
        throw new Error(`Duplicate command: ${name}`)
      }
      commands.set(name, spec)
    }
    for (const [spec, command] of Object.entries(module.keys ?? {})) {
      keys.set(normalizeKeySpec(spec), command)
    }
    for (const [type, command] of Object.entries(module.inputTypes ?? {})) {
      inputTypes.set(type, command)
    }
  }

  const emit = (event: EditorEvent, native?: Event): void => {
    for (const listener of listeners.get(event) ?? []) {
      listener(editor, native)
    }
  }

  const domSelection = (): Selection | null => ownerDocument.getSelection()

  const insideBlock = (node: Node, offset: number): [Node, number] => {
    const child = root.childNodes[offset]
    const last = root.lastChild as Node
    return node !== root
      ? [node, Math.min(offset, nodeLength(node))]
      : child
        ? [child, 0]
        : [last, nodeLength(last)]
  }

  const select = (anchor: Node, anchorOffset: number, focus: Node, focusOffset: number): void => {
    domSelection()?.setBaseAndExtent(
      ...insideBlock(anchor, anchorOffset),
      ...insideBlock(focus, focusOffset),
    )
  }

  const selection: EditorSelection = {
    range() {
      const current = domSelection()
      return current?.rangeCount && root.contains(current.anchorNode) ? current.getRangeAt(0) : null
    },
    save() {
      const current = domSelection()
      return current?.anchorNode &&
        root.contains(current.anchorNode) &&
        root.contains(current.focusNode)
        ? {
            anchor: pathOf(root, current.anchorNode, current.anchorOffset),
            focus: pathOf(root, current.focusNode as Node, current.focusOffset),
          }
        : null
    },
    restore(path) {
      if (path) {
        select(...resolvePath(root, path.anchor), ...resolvePath(root, path.focus))
      }
    },
  }

  const normalize = (): void => {
    const current = domSelection() as Selection
    const { anchorNode, anchorOffset, focusNode, focusOffset } = current
    const path = selection.save()
    if (normalizeElement(root, schema) && path) {
      if (root.contains(anchorNode) && root.contains(focusNode)) {
        select(anchorNode as Node, anchorOffset, focusNode as Node, focusOffset)
      } else {
        selection.restore(path)
      }
    }
  }

  const sanitizeInput = (html: string): DocumentFragment =>
    sanitizeToFragment(html, { schema, document: ownerDocument, sanitizer: options.sanitizer })

  const commit = (): void => {
    normalize()
    emit('update')
  }

  const transact = (mutate: () => void): void => {
    if (!readonly) {
      emit('beforeChange')
      mutate()
      commit()
    }
  }

  const insertTransfer = (data: DataTransfer | null): void => {
    const range = selection.range()
    if (data && range) {
      transact(() => {
        const html = data.getData('text/html')
        insertFragment(
          root,
          schema,
          range,
          html
            ? sanitizeInput(
                modules.reduce(
                  (value, module) => module.transformPastedHTML?.(value, editor) ?? value,
                  html,
                ),
              )
            : textToFragment(
                ownerDocument,
                modules.reduce(
                  (value, module) => module.transformPastedText?.(value, editor) ?? value,
                  data.getData('text/plain'),
                ),
              ),
        )
      })
    }
  }

  const lineBreak = (): void => {
    const range = selection.range()
    if (range) {
      transact(() => {
        insertLineBreak(root, schema, range)
      })
    }
  }

  const can = (name: string): boolean => {
    const spec = commands.get(name)
    return !readonly && !!spec && (spec.isEnabled?.(editor) ?? true)
  }

  const exec = (name: string, arg?: unknown): boolean => {
    if (!can(name)) {
      return false
    }
    emit('beforeChange')
    const done = (commands.get(name) as CommandSpec<unknown>).run(editor, arg)
    if (done) {
      commit()
    }
    return done
  }

  const handlers: Readonly<Record<string, (event: never) => void>> = {
    beforeinput(event: InputEvent) {
      const type = event.inputType
      const command = ROUTED_INPUT[type] ?? inputTypes.get(type)
      if (readonly) {
        event.preventDefault()
      } else if (type === 'insertFromDrop' && internalDrag) {
        emit('beforeChange', event)
      } else if (TRANSFER_INPUT.test(type)) {
        event.preventDefault()
        insertTransfer(event.dataTransfer)
      } else if (command || type.startsWith('format')) {
        event.preventDefault()
        if (command) {
          exec(command, event.data)
        }
      } else if (!composing && !event.isComposing) {
        if (
          HOOKED_INPUT.test(type) &&
          modules.some((module) => module.onBeforeInput?.(event, editor))
        ) {
          event.preventDefault()
        } else if (type === 'insertLineBreak') {
          event.preventDefault()
          lineBreak()
        } else {
          emit('beforeChange', event)
        }
      }
    },
    input() {
      if (!composing) {
        commit()
      }
    },
    compositionstart() {
      composing = true
      emit('beforeChange')
    },
    compositionend() {
      composing = false
      commit()
    },
    keydown(event: KeyboardEvent) {
      emit('keydown', event)
      if (readonly || composing || event.isComposing || event.defaultPrevented) {
        return
      }
      const key = keyOf(event)
      const command = keys.get(key)
      if (modules.some((module) => module.onKeyDown?.(event, editor))) {
        event.preventDefault()
      } else if (command) {
        event.preventDefault()
        exec(command)
      } else if (key === 'Shift-enter') {
        event.preventDefault()
        lineBreak()
      }
    },
    paste(event: ClipboardEvent) {
      event.preventDefault()
      insertTransfer(event.clipboardData)
    },
    drop(event: DragEvent) {
      if (!internalDrag) {
        event.preventDefault()
        const caret = (ownerDocument as Partial<Document>).caretPositionFromPoint?.(
          event.clientX,
          event.clientY,
        )
        if (caret && root.contains(caret.offsetNode)) {
          domSelection()?.collapse(caret.offsetNode, caret.offset)
        }
        insertTransfer(event.dataTransfer)
      }
    },
    dragstart() {
      internalDrag = true
    },
    dragend() {
      internalDrag = false
    },
    focus(event: FocusEvent) {
      emit('focus', event)
    },
    blur(event: FocusEvent) {
      emit('blur', event)
    },
  }

  const onSelectionChange = (): void => {
    if (!frame && selection.range()) {
      frame = requestAnimationFrame(() => {
        frame = 0
        emit('selection')
      })
    }
  }

  const editor: Editor = {
    root,
    schema,
    selection,
    get readonly() {
      return readonly
    },
    get commands() {
      return [...commands.keys()]
    },
    getHTML: () => (isEmptyNode(root) ? '' : root.innerHTML),
    setHTML(html, setOptions) {
      if (setOptions?.history) {
        emit('beforeChange')
      }
      root.replaceChildren(sanitizeInput(html))
      commit()
    },
    getValue: () => format.stringify(editor.getHTML()),
    setValue(value, setOptions) {
      editor.setHTML(format.parse(value), setOptions)
    },
    isEmpty: () => isEmptyNode(root),
    textLength: () => root.textContent.length,
    exec: exec,
    can: can,
    isActive: (name, arg) => commands.get(name)?.isActive?.(editor, arg as never) ?? false,
    transact,
    setReadonly(value) {
      readonly = value
      root.contentEditable = String(!value)
      root.setAttribute('aria-readonly', String(value))
      emit('readonly')
    },
    focus() {
      root.focus()
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      listeners.set(event, set.add(listener))
      return () => set.delete(listener)
    },
    destroy() {
      emit('destroy')
      cancelAnimationFrame(frame)
      for (const [type, handler] of Object.entries(handlers)) {
        root.removeEventListener(type, handler as EventListener)
      }
      ownerDocument.removeEventListener('selectionchange', onSelectionChange)
      for (const cleanup of cleanups) {
        cleanup()
      }
      listeners.clear()
      root.removeAttribute('contenteditable')
    },
  }

  root.setAttribute('role', 'textbox')
  root.setAttribute('aria-multiline', 'true')
  if (options.label) {
    root.setAttribute('aria-label', options.label)
  }
  root.style.whiteSpace = 'pre-wrap'
  editor.setReadonly(!!options.readonly)
  root.replaceChildren(sanitizeInput(format.parse(options.content ?? '')))
  normalizeElement(root, schema)
  for (const [type, handler] of Object.entries(handlers)) {
    root.addEventListener(type, handler as EventListener)
  }
  ownerDocument.addEventListener('selectionchange', onSelectionChange)
  for (const module of modules) {
    const cleanup = module.setup?.(editor)
    if (cleanup) {
      cleanups.push(cleanup)
    }
  }
  return editor
}
