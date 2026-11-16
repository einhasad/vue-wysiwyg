import type { Format } from '../core/types.js'
import { htmlToMd } from './html-to-md.js'
import { mdToHtml } from './md-to-html.js'

export { htmlToMd, mdToHtml }
export type { HtmlToMdOptions } from './html-to-md.js'
export { markdownShortcuts } from '../modules/markdown-shortcuts.js'

export const markdownFormat: Format = {
  parse: mdToHtml,
  stringify: (html) => htmlToMd(html),
}
