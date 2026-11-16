import type { Module } from '../core/types.js'
import { markModule } from '../shared/marks.js'

declare module '../core/types.js' {
  interface Commands {
    underline: undefined
  }
}

export const underline = (): Module => markModule('underline', 'u', 'Mod-u', 'formatUnderline')
