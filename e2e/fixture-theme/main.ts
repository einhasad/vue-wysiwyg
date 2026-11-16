import { createApp, defineComponent, h, ref } from 'vue'
import type { Editor, Module } from '../../src/index.js'
import { EditorToolbar } from '../../src/theme/index.js'
import '../../src/theme/theme.css'
import { WysiwygEditor } from '../../src/vue/index.js'

declare global {
  interface Window {
    editor: Editor
  }
}

const params = new URLSearchParams(location.search)
const loaders = import.meta.glob<Record<string, (options?: unknown) => Module>>('/src/modules/*.ts')
const names = (params.get('modules') ?? '').split(',').filter(Boolean)
const moduleOptions = JSON.parse(params.get('options') ?? '{}') as Record<string, unknown>

const modules = await Promise.all(
  names.map(async (name) => {
    const exportName = name.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase())
    const exports = await (
      loaders[`/src/modules/${name}.ts`] as () => Promise<
        Record<string, (options?: unknown) => Module>
      >
    )()
    return (exports[exportName] as (options?: unknown) => Module)(moduleOptions[exportName])
  }),
)

const App = defineComponent({
  setup() {
    const model = ref(params.get('content') ?? '')
    return () => [
      h(
        WysiwygEditor,
        {
          class: ['vw-editor', params.get('theme') ?? ''],
          modelValue: model.value,
          'onUpdate:modelValue': (value: string) => {
            model.value = value
          },
          readonly: params.has('readonly'),
          label: 'Editor',
          modules,
          ref: (instance: unknown) => {
            const editor = (instance as { editor?: Editor } | null)?.editor
            if (editor) {
              window.editor = editor
              document.body.dataset['ready'] = 'true'
            }
          },
        },
        { toolbar: ({ editor }: { editor: Editor }) => h(EditorToolbar, { editor }) },
      ),
      h('pre', { id: 'model' }, model.value),
    ]
  },
})

createApp(App).mount('#app')
