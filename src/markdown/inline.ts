import type { UrlPolicy } from '../core/types.js'
import { safeUrl } from '../sanitize/url.js'

interface Run {
  readonly char: string
  readonly part: number
  readonly length: number
  readonly open: boolean
  readonly close: boolean
  count: number
  before: string
  after: string
}

const ESCAPABLE = /[!-/:-@[-`{-~]/
const PLAIN = /[^\\*_[\]\n\0]+/y
const MAX_PAREN_DEPTH = 8
const WHITESPACE = 0
const PUNCTUATION = 1
const OTHER = 2

const classOf = (char = ' '): number =>
  /\s/.test(char) ? WHITESPACE : /[\p{P}\p{S}]/u.test(char) ? PUNCTUATION : OTHER

const canPair = (opener: Run, closer: Run): boolean =>
  !(opener.close || closer.open) ||
  (opener.length + closer.length) % 3 > 0 ||
  opener.length % 3 === 0

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (char) => `&#${String(char.charCodeAt(0))};`)

const linkTail = (source: string, start: number): [string, number] | undefined => {
  let index = start + 1
  const skipSpace = (): void => {
    while (/[ \t\n]/.test(source[index] ?? '')) {
      index++
    }
  }
  skipSpace()
  const pointy = source[index] === '<'
  let href = ''
  let depth = 0
  for (index += +pointy; index < source.length; index++) {
    let char = source[index] as string
    if (char === '\\' && ESCAPABLE.test(source[index + 1] ?? '')) {
      char = source[++index] as string
    } else if (pointy ? /[<>\n]/.test(char) : char <= ' ' || (char === ')' && !depth--)) {
      break
    } else if (!pointy && char === '(' && ++depth > MAX_PAREN_DEPTH) {
      return undefined
    }
    href += char
  }
  if (pointy ? source[index++] !== '>' : depth > 0) {
    return undefined
  }
  skipSpace()
  const quote = source[index] ?? ''
  if (/["'(]/.test(quote)) {
    const close = quote === '(' ? ')' : quote
    for (index++; source[index] !== close; index++) {
      if (index >= source.length || (quote === '(' && source[index] === '(')) {
        return undefined
      }
      index += +(source[index] === '\\')
    }
    index++
    skipSpace()
  }
  return source[start] === '(' && source[index] === ')' ? [href, index + 1] : undefined
}

export function inline(source: string, policy?: UrlPolicy): string {
  const parts: (string | Run)[] = []
  const brackets: number[] = []
  const openers = new Map<string, Run[]>([
    ['*', []],
    ['_', []],
  ])
  let activeBrackets = 0

  const dropOpenersAfter = (part: number): void => {
    for (const stack of openers.values()) {
      while ((stack.at(-1)?.part ?? -1) > part) {
        stack.pop()
      }
    }
  }

  for (let index = 0; index < source.length;) {
    const char = source[index] as string
    const next = source[index + 1] ?? ''
    const stack = openers.get(char)
    if (stack) {
      let end = index
      while (source[end] === char) {
        end++
      }
      const before = classOf(source[index - 1])
      const after = classOf(source[end])
      const left = after > WHITESPACE && (after > PUNCTUATION || before < OTHER)
      const right = before > WHITESPACE && (before > PUNCTUATION || after < OTHER)
      const run: Run = {
        char,
        part: parts.push('') - 1,
        length: end - index,
        count: end - index,
        open: left && (char === '*' || !right || before === PUNCTUATION),
        close: right && (char === '*' || !left || after === PUNCTUATION),
        before: '',
        after: '',
      }
      for (
        let opener = stack.at(-1);
        run.close &&
        run.count &&
        opener &&
        opener.part > (brackets.at(-1) ?? -1) &&
        canPair(opener, run);
        opener = stack.at(-1)
      ) {
        const used = opener.count > 1 && run.count > 1 ? 2 : 1
        const tag = used > 1 ? 'strong' : 'em'
        dropOpenersAfter(opener.part)
        opener.count -= used
        run.count -= used
        opener.after = `<${tag}>${opener.after}`
        run.before += `</${tag}>`
        if (!opener.count) {
          stack.pop()
        }
      }
      if (run.open && run.count) {
        stack.push(run)
      }
      parts[run.part] = run
      index = end
    } else if (char === '[') {
      brackets.push(parts.push(char) - 1)
      index++
    } else if (char === ']') {
      const opener = brackets.pop() ?? -1
      const link = opener >= 0 && brackets.length >= activeBrackets && linkTail(source, index + 1)
      activeBrackets = Math.min(activeBrackets, brackets.length)
      if (link) {
        const href = safeUrl(link[0], policy)
        dropOpenersAfter(opener)
        parts[opener] = href === null ? '' : `<a href="${escapeHtml(href)}">`
        parts.push(href === null ? '' : '</a>')
        activeBrackets = brackets.length
        index = link[1]
      } else {
        parts.push(char)
        index++
      }
    } else if (char === '\\') {
      const escaped = next === '\n' || ESCAPABLE.test(next)
      parts.push(next === '\n' ? '<br>' : escaped ? escapeHtml(next) : char)
      index += escaped ? 2 : 1
    } else if (char === '\n' || char === '\0') {
      parts.push(char === '\n' ? ' ' : '<br>')
      index++
    } else {
      PLAIN.lastIndex = index
      const plain = (PLAIN.exec(source) as RegExpExecArray)[0]
      parts.push(escapeHtml(plain))
      index += plain.length
    }
  }
  return parts
    .map((part) =>
      typeof part === 'string' ? part : part.before + part.char.repeat(part.count) + part.after,
    )
    .join('')
}
