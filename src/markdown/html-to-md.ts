export interface HtmlToMdOptions {
  readonly document?: Document
}

const HEADING = /^h[1-6]$/
const LIST = /^[ou]l$/
const BLOCK = /^(p|div|li|pre|blockquote|section|article)$/
const MAX_DEPTH = 128

const escapeText = (text: string): string =>
  text.replace(/\s+/g, ' ').replace(/[\\*_`[\]<>#]/g, '\\$&')

const lines = (text: string, separator = '\\\n'): string =>
  text
    .trim()
    .split('\n')
    .map((line) => line.trim().replace(/^(\d*)([-+.)])/, '$1\\$2'))
    .join(separator)

const emphasis = (text: string, delimiter: string): string => {
  const start = text.length - text.trimStart().length
  const end = text.trimEnd().length
  return start < end
    ? text.slice(0, start) + delimiter + text.slice(start, end) + delimiter + text.slice(end)
    : text
}

const inline = (node: Node, depthLeft: number): string => {
  const element = node as Element
  const name = element.localName
  const text = depthLeft
    ? Array.from(node.childNodes, (child) => inline(child, depthLeft - 1)).join('')
    : escapeText(node.textContent as string)
  const href = name === 'a' && element.getAttribute('href')
  return node.nodeType === 3
    ? escapeText((node as Text).data)
    : name === 'br'
      ? '\n'
      : /^(strong|b)$/.test(name)
        ? emphasis(text, '**')
        : /^(em|i)$/.test(name)
          ? emphasis(text, '*')
          : typeof href === 'string'
            ? `[${text}](${href.replace(/[\\()<>]/g, '\\$&').replace(/\s/g, encodeURIComponent)})`
            : /^(ul|ol|script|style)$/.test(name)
              ? ''
              : text
}

const list = (element: Element, depthLeft: number): string =>
  Array.from(element.children)
    .filter((child) => child.localName === 'li')
    .map((item, index) => {
      const marker = element.localName === 'ol' ? `${String(index + 1)}. ` : '- '
      return (
        marker +
        [
          lines(inline(item, depthLeft)),
          ...Array.from(item.children)
            .filter((child) => depthLeft && LIST.test(child.localName))
            .map((child) => list(child, depthLeft - 1)),
        ]
          .join('\n')
          .replaceAll('\n', `\n${' '.repeat(marker.length)}`)
      )
    })
    .join('\n')

const blocks = (parent: Node, depthLeft: number): string => {
  const result: string[] = []
  let run = ''
  for (const child of parent.childNodes) {
    const name = (child as Element).localName
    const block = HEADING.test(name)
      ? `${'#'.repeat(+(name[1] as string))} ${lines(inline(child, depthLeft), ' ')}`
      : LIST.test(name)
        ? list(child as Element, depthLeft)
        : depthLeft && BLOCK.test(name)
          ? blocks(child, depthLeft - 1)
          : undefined
    if (block === undefined) {
      run += inline(child, depthLeft)
    } else {
      result.push(lines(run), block)
      run = ''
    }
  }
  result.push(lines(run))
  return result.filter(Boolean).join('\n\n')
}

export function htmlToMd(html: string, options: HtmlToMdOptions = {}): string {
  const body = (options.document ?? document).implementation.createHTMLDocument('').body
  body.innerHTML = html
  return blocks(body, MAX_DEPTH)
}
