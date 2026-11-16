import { defineComponent, h, onMounted, shallowRef, useId, type PropType, type VNode } from 'vue'
import type { Editor } from '../core/types.js'
import { safeUrl } from '../sanitize/url.js'
import type { EditorMessages } from './messages.js'

const emits: { close: () => boolean } = { close: () => true }

const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#:]|$)/

const withProtocol = (value: string): string =>
  BARE_DOMAIN.test(value.trim()) ? `https://${value.trim()}` : value

export const LinkPopover = defineComponent({
  props: {
    /** Editor whose selection gets the link */
    editor: { type: Object as PropType<Editor>, required: true },
    /** Labels of the popover */
    messages: { type: Object as PropType<EditorMessages>, required: true },
    /** Editor selection restored before the link is applied */
  },
  emits,
  setup(props, { emit }) {
    const { editor } = props
    const input = shallowRef<HTMLInputElement | null>(null)
    const invalid = shallowRef(false)
    const errorId = useId()
    const path = editor.selection.save()
    const start = editor.selection.range()?.startContainer
    const anchor = (start?.nodeType === 1 ? (start as Element) : start?.parentElement)?.closest('a')
    const href = shallowRef(anchor?.getAttribute('href') ?? '')

    const close = (): void => {
      editor.selection.restore(path)
      editor.focus()
      emit('close')
    }

    const apply = (): void => {
      const url = safeUrl(withProtocol(href.value), editor.schema)
      invalid.value = !url
      if (url) {
        close()
        const range = editor.selection.range()
        editor.transact(() => {
          if (range?.collapsed && !anchor) {
            range.insertNode(new Text(url))
          }
          editor.exec('link', url)
        })
      }
    }

    const button = (label: string, onClick: () => void): VNode =>
      h('button', { type: 'button', class: 'vw-button', onClick }, label)

    onMounted(() => {
      input.value?.focus()
    })

    return () =>
      h(
        'div',
        {
          class: 'vw-link-popover',
          role: 'group',
          'aria-label': props.messages.link,
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              close()
            }
          },
        },
        [
          h('label', [
            props.messages.linkUrl,
            h('input', {
              ref: input,
              class: 'vw-input',
              type: 'text',
              inputmode: 'url',
              value: href.value,
              'aria-invalid': invalid.value,
              'aria-describedby': invalid.value ? errorId : undefined,
              onInput: (event: Event) => {
                href.value = (event.target as HTMLInputElement).value
              },
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  apply()
                }
              },
            }),
          ]),
          button(props.messages.linkApply, apply),
          anchor &&
            button(props.messages.linkRemove, () => {
              close()
              editor.exec('link', null)
            }),
          button(props.messages.linkCancel, close),
          invalid.value &&
            h(
              'p',
              { id: errorId, class: 'vw-link-error', role: 'alert' },
              props.messages.linkInvalid,
            ),
        ],
      )
  },
})
