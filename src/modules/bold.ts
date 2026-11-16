import type { Module } from '../core/types.js'
import { markModule } from '../shared/marks.js'

declare module '../core/types.js' {
  interface Commands {
    bold: undefined
  }
}

export const bold = (): Module => markModule('bold', 'strong', 'Mod-b', 'formatBold', 'b')
