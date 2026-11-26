import { keyOf } from '../core/keys.js'
import type { Editor, Module } from '../core/types.js'
import { safeUrl } from '../sanitize/url.js'
import { activeMark, isMarkActive, setMarkAtCaret } from '../shared/marks.js'

declare module '../core/types.js' {
  interface Commands {
    link: string | null
  }
}

export interface LinkOptions {
  readonly target?: string
  readonly onShortcut?: (editor: Editor) => void
}

export const LINK_REL = 'noopener noreferrer nofollow'

export function linkHref(editor: Editor): string | undefined {
  return activeMark(editor, 'a')?.getAttribute('href') ?? undefined
}

const wrapInLink = (editor: Editor, href: string): true => {
  const range = editor.selection.range() as Range
  const { startContainer: first, endContainer: last } = range
  const document = editor.root.ownerDocument
  const anchor = document.createElement('a')
  anchor.setAttribute('href', href)
  range.setStartBefore(first)
  range.setEndAfter(last)
  anchor.append(range.extractContents())
  range.insertNode(anchor)
  document.getSelection()?.setBaseAndExtent(first, 0, last, (last as Text).length)
  return true
}

const setLink = (editor: Editor, url: string | null): boolean => {
  const href = url && safeUrl(url, editor.schema)
  const range = editor.selection.range()
  return href &&
    range?.collapsed === false &&
    range.commonAncestorContainer !== editor.root &&
    !range.cloneContents().querySelector('li')
    ? setMarkAtCaret(editor, 'a', null) && wrapInLink(editor, href)
    : url === null
      ? setMarkAtCaret(editor, 'a', null)
      : !!href && setMarkAtCaret(editor, 'a', { href })
}

const isLinkActive = (editor: Editor): boolean => {
  const range = editor.selection.range()
  return (
    isMarkActive(editor, 'a') &&
    ![...editor.root.querySelectorAll('a:not([href])')].some((anchor) =>
      range?.intersectsNode(anchor),
    )
  )
}

export const link = ({ target, onShortcut }: LinkOptions = {}): Module => ({
  name: 'link',
  schema: {
    tags: {
      a: {
        kind: 'inline',
        attrs: ['href'],
        urlAttrs: ['href'],
        fixedAttrs: target ? { rel: LINK_REL, target } : { rel: LINK_REL },
      },
    },
  },
  commands: {
    link: {
      run: setLink,
      isActive: isLinkActive,
    },
  },
  onKeyDown:
    onShortcut &&
    ((event, editor) => {
      const isShortcut = keyOf(event) === 'Mod-k'
      if (isShortcut) {
        onShortcut(editor)
      }
      return isShortcut
    }),
})
