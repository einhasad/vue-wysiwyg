import type { Editor, Module } from '../core/types.js'
import { isLineActive, setBlocks } from '../shared/blocks.js'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface HeadingOptions {
  readonly levels?: readonly HeadingLevel[]
}

declare module '../core/types.js' {
  interface Commands {
    heading: HeadingLevel
  }
}

const ALL_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6]

const tagOf = (level?: number): string => `h${String(level)}`

export const heading = ({ levels = ALL_LEVELS }: HeadingOptions = {}): Module => ({
  name: 'heading',
  schema: {
    tags: Object.fromEntries(levels.map((level) => [tagOf(level), { kind: 'block', attrs: [] }])),
    rename: Object.fromEntries(
      ALL_LEVELS.map((level) => [tagOf(level), levels.includes(level) ? tagOf(level) : 'p']),
    ),
  },
  commands: {
    heading: {
      run: (editor: Editor, level: HeadingLevel) =>
        levels.includes(level) && setBlocks(editor, tagOf(level)),
      isActive: (editor: Editor, level?: HeadingLevel) =>
        isLineActive(editor, (line) => line.localName === tagOf(level)),
    },
  },
  onKeyDown(event, editor) {
    const level = +event.code.slice(5) as HeadingLevel
    return (
      event.altKey &&
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      levels.includes(level) &&
      editor.exec('heading', level)
    )
  },
})
