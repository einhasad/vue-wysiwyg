import {
  computed,
  defineComponent,
  h,
  shallowRef,
  toRef,
  useId,
  watchEffect,
  type PropType,
  type SlotsType,
  type VNodeChild,
} from 'vue'
import { keyOf } from '../core/keys.js'
import type { CommandName, Editor, SelectionPath } from '../core/types.js'
import type { HeadingLevel } from '../modules/heading.js'
import { useEditorState } from '../vue/use-editor-state.js'
import { LinkPopover } from './link-popover.js'
import { defaultMessages, type EditorMessages } from './messages.js'

export interface ToolbarItem {
  readonly command: CommandName
  readonly glyph: string
  readonly level?: HeadingLevel
}

const UNPRESSABLE = ['undo', 'redo']

const ITEMS: readonly ToolbarItem[] = [
  { command: 'bold', glyph: 'B' },
  { command: 'italic', glyph: 'I' },
  { command: 'underline', glyph: 'U' },
  ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
    command: 'heading' as const,
    glyph: `H${String(level)}`,
    level,
  })),
  { command: 'bulletList', glyph: '•' },
  { command: 'orderedList', glyph: '1.' },
  { command: 'link', glyph: '↗' },
  { command: 'undo', glyph: '↶' },
  { command: 'redo', glyph: '↷' },
]

export const EditorToolbar = defineComponent({
  name: 'EditorToolbar',
  props: {
    /** Editor controlled by the toolbar, buttons appear only for its commands */
    editor: { type: Object as PropType<Editor | null>, default: null },
    /** Overrides for the default labels */
    messages: { type: Object as PropType<Partial<EditorMessages>>, default: undefined },
  },
  slots: Object as SlotsType<{ icon?: ToolbarItem }>,
  setup(props, { slots }) {
    const labels = computed(() => ({ ...defaultMessages, ...props.messages }))
    const bar = shallowRef<HTMLElement | null>(null)
    const active = shallowRef(0)
    const linkOpen = shallowRef(false)
    const fallbackId = useId()
    let lastPath: SelectionPath | null = null

    const items = computed(() =>
      ITEMS.filter(
        ({ command, level }) =>
          props.editor?.commands.includes(command) &&
          (!level || props.editor.schema.tags.has(`h${String(level)}`)),
      ),
    )

    const state = useEditorState(toRef(props, 'editor'), (editor) =>
      items.value.map(({ command, level }) => [
        UNPRESSABLE.includes(command) ? undefined : editor.isActive(command, level),
        editor.can(command),
      ]),
    )

    const focusButton = (index: number): void => {
      const count = items.value.length
      active.value = (index + count) % count
      ;(bar.value?.children[active.value] as HTMLElement).focus()
    }

    const run = (editor: Editor, index: number): void => {
      const { command, level } = items.value[index] as ToolbarItem
      if (!editor.selection.range()) {
        editor.selection.restore(lastPath)
      }
      if (editor.can(command)) {
        if (command === 'link') {
          linkOpen.value = true
        } else {
          ;(editor.exec as (name: CommandName, level?: HeadingLevel) => boolean)(command, level)
        }
      }
    }

    const onKeydown = (event: KeyboardEvent): void => {
      const editor = props.editor as Editor
      const key = keyOf(event)
      const target = (
        {
          arrowright: active.value + 1,
          arrowleft: active.value - 1,
          home: 0,
          end: -1,
        } as Partial<Record<string, number>>
      )[key]
      if (target !== undefined || key === 'escape') {
        event.preventDefault()
        if (target === undefined) {
          editor.selection.restore(lastPath)
          editor.focus()
        } else {
          focusButton(target)
        }
      }
    }

    watchEffect((onCleanup) => {
      const editor = props.editor
      active.value = 0
      if (editor) {
        editor.root.id ||= fallbackId
        const remember = (): void => {
          lastPath = editor.selection.save() ?? lastPath
        }
        const offs = [
          editor.on('selection', remember),
          editor.on('keydown', (_editor, event) => {
            remember()
            const key = keyOf(event as KeyboardEvent)
            const linkIndex = items.value.findIndex(({ command }) => command === 'link')
            if (key === 'Alt-f10' && items.value.length) {
              event?.preventDefault()
              focusButton(active.value)
            } else if (key === 'Mod-k' && linkIndex >= 0) {
              event?.preventDefault()
              run(editor, linkIndex)
            }
          }),
        ]
        onCleanup(() => {
          for (const off of offs) {
            off()
          }
        })
      }
    })

    return (): VNodeChild => {
      const editor = props.editor
      return (
        editor &&
        h('div', { class: 'vw-toolbar' }, [
          h(
            'div',
            {
              ref: bar,
              role: 'toolbar',
              class: 'vw-toolbar-buttons',
              'aria-label': labels.value.toolbar,
              'aria-controls': editor.root.id,
              onKeydown,
            },
            items.value.map((item, index) => {
              const label = labels.value[item.command as keyof EditorMessages].replace(
                '{level}',
                String(item.level),
              )
              return h(
                'button',
                {
                  type: 'button',
                  class: 'vw-button',
                  tabindex: index === active.value ? 0 : -1,
                  title: label,
                  'aria-label': label,
                  'aria-pressed': state.value?.[index]?.[0],
                  'aria-disabled': !state.value?.[index]?.[1],
                  'data-glyph': item.glyph,
                  onMousedown: (event: MouseEvent) => {
                    event.preventDefault()
                  },
                  onFocus: () => {
                    active.value = index
                  },
                  onClick: () => {
                    run(editor, index)
                  },
                },
                slots.icon?.(item),
              )
            }),
          ),
          linkOpen.value &&
            h(LinkPopover, {
              editor,
              messages: labels.value,
              onClose: () => {
                linkOpen.value = false
              },
            }),
        ])
      )
    }
  },
})
