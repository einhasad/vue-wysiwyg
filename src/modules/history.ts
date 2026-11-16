import type { CommandSpec, Editor, Module, SelectionPath } from '../core/types.js'

interface Snapshot {
  readonly html: string
  readonly selection: SelectionPath | null
}

interface Travel {
  run(): boolean
  isEnabled(): boolean
}

type Direction = 'undo' | 'redo'

export interface HistoryOptions {
  readonly depth?: number
  readonly groupDelay?: number
}

const travels = new WeakMap<Editor, Readonly<Record<Direction, Travel>>>()

const travelCommand = (direction: Direction): CommandSpec => ({
  run: (editor) => (travels.get(editor) as Record<Direction, Travel>)[direction].run(),
  isEnabled: (editor) => (travels.get(editor) as Record<Direction, Travel>)[direction].isEnabled(),
})

export const history = ({ depth = 100, groupDelay = 500 }: HistoryOptions = {}): Module => ({
  name: 'history',
  commands: { undo: travelCommand('undo'), redo: travelCommand('redo') },
  keys: { 'Mod-z': 'undo', 'Mod-Shift-z': 'redo', 'Mod-y': 'redo' },
  setup(editor) {
    const done: Snapshot[] = []
    const undone: Snapshot[] = []
    let pending: Snapshot | undefined
    let lastType: string | undefined
    let lastTime = 0
    let composing = false

    const travel = (from: Snapshot[], to: Snapshot[]): Travel => ({
      run() {
        const target = from.pop() as Snapshot
        to.push(pending as Snapshot)
        pending = lastType = undefined
        editor.setHTML(target.html)
        editor.selection.restore(target.selection)
        return true
      },
      isEnabled: () => !composing && !!from.length,
    })

    travels.set(editor, { undo: travel(done, undone), redo: travel(undone, done) })
    editor.on('beforeChange', (_editor, event) => {
      const type = (event as InputEvent | undefined)?.inputType
      const now = Date.now()
      const nested = !type && !!pending && !lastType
      if (!nested && (!type || type !== lastType || now - lastTime > groupDelay)) {
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
})
