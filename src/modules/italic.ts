import type { Module } from '../core/types.js'
import { markModule } from '../shared/marks.js'

declare module '../core/types.js' {
  interface Commands {
    italic: undefined
  }
}

export const italic = (): Module => markModule('italic', 'em', 'Mod-i', 'formatItalic', 'i')
