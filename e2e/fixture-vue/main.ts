import { createApp, defineComponent, h, ref } from 'vue'
import { bold } from '../../src/modules/bold.js'
import { WysiwygEditor } from '../../src/vue/index.js'

declare global {
  interface Window {
    setModel: (value: string) => void
    model: () => string
    focusEvents: string[]
  }
}

const params = new URLSearchParams(location.search)
const modules = [bold()]
const echoDelay = Number(params.get('echoDelay') ?? 0)

const App = defineComponent({
  setup() {
    const model = ref(params.get('content') ?? '')
    const readonly = ref(params.has('readonly'))
    window.setModel = (value) => {
      model.value = value
    }
    window.model = () => model.value
    window.focusEvents = []
    return () => [
      h(WysiwygEditor, {
        modelValue: model.value,
        'onUpdate:modelValue': (value: string) => {
          if (echoDelay) {
            setTimeout(() => {
              model.value = value
            }, echoDelay)
          } else {
            model.value = value
          }
        },
        readonly: readonly.value,
        label: 'Editor',
        name: 'body',
        modules,
        onFocus: () => window.focusEvents.push('focus'),
        onBlur: () => window.focusEvents.push('blur'),
      }),
      h(
        'button',
        {
          type: 'button',
          id: 'toggle-readonly',
          onClick: () => {
            readonly.value = !readonly.value
          },
        },
        'Toggle readonly',
      ),
      h('pre', { id: 'model' }, model.value),
    ]
  },
})

createApp(App).mount('#app')
document.body.dataset['ready'] = 'true'
