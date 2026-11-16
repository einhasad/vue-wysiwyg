// @vitest-environment node
import { createSSRApp, defineComponent, h, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import type { Editor } from '../../core/types.js'
import { EditorContent } from '../../vue/editor-content.js'
import { useEditor } from '../../vue/use-editor.js'
import { useEditorState } from '../../vue/use-editor-state.js'
import { WysiwygEditor } from '../../vue/wysiwyg-editor.js'

const payload = '<p>safe</p><img src=x onerror=alert(1)><script>alert(2)</script>'

describe('server rendering', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })

  it('renders WysiwygEditor as an empty host without the model HTML', async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(
          WysiwygEditor,
          { modelValue: payload, name: 'body', label: 'Body', readonly: true },
          { toolbar: () => h('menu', 'toolbar') },
        ),
      ),
    )
    expect(html).toBe(
      '<div class="wysiwyg"><!----><div></div><input type="hidden" name="body" value></div>',
    )
    expect(html).not.toMatch(/<img|<script|onerror|alert|safe/)
  })

  it('renders composables and EditorContent without touching the DOM', async () => {
    const html = await renderToString(
      createSSRApp(
        defineComponent({
          setup() {
            const editor = useEditor({ content: payload })
            const empty = useEditorState(editor, (current) => current.isEmpty())
            const fixed = useEditorState(shallowRef<Editor | null>(null), () => 1)
            return () =>
              h(
                'section',
                { 'data-empty': String(empty.value), 'data-fixed': String(fixed.value) },
                [h(EditorContent, { editor: editor.value })],
              )
          },
        }),
      ),
    )
    expect(html).toBe(
      '<section data-empty="undefined" data-fixed="undefined"><div></div></section>',
    )
  })
})
