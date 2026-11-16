import type { Editor, Module, SelectionPath } from '../core/types.js'
import { sanitizeToFragment } from '../sanitize/sanitizer.js'

export interface CharacterCountOptions {
  readonly limit?: number
}

export interface CharacterCountModule extends Module {
  count(editor?: Editor): number
  words(editor?: Editor): number
}

const LINE_END = /[\r\n]/

const withoutSplitSurrogate = (data: string, end: number): number =>
  data.charCodeAt(end - 1) >> 10 === 54 ? end - 1 : end

export const characterCount = ({
  limit = Infinity,
}: CharacterCountOptions = {}): CharacterCountModule => {
  let bound: Editor | undefined

  const room = (editor: Editor): number =>
    limit - editor.textLength() + (editor.selection.range()?.toString().length ?? 0)

  return {
    name: 'characterCount',
    priority: -1,
    count: (editor = bound) => editor?.textLength() ?? 0,
    words(editor = bound) {
      let text = ''
      if (editor) {
        const walker = editor.root.ownerDocument.createTreeWalker(editor.root, 5)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          text +=
            node.nodeType === 3
              ? (node as Text).data
              : editor.schema.tags.get((node as Element).localName)?.kind === 'inline'
                ? ''
                : ' '
        }
      }
      return text.match(/\S+/g)?.length ?? 0
    },
    onBeforeInput: (event, editor) =>
      event.inputType === 'insertText' && (event.data?.length ?? 0) > room(editor),
    transformPastedText(text, editor) {
      let rest = room(editor)
      let end = 0
      for (; end < text.length && rest > 0; end++) {
        if (!LINE_END.test(text.charAt(end))) {
          rest--
        }
      }
      return text.slice(0, withoutSplitSurrogate(text, end))
    },
    transformPastedHTML(html, editor) {
      let rest = room(editor)
      if (rest <= 0) {
        return ''
      }
      const document = editor.root.ownerDocument.implementation.createHTMLDocument('')
      const fragment = sanitizeToFragment(html, { schema: editor.schema, document })
      const walker = document.createTreeWalker(fragment, 4)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text
        if (text.length >= rest) {
          const tail = document.createRange()
          tail.setStart(text, withoutSplitSurrogate(text.data, rest))
          tail.setEnd(fragment, fragment.childNodes.length)
          tail.deleteContents()
          document.body.append(fragment)
          return document.body.innerHTML
        }
        rest -= text.length
      }
      return html
    },
    setup(editor) {
      const { root } = editor
      let snapshot = ''
      let path: SelectionPath | null = null
      const remember = (): void => {
        snapshot = root.innerHTML
        path = editor.selection.save()
      }
      const revertOverflow = (): void => {
        if (editor.textLength() > limit) {
          editor.setHTML(snapshot)
          editor.selection.restore(path)
        }
      }
      bound = editor
      root.addEventListener('compositionstart', remember)
      root.addEventListener('compositionend', revertOverflow)
      return () => {
        if (bound === editor) {
          bound = undefined
        }
        root.removeEventListener('compositionstart', remember)
        root.removeEventListener('compositionend', revertOverflow)
      }
    },
  }
}
