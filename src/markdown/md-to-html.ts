import type { UrlPolicy } from '../core/types.js'
import { inline } from './inline.js'

interface OpenList {
  tag: string
  content: number
}

const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(?: +|$)/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+|$)/

const headingText = (line: string): string => {
  const text = line.trim()
  let end = text.length
  while (text[end - 1] === '#') {
    end--
  }
  return !end || text[end - 1] === ' ' ? text.slice(0, end).trimEnd() : text
}

export function mdToHtml(markdown: string, policy?: UrlPolicy): string {
  const html: string[] = []
  const lists: OpenList[] = []
  let lines: string[] = []
  let blank = false

  const flush = (): void => {
    if (lines.length) {
      const text = inline(
        lines
          .map(
            (line, index) =>
              (index ? (lines[index - 1]?.endsWith('  ') ? '\0' : '\n') : '') + line.trim(),
          )
          .join(''),
        policy,
      )
      html.push(lists.length ? text : `<p>${text}</p>`)
      lines = []
    }
  }

  const closeLists = (depth = 0): void => {
    while (lists.length > depth) {
      flush()
      html.push(`</li></${(lists.pop() as OpenList).tag}>`)
    }
  }

  for (const line of markdown.replace(/\0/g, '\uFFFD').split(/\r\n?|\n/)) {
    const item = LIST_ITEM.exec(line)
    const heading = HEADING.exec(line)
    if (!line.trim()) {
      if (!lists.length) {
        flush()
      }
      blank = true
      continue
    }
    if (item) {
      const [marker, indent = '', bullet = ''] = item
      const tag = bullet > '/' ? 'ol' : 'ul'
      let depth = lists.length
      while (depth > 1 && indent.length < (lists[depth - 2] as OpenList).content) {
        depth--
      }
      closeLists(depth)
      flush()
      const list = lists.at(-1)
      if (list && indent.length < list.content) {
        html.push(list.tag === tag ? '</li><li>' : `</li></${list.tag}><${tag}><li>`)
        list.tag = tag
        list.content = marker.length
      } else {
        html.push(`<${tag}><li>`)
        lists.push({ tag, content: marker.length })
      }
      lines.push(line.slice(marker.length))
    } else if (heading) {
      closeLists()
      flush()
      const tag = `h${String(heading[1]?.length)}`
      html.push(`<${tag}>${inline(headingText(line.slice(heading[0].length)), policy)}</${tag}>`)
    } else {
      if (
        blank &&
        lists.length &&
        line.length - line.trimStart().length < (lists.at(-1) as OpenList).content
      ) {
        closeLists()
      }
      lines.push(line)
    }
    blank = false
  }
  closeLists()
  flush()
  return html.join('')
}
