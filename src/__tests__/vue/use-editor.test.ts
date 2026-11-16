import { mount } from '@vue/test-utils'
import { defineComponent, h, type ShallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import type { Editor, EditorOptions } from '../../core/types.js'
import { useEditor } from '../../vue/use-editor.js'

const mountComposable = (
  options?: EditorOptions,
): { editor: ShallowRef<Editor | null>; setupValue: Editor | null; unmount: () => void } => {
  const captured: { editor?: ShallowRef<Editor | null>; setupValue?: Editor | null } = {}
  const wrapper = mount(
    defineComponent({
      setup() {
        captured.editor = useEditor(options)
        captured.setupValue = captured.editor.value
        return () => h('div')
      },
    }),
  )
  return {
    editor: captured.editor as ShallowRef<Editor | null>,
    setupValue: captured.setupValue ?? null,
    unmount: () => {
      wrapper.unmount()
    },
  }
}

describe('useEditor', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('creates the editor on mount only, never during setup', () => {
    const { editor, setupValue } = mountComposable({ content: '<p>a</p>' })
    expect(setupValue).toBeNull()
    expect(editor.value?.getHTML()).toBe('<p>a</p>')
  })

  it('creates its own root element when none is given', () => {
    const { editor } = mountComposable()
    expect(editor.value?.root.tagName).toBe('DIV')
    expect(editor.value?.root.getAttribute('role')).toBe('textbox')
  })

  it('passes options to the editor', () => {
    const { editor } = mountComposable({ readonly: true, label: 'Body' })
    expect(editor.value?.readonly).toBe(true)
    expect(editor.value?.root.getAttribute('aria-label')).toBe('Body')
  })

  it('destroys the editor and clears the ref on unmount', () => {
    const { editor, unmount } = mountComposable({ content: '<p>a</p>' })
    const created = editor.value as Editor
    const destroyed: Editor[] = []
    created.on('destroy', (instance) => destroyed.push(instance))
    unmount()
    expect(destroyed).toEqual([created])
    expect(editor.value).toBeNull()
    expect(created.root.hasAttribute('contenteditable')).toBe(false)
  })
})
