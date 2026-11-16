import type { Editor, Module, SelectionPath } from '../core/types.js'

interface Snapshot {
  readonly html: string
  readonly selection: SelectionPath | null
}

export interface HistoryOptions {
  readonly depth?: number
  readonly groupDelay?: number
}

export const history = ({ depth = 100, groupDelay = 500 }: HistoryOptions = {}): Module => {
  const done: Snapshot[] = []
  const undone: Snapshot[] = []
  let pending: Snapshot | undefined
  let lastType: string | undefined
  let lastTime = 0
  let composing = false

  const travel = (editor: Editor, from: Snapshot[], to: Snapshot[]): boolean => {
    const target = from.pop() as Snapshot
    to.push(pending as Snapshot)
    pending = lastType = undefined
    editor.setHTML(target.html)
    editor.selection.restore(target.selection)
    return true
  }

  return {
    name: 'history',
    commands: {
      undo: {
        run: (editor) => travel(editor, done, undone),
        isEnabled: () => !composing && !!done.length,
      },
      redo: {
        run: (editor) => travel(editor, undone, done),
        isEnabled: () => !composing && !!undone.length,
      },
    },
    keys: { 'Mod-z': 'undo', 'Mod-Shift-z': 'redo', 'Mod-y': 'redo' },
    setup(editor) {
      editor.on('beforeChange', (_editor, event) => {
        const type = (event as InputEvent | undefined)?.inputType
        const now = Date.now()
        if (!type || type !== lastType || now - lastTime > groupDelay) {
          pending = { html: editor.getHTML(), selection: editor.selection.save() }
        }
        if (!type) {
          queueMicrotask(() => {
            if (!composing) {
              pending = undefined
            }
          })
        }
        lastType = type
        lastTime = now
      })
      editor.on('update', () => {
        if (pending?.html === editor.getHTML()) {
          lastType = undefined
        } else if (pending) {
          done.push(pending)
          undone.length = 0
          if (done.length > depth) {
            done.shift()
          }
        }
        pending = undefined
      })
      const trackComposition = (event: Event): void => {
        composing = event.type === 'compositionstart'
      }
      editor.root.addEventListener('compositionstart', trackComposition)
      editor.root.addEventListener('compositionend', trackComposition)
      return () => {
        editor.root.removeEventListener('compositionstart', trackComposition)
        editor.root.removeEventListener('compositionend', trackComposition)
      }
    },
  }
}
