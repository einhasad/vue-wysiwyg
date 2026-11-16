import { shallowRef, watchEffect, type Ref, type ShallowRef } from 'vue'
import type { Editor } from '../core/types.js'

export function useEditorState<T>(
  editor: Readonly<Ref<Editor | null>>,
  selector: (editor: Editor) => T,
): ShallowRef<T | undefined> {
  const state = shallowRef<T>()
  watchEffect((onCleanup) => {
    const current = editor.value
    if (current) {
      const refresh = (): void => {
        state.value = selector(current)
      }
      refresh()
      const unsubscribers = [
        current.on('update', refresh),
        current.on('selection', refresh),
        current.on('readonly', refresh),
      ]
      onCleanup(() => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      })
    } else {
      state.value = undefined
    }
  })
  return state
}
