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

const setLink = (editor: Editor, url: string | null): boolean => {
  const href = url && safeUrl(url, editor.schema)
  return url === null
    ? setMarkAtCaret(editor, 'a', null)
    : !!href && setMarkAtCaret(editor, 'a', { href })
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
      isActive: (editor: Editor) => isMarkActive(editor, 'a'),
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
