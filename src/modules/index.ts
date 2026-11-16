import type { Module } from '../core/types.js'
import { bold } from './bold.js'
import { heading, type HeadingOptions } from './heading.js'
import { history, type HistoryOptions } from './history.js'
import { italic } from './italic.js'
import { link, type LinkOptions } from './link.js'
import { lists, type ListsOptions } from './lists.js'
import { paste } from './paste.js'
import { placeholder, type PlaceholderOptions } from './placeholder.js'
import { underline } from './underline.js'

export { bold, heading, history, italic, link, lists, paste, placeholder, underline }
export type { HeadingLevel, HeadingOptions } from './heading.js'
export type { HistoryOptions } from './history.js'
export type { ListsOptions, ListType } from './lists.js'
export { linkHref, type LinkOptions } from './link.js'
export type { PlaceholderOptions } from './placeholder.js'
export {
  characterCount,
  type CharacterCountModule,
  type CharacterCountOptions,
} from './character-count.js'
export { markdownShortcuts } from './markdown-shortcuts.js'

export interface StarterKitOptions {
  readonly bold?: false
  readonly italic?: false
  readonly underline?: false
  readonly heading?: HeadingOptions | false
  readonly lists?: ListsOptions | false
  readonly link?: LinkOptions | false
  readonly history?: HistoryOptions | false
  readonly paste?: false
  readonly placeholder?: PlaceholderOptions | false
}

const STARTER_MODULES: Readonly<Record<keyof StarterKitOptions, (options?: never) => Module>> = {
  bold,
  italic,
  underline,
  heading,
  lists,
  link,
  history,
  paste,
  placeholder,
}

export const starterKit = (options: StarterKitOptions = {}): Module[] =>
  Object.entries(STARTER_MODULES).flatMap(([name, create]) => {
    const option = options[name as keyof StarterKitOptions]
    return option === false ? [] : [create(option as never)]
  })
