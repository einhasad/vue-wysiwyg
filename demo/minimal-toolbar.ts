import { defineComponent, h, shallowRef, type PropType } from 'vue'
import type { Editor } from '@einhasad-vue/vue-wysiwyg'
import '@einhasad-vue/vue-wysiwyg/modules/heading'
import '@einhasad-vue/vue-wysiwyg/modules/lists'
import { useEditorState } from '@einhasad-vue/vue-wysiwyg/vue'

interface ToolbarAction {
  readonly label: string
  readonly run: (editor: Editor) => boolean
  readonly isActive?: (editor: Editor) => boolean
}

const ACTIONS: readonly ToolbarAction[] = [
  {
    label: 'Bold',
    run: (editor) => editor.exec('bold'),
    isActive: (editor) => editor.isActive('bold'),
  },
  {
    label: 'Italic',
    run: (editor) => editor.exec('italic'),
    isActive: (editor) => editor.isActive('italic'),
  },
  {
    label: 'H2',
    run: (editor) => editor.exec('heading', 2),
    isActive: (editor) => editor.isActive('heading', 2),
  },
  {
    label: 'List',
    run: (editor) => editor.exec('bulletList'),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  { label: 'Undo', run: (editor) => editor.exec('undo') },
  { label: 'Redo', run: (editor) => editor.exec('redo') },
]

export const MinimalToolbar = defineComponent({
  name: 'MinimalToolbar',
  props: {
    /** Editor the buttons act on */
    editor: { type: Object as PropType<Editor>, required: true },
  },
  setup(props) {
    const state = useEditorState(shallowRef(props.editor), (editor) =>
      ACTIONS.map((action) => action.isActive?.(editor)),
    )
    return () =>
      h(
        'div',
        { class: 'vw-toolbar' },
        h(
          'div',
          { role: 'toolbar', class: 'vw-toolbar-buttons', 'aria-label': 'Restricted formatting' },
          ACTIONS.map((action, index) =>
            h(
              'button',
              {
                type: 'button',
                class: 'vw-button',
                'aria-pressed': state.value?.[index],
                onMousedown: (event: MouseEvent) => {
                  event.preventDefault()
                },
                onClick: () => action.run(props.editor),
              },
              action.label,
            ),
          ),
        ),
      )
  },
})
