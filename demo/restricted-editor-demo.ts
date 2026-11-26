import { defineComponent, h, shallowRef } from 'vue'
import type { Editor } from '@einhasad-vue/vue-wysiwyg'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { heading } from '@einhasad-vue/vue-wysiwyg/modules/heading'
import { history } from '@einhasad-vue/vue-wysiwyg/modules/history'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'
import { lists } from '@einhasad-vue/vue-wysiwyg/modules/lists'
import { paste } from '@einhasad-vue/vue-wysiwyg/modules/paste'
import { WysiwygEditor } from '@einhasad-vue/vue-wysiwyg/vue'
import { MinimalToolbar } from './minimal-toolbar.js'
import { OutputPane } from './output-pane.js'

const INITIAL_HTML =
  '<h2>Allowed tags</h2><p>Only <strong>p</strong>, <strong>strong</strong>, <em>em</em>, <strong>ul/li</strong> and <strong>h2</strong> survive. Paste a table, an ordered list or an h3 here to see them converted.</p><ul><li>Headings: level 2</li><li>Lists: bullet points</li></ul>'

export const RestrictedEditorDemo = defineComponent({
  name: 'RestrictedEditorDemo',
  props: {
    /** Theme class added to the editor */
    themeClass: { type: String, required: true },
  },
  setup(props) {
    const modules = [
      bold(),
      italic(),
      heading({ levels: [2] }),
      lists({ types: ['ul'] }),
      history(),
      paste(),
    ]
    const html = shallowRef(INITIAL_HTML)
    return () =>
      h('section', { class: 'demo-section', 'aria-labelledby': 'restricted-title' }, [
        h('h2', { id: 'restricted-title' }, 'Restricted schema with a custom toolbar'),
        h(
          'p',
          "A CMS field that stores only p, strong, em, ul/li and h2. heading({ levels: [2] }) maps other headings to p, lists({ types: ['ul'] }) turns ordered lists into bullet lists, and the toolbar is built on the headless useEditorState().",
        ),
        h(
          WysiwygEditor,
          {
            class: ['vw-editor', props.themeClass],
            'data-testid': 'restricted-editor',
            modelValue: html.value,
            'onUpdate:modelValue': (value: string) => {
              html.value = value
            },
            label: 'Restricted editor',
            modules,
          },
          { toolbar: ({ editor }: { editor: Editor }) => h(MinimalToolbar, { editor }) },
        ),
        h('div', { class: 'demo-panes' }, [
          h(OutputPane, {
            title: 'HTML (v-model)',
            content: html.value,
            testid: 'restricted-html-output',
          }),
        ]),
      ])
  },
})
