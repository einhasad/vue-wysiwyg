import { defineComponent, h, shallowRef, watchPostEffect, type PropType } from 'vue'
import type { Editor } from '../core/types.js'

export const EditorContent = defineComponent({
  name: 'EditorContent',
  props: {
    /** Editor whose root is mounted into this host */
    editor: { type: Object as PropType<Editor | null>, default: null },
  },
  setup(props) {
    const host = shallowRef<HTMLElement | null>(null)
    watchPostEffect(() => {
      if (props.editor && host.value && props.editor.root.parentNode !== host.value) {
        host.value.append(props.editor.root)
      }
    })
    return () => h('div', { ref: host })
  },
})
