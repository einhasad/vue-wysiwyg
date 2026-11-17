import { computed, defineComponent, h, shallowRef, watchEffect } from 'vue'
import { version } from '../package.json'
import { FullEditorDemo } from './full-editor-demo.js'
import { RestrictedEditorDemo } from './restricted-editor-demo.js'

type ColorScheme = 'light' | 'dark'

const REPOSITORY_URL = 'https://github.com/einhasad/vue-wysiwyg'
const PACKAGE_URL = 'https://www.npmjs.com/package/@einhasad-vue/vue-wysiwyg'

const USAGE = `import { WysiwygEditor } from '@einhasad-vue/vue-wysiwyg/vue'
import { EditorToolbar } from '@einhasad-vue/vue-wysiwyg/theme'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'
import '@einhasad-vue/vue-wysiwyg/theme.css'

// <WysiwygEditor v-model="html" class="vw-editor" :modules="[bold(), italic()]">
//   <template #toolbar="{ editor }"><EditorToolbar :editor="editor" /></template>
// </WysiwygEditor>

// Rendering stored HTML elsewhere? Sanitize where it reaches the DOM,
// with the schema of the modules the editor uses:
import { createSchema, sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'
const schema = createSchema([bold(), italic()])
const safeHtml = sanitize(storedHtml, { schema })`

const preferredScheme = (): ColorScheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

export const DemoApp = defineComponent({
  name: 'DemoApp',
  setup() {
    const scheme = shallowRef<ColorScheme>(preferredScheme())
    const themeClass = computed(() => `vw-${scheme.value}`)

    watchEffect(() => {
      document.documentElement.dataset['theme'] = scheme.value
    })

    return () => [
      h('header', { class: 'demo-header' }, [
        h('div', [
          h('h1', ['vue-wysiwyg ', h('small', `v${version}`)]),
          h(
            'p',
            'Tiny, modular, XSS-safe WYSIWYG editor for Vue 3: headless core under 5 KB gzipped, opt-in modules, Markdown and HTML input and output.',
          ),
        ]),
        h('nav', { class: 'demo-nav', 'aria-label': 'Project' }, [
          h('a', { href: REPOSITORY_URL }, 'GitHub'),
          h('a', { href: PACKAGE_URL }, 'npm'),
          h(
            'button',
            {
              type: 'button',
              class: 'demo-button',
              'aria-pressed': scheme.value === 'dark',
              'data-testid': 'dark-mode-toggle',
              onClick: () => {
                scheme.value = scheme.value === 'dark' ? 'light' : 'dark'
              },
            },
            'Dark mode',
          ),
        ]),
      ]),
      h('main', { class: 'demo-main' }, [
        h(FullEditorDemo, { themeClass: themeClass.value }),
        h(RestrictedEditorDemo, { themeClass: themeClass.value }),
        h('section', { class: 'demo-section', 'aria-labelledby': 'usage-title' }, [
          h('h2', { id: 'usage-title' }, 'Usage'),
          h('pre', { class: 'demo-code' }, h('code', 'npm install @einhasad-vue/vue-wysiwyg')),
          h('pre', { class: 'demo-code' }, h('code', USAGE)),
        ]),
      ]),
      h('footer', { class: 'demo-footer' }, [
        'MIT License. ',
        h('a', { href: REPOSITORY_URL }, 'Source on GitHub'),
        '. ',
        h('a', { href: `${import.meta.env.BASE_URL}npm.html` }, 'Published package smoke test'),
      ]),
    ]
  },
})
