import {
  defineComponent,
  h,
  onMounted,
  shallowRef,
  watch,
  type PropType,
  type SlotsType,
} from 'vue'
import type { Editor, ExternalSanitizer, Format, Module } from '../core/types.js'
import { EditorContent } from './editor-content.js'
import { useEditor } from './use-editor.js'

const emits: {
  'update:modelValue': (value: string) => boolean
  focus: (event?: Event) => boolean
  blur: (event?: Event) => boolean
} = {
  'update:modelValue': () => true,
  focus: () => true,
  blur: () => true,
}

export const WysiwygEditor = defineComponent({
  name: 'WysiwygEditor',
  props: {
    /** Value in the editor format, '' when empty */
    modelValue: { type: String, default: '' },
    /** Feature modules, read once on mount */
    modules: { type: Array as PropType<readonly Module[]>, default: undefined },
    /** Value format, HTML when unset, read once on mount */
    format: { type: Object as PropType<Format>, default: undefined },
    /** External sanitizer applied before the built-in one, read once on mount */
    sanitizer: { type: Function as PropType<ExternalSanitizer>, default: undefined },
    /** Blocks every edit while true */
    readonly: Boolean,
    /** Accessible name of the textbox */
    label: { type: String, default: '' },
    /** Renders a hidden input with this name for native forms */
    name: { type: String, default: '' },
  },
  emits,
  slots: Object as SlotsType<{ toolbar?: { editor: Editor } }>,
  expose: ['editor'],
  setup(props, { emit }) {
    const value = shallowRef('')
    const editor = useEditor({
      get content() {
        return props.modelValue
      },
      get modules() {
        return props.modules
      },
      get format() {
        return props.format
      },
      get sanitizer() {
        return props.sanitizer
      },
      get readonly() {
        return props.readonly
      },
      get label() {
        return props.label
      },
    })

    onMounted(() => {
      const current = editor.value as Editor
      value.value = current.getValue()
      current.on('update', () => {
        value.value = current.getValue()
        if (value.value !== props.modelValue) {
          emit('update:modelValue', value.value)
        }
      })
      current.on('focus', (_editor, event) => {
        emit('focus', event)
      })
      current.on('blur', (_editor, event) => {
        emit('blur', event)
      })
    })

    watch(
      () => props.modelValue,
      (modelValue) => {
        if (editor.value && modelValue !== editor.value.getValue()) {
          editor.value.setValue(modelValue)
        }
      },
    )
    watch(
      () => props.readonly,
      (readonly) => {
        editor.value?.setReadonly(readonly)
      },
    )
    watch(
      () => props.label,
      (label) => {
        editor.value?.root.setAttribute('aria-label', label)
      },
    )

    return { editor, value }
  },
  render() {
    return h('div', { class: 'wysiwyg' }, [
      this.editor && this.$slots.toolbar?.({ editor: this.editor }),
      h(EditorContent, { editor: this.editor }),
      this.name && h('input', { type: 'hidden', name: this.name, value: this.value }),
    ])
  },
})
