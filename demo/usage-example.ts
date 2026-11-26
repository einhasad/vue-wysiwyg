import { defineComponent, h, ref } from 'vue'
import type { Editor } from '@einhasad-vue/vue-wysiwyg'
import { WysiwygEditor } from '@einhasad-vue/vue-wysiwyg/vue'
import { EditorToolbar } from '@einhasad-vue/vue-wysiwyg/theme'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'
import { createSchema, sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'
import '@einhasad-vue/vue-wysiwyg/theme.css'

// The same editor in an SFC template:
// <WysiwygEditor v-model="html" class="vw-editor" :modules="modules">
//   <template #toolbar="{ editor }"><EditorToolbar :editor="editor" /></template>
// </WysiwygEditor>
export const PostEditor = defineComponent(() => {
  const html = ref('<p>Hello <strong>world</strong></p>')
  const modules = [bold(), italic()]
  return () =>
    h(
      WysiwygEditor,
      {
        modelValue: html.value,
        'onUpdate:modelValue': (value: string) => {
          html.value = value
        },
        class: 'vw-editor',
        modules,
      },
      { toolbar: ({ editor }: { editor: Editor }) => h(EditorToolbar, { editor }) },
    )
})

// Rendering stored HTML elsewhere? Sanitize where it reaches the DOM,
// with the schema of the modules the editor uses:
const schema = createSchema([bold(), italic()])
export const toSafeHtml = (storedHtml: string): string => sanitize(storedHtml, { schema })
