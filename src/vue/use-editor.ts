import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'
import { createEditor } from '../core/editor.js'
import type { Editor, EditorOptions } from '../core/types.js'

export function useEditor(options: EditorOptions = {}): ShallowRef<Editor | null> {
  const editor = shallowRef<Editor | null>(null)
  onMounted(() => {
    editor.value = createEditor(options)
  })
  onBeforeUnmount(() => {
    editor.value?.destroy()
    editor.value = null
  })
  return editor
}
