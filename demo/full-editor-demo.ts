import { computed, defineComponent, h, shallowRef, type VNode } from 'vue'
import type { Editor } from '@einhasad-vue/vue-wysiwyg'
import { htmlToMd } from '@einhasad-vue/vue-wysiwyg/markdown'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { characterCount } from '@einhasad-vue/vue-wysiwyg/modules/character-count'
import { heading } from '@einhasad-vue/vue-wysiwyg/modules/heading'
import { history } from '@einhasad-vue/vue-wysiwyg/modules/history'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'
import { link } from '@einhasad-vue/vue-wysiwyg/modules/link'
import { lists } from '@einhasad-vue/vue-wysiwyg/modules/lists'
import { markdownShortcuts } from '@einhasad-vue/vue-wysiwyg/modules/markdown-shortcuts'
import { paste } from '@einhasad-vue/vue-wysiwyg/modules/paste'
import { placeholder } from '@einhasad-vue/vue-wysiwyg/modules/placeholder'
import { underline } from '@einhasad-vue/vue-wysiwyg/modules/underline'
import { EditorToolbar } from '@einhasad-vue/vue-wysiwyg/theme'
import { WysiwygEditor } from '@einhasad-vue/vue-wysiwyg/vue'
import { OutputPane } from './output-pane.js'
import { pasteHTML, XSS_SAMPLE } from './paste-html.js'

const CHARACTER_LIMIT = 2000

const INITIAL_HTML = [
  '<h2>Try it</h2>',
  '<p>This is <strong>vue-wysiwyg</strong>: a <em>tiny</em>, modular and XSS-safe editor for Vue 3.</p>',
  '<ul><li>Select text and press Ctrl+B or Cmd+B.</li>',
  '<li>Start a new line with “## ” for a heading or “- ” for a list.</li>',
  '<li>Press Alt+F10 to move focus to the toolbar.</li></ul>',
  '<p>Read the <a href="https://github.com/einhasad/vue-wysiwyg">documentation</a>.</p>',
].join('')

export const FullEditorDemo = defineComponent({
  name: 'FullEditorDemo',
  props: {
    /** Theme class added to the editor */
    themeClass: { type: String, required: true },
  },
  setup(props) {
    const counter = characterCount({ limit: CHARACTER_LIMIT })
    const modules = [
      bold(),
      italic(),
      underline(),
      heading(),
      lists(),
      link(),
      history(),
      paste(),
      markdownShortcuts(),
      placeholder({ text: 'Write something…' }),
      counter,
    ]
    const html = shallowRef(INITIAL_HTML)
    const readonly = shallowRef(false)
    const editor = shallowRef<Editor | null>(null)
    const counts = shallowRef({ characters: 0, words: 0 })
    const pastedHTML = shallowRef('')
    const markdown = computed(() => htmlToMd(html.value))

    const refreshCounts = (): void => {
      counts.value = { characters: counter.count(), words: counter.words() }
    }

    const bindEditor = (instance: unknown): void => {
      const bound = (instance as { editor?: Editor | null } | null)?.editor ?? null
      if (bound && bound !== editor.value) {
        editor.value = bound
        bound.on('update', refreshCounts)
        refreshCounts()
      }
    }

    const pasteSample = (): void => {
      if (editor.value) {
        const before = editor.value.getHTML()
        pasteHTML(editor.value, XSS_SAMPLE)
        const after = editor.value.getHTML()
        pastedHTML.value = after.startsWith(before) ? after.slice(before.length) : after
      }
    }

    const toggleButton = (
      testid: string,
      label: string,
      pressed: boolean,
      onClick: () => void,
    ): VNode =>
      h(
        'button',
        {
          type: 'button',
          class: 'demo-button',
          'aria-pressed': pressed,
          'data-testid': testid,
          onClick,
        },
        label,
      )

    return () =>
      h('section', { class: 'demo-section', 'aria-labelledby': 'full-title' }, [
        h('h2', { id: 'full-title' }, 'Full editor'),
        h(
          'p',
          'Every module enabled, the default toolbar and theme. The value is HTML; the Markdown pane converts it with htmlToMd().',
        ),
        h('div', { class: 'demo-controls' }, [
          toggleButton('readonly-toggle', 'Readonly', readonly.value, () => {
            readonly.value = !readonly.value
          }),
          h(
            'button',
            {
              type: 'button',
              class: 'demo-button',
              disabled: readonly.value,
              'data-testid': 'paste-xss',
              onClick: pasteSample,
            },
            'Paste XSS sample',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'demo-button',
              'data-testid': 'reset',
              onClick: () => {
                html.value = INITIAL_HTML
                pastedHTML.value = ''
              },
            },
            'Reset',
          ),
          h(
            'output',
            { class: 'demo-count', 'data-testid': 'character-count', 'aria-live': 'polite' },
            `${String(counts.value.characters)} / ${String(CHARACTER_LIMIT)} characters, ${String(counts.value.words)} ${counts.value.words === 1 ? 'word' : 'words'}`,
          ),
        ]),
        h(
          WysiwygEditor,
          {
            ref: bindEditor,
            class: ['vw-editor', props.themeClass],
            modelValue: html.value,
            'onUpdate:modelValue': (value: string) => {
              html.value = value
            },
            readonly: readonly.value,
            label: 'Full editor',
            name: 'body',
            modules,
          },
          {
            toolbar: ({ editor: current }: { editor: Editor }) =>
              h(EditorToolbar, { editor: current }),
          },
        ),
        pastedHTML.value &&
          h('div', { class: 'demo-panes', 'data-testid': 'xss-result' }, [
            h(OutputPane, {
              title: 'Clipboard HTML (untrusted)',
              content: XSS_SAMPLE,
              testid: 'xss-input',
            }),
            h(OutputPane, {
              title: 'What the editor inserted (sanitized)',
              content: pastedHTML.value,
              testid: 'xss-output',
            }),
          ]),
        h('div', { class: 'demo-panes' }, [
          h(OutputPane, { title: 'HTML (v-model)', content: html.value, testid: 'html-output' }),
          h(OutputPane, { title: 'Markdown', content: markdown.value, testid: 'markdown-output' }),
        ]),
      ])
  },
})
