import { keyOf } from '../core/keys.js'
import type { Editor, Module } from '../core/types.js'
import { safeUrl } from '../sanitize/url.js'

const BLANK_LINE = /\r?\n\s*\n/
const WORD_LIST_LEVEL = /mso-list:\s*(l\d+)\s+level(\d+)/
const SOURCE_WHITESPACE = /[\t\r\n ]+/g
const WORD_LIST_MARKER = '[style*="mso-list:Ignore"]'

const escapeHTML = (text: string): string =>
  text.replace(/[&<>"]/g, (char) => `&#${String(char.charCodeAt(0))};`)

const uriListToHTML = (editor: Editor, uriList: string): string => {
  const url = uriList.split(/\r?\n/).find((line) => !line.startsWith('#'))
  const href = url && editor.schema.tags.has('a') && safeUrl(url, editor.schema)
  return href ? `<a href="${escapeHTML(href)}">${escapeHTML(href)}</a>` : ''
}

const textToParagraphs = (text: string): string =>
  BLANK_LINE.test(text)
    ? text
        .trim()
        .split(BLANK_LINE)
        .map((paragraph) => `<p>${escapeHTML(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
        .join('')
    : ''

const convertWordLists = (body: HTMLElement): void => {
  const document = body.ownerDocument
  let lists: Element[] = []
  let listId: string | undefined
  for (const paragraph of body.querySelectorAll('p')) {
    const [, id, levelText] = WORD_LIST_LEVEL.exec(paragraph.getAttribute('style') ?? '') ?? []
    const level = Number(levelText)
    if (!level) {
      continue
    }
    const marker = paragraph.querySelector(WORD_LIST_MARKER)?.textContent.trim() ?? ''
    const tag = /[.)]$/.test(marker) ? 'ol' : 'ul'
    const top = lists[0]
    if (
      paragraph.previousElementSibling !== top ||
      id !== listId ||
      (level < 2 && tag !== top.localName)
    ) {
      lists = []
    }
    listId = id
    lists.length = Math.min(lists.length, level)
    while (lists.length < level) {
      const list = document.createElement(tag)
      const parent = lists.at(-1)
      if (parent) {
        ;(parent.lastElementChild ?? parent.appendChild(document.createElement('li'))).append(list)
      } else {
        paragraph.before(list)
      }
      lists.push(list)
    }
    const item = document.createElement('li')
    item.append(...paragraph.childNodes)
    lists.at(-1)?.append(item)
    paragraph.remove()
  }
}

const convertTables = (body: HTMLElement): void => {
  for (const row of body.querySelectorAll('tr')) {
    const line = body.ownerDocument.createElement('p')
    for (const cell of row.cells) {
      line.append(cell.cellIndex ? '\t' : '', ...cell.childNodes)
    }
    ;(row.closest('table') as Element).before(line)
  }
  for (const table of body.querySelectorAll('table')) {
    table.remove()
  }
}

const convertInlineStyles = (body: HTMLElement): void => {
  for (const element of body.querySelectorAll<HTMLElement>('b,strong,span')) {
    const { fontWeight, fontStyle, textDecoration } = element.style
    const bold = /^(bold|[6-9])/.test(fontWeight)
    if (element.localName !== 'span') {
      if ((fontWeight && !bold) || element.id.startsWith('docs-internal-guid')) {
        element.replaceWith(...element.childNodes)
      }
      continue
    }
    for (const tag of [
      bold && 'strong',
      fontStyle === 'italic' && 'em',
      textDecoration.includes('underline') && !element.closest('a') && 'u',
    ]) {
      if (tag) {
        const wrapper = body.ownerDocument.createElement(tag)
        wrapper.append(...element.childNodes)
        element.append(wrapper)
      }
    }
  }
}

export const cleanPastedHTML = (html: string, editor: Editor): string => {
  const body = editor.root.ownerDocument.implementation.createHTMLDocument('').body
  body.innerHTML = html.replace(SOURCE_WHITESPACE, (run) => (run.includes('\n') ? ' ' : run))
  if (editor.schema.tags.has('li')) {
    convertWordLists(body)
  }
  for (const node of body.querySelectorAll(
    `${WORD_LIST_MARKER},.Apple-interchange-newline,o\\:p`,
  )) {
    node.remove()
  }
  convertTables(body)
  convertInlineStyles(body)
  return body.innerHTML
}

const plainEditors = new WeakSet<Editor>()

export const paste = (): Module => {
  const transferTypes = ['paste', 'drop'] as const
  return {
    name: 'paste',
    transformPastedHTML: cleanPastedHTML,
    onKeyDown(event, editor) {
      if (keyOf(event) === 'Mod-Shift-v') {
        plainEditors.add(editor)
        setTimeout(() => {
          plainEditors.delete(editor)
        })
      }
      return false
    },
    setup(editor) {
      const onTransfer = (event: Event): void => {
        const data = (event as ClipboardEvent).clipboardData ?? (event as DragEvent).dataTransfer
        if (!data) {
          return
        }
        const text = data.getData('text/plain')
        const original = data.getData('text/html')
        const html = plainEditors.has(editor)
          ? textToParagraphs(text)
          : original ||
            uriListToHTML(editor, data.getData('text/uri-list')) ||
            textToParagraphs(text)
        if (html !== original) {
          data.getData = (type) => (type === 'text/html' ? html : text)
        }
      }
      for (const type of transferTypes) {
        editor.root.addEventListener(type, onTransfer, true)
      }
      return () => {
        for (const type of transferTypes) {
          editor.root.removeEventListener(type, onTransfer, true)
        }
      }
    },
  }
}
