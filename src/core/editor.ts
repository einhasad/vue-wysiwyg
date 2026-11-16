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

const INTERNAL_DRAG_TYPE = 'x-wysiwyg'
const OWNED_ATTRIBUTES =
  'role aria-multiline aria-readonly aria-label contenteditable tabindex style'.split(' ')
const TRANSFER_INPUT = /^insertFrom(Paste|PasteAsQuotation|Drop|Yank)$/
const HOOKED_INPUT = /^(insertText|insertParagraph|insertLineBreak|delete.*)$/
const ROUTED_INPUT: Readonly<Record<string, string | undefined>> = {
  historyUndo: 'undo',
  historyRedo: 'redo',
  insertLink: 'link',
}

export function createEditor(options: EditorOptions = {}): Editor {
  const root = options.element ?? document.createElement('div')
  const initialAttributes = new Map(OWNED_ATTRIBUTES.map((name) => [name, root.getAttribute(name)]))
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
  let destroyed = false
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

  const selectionInRoot = (): Selection | null => {
    const current = domSelection()
    return current && root.contains(current.anchorNode) && root.contains(current.focusNode)
      ? current
      : null
  }

  const selection: EditorSelection = {
    range: () => selectionInRoot()?.getRangeAt(0) ?? null,
    save() {
      const current = selectionInRoot()
      return current
        ? {
            anchor: pathOf(root, current.anchorNode as Node, current.anchorOffset),
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
    const { anchorNode, anchorOffset, focusNode, focusOffset } = domSelection() ?? ({} as Selection)
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
    if (!readonly && !destroyed) {
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
    if (destroyed || !can(name)) {
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
      internalDrag = !!event.dataTransfer?.types.includes(INTERNAL_DRAG_TYPE)
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
    dragstart(event: DragEvent) {
      event.dataTransfer?.setData(INTERNAL_DRAG_TYPE, '1')
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
      if (destroyed) {
        return
      }
      if (setOptions?.history) {
        emit('beforeChange')
      }
      const path = selection.save()
      root.replaceChildren(sanitizeInput(html))
      commit()
      selection.restore(path)
    },
    getValue: () => format.stringify(editor.getHTML()),
    setValue(value, setOptions) {
      editor.setHTML(format.parse(value, schema), setOptions)
    },
    isEmpty: () => isEmptyNode(root),
    textLength: () => root.textContent.length,
    exec: exec,
    can: can,
    isActive: (name, arg) => commands.get(name)?.isActive?.(editor, arg as never) ?? false,
    transact,
    setReadonly(value) {
      if (destroyed) {
        return
      }
      readonly = value
      root.contentEditable = String(!value)
      root.setAttribute('aria-readonly', String(value))
      if (initialAttributes.get('tabindex') === null) {
        if (value) {
          root.tabIndex = 0
        } else {
          root.removeAttribute('tabindex')
        }
      }
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
      if (destroyed) {
        return
      }
      destroyed = true
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
      for (const [name, value] of initialAttributes) {
        if (value === null) {
          root.removeAttribute(name)
        } else {
          root.setAttribute(name, value)
        }
      }
    },
  }

  root.setAttribute('role', 'textbox')
  root.setAttribute('aria-multiline', 'true')
  if (options.label) {
    root.setAttribute('aria-label', options.label)
  } else if (!root.hasAttribute('aria-label')) {
    root.setAttribute('aria-label', 'Rich text editor')
  }
  root.style.whiteSpace = 'pre-wrap'
  editor.setReadonly(!!options.readonly)
  root.replaceChildren(sanitizeInput(format.parse(options.content ?? '', schema)))
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
