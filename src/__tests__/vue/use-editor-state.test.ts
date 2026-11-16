import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../core/editor.js'
import type { Editor } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { useEditorState } from '../../vue/use-editor-state.js'

const mountState = <T>(
  editor: ShallowRef<Editor | null>,
  selector: (editor: Editor) => T,
): { state: ShallowRef<T | undefined>; unmount: () => void } => {
  const captured: { state?: ShallowRef<T | undefined> } = {}
  const wrapper = mount(
    defineComponent({
      setup() {
        captured.state = useEditorState(editor, selector)
        return () => h('div')
      },
    }),
  )
  return {
    state: captured.state as ShallowRef<T | undefined>,
    unmount: () => {
      wrapper.unmount()
    },
  }
}

describe('useEditorState', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('is undefined without an editor', () => {
    const { state } = mountState(shallowRef(null), (editor) => editor.getHTML())
    expect(state.value).toBeUndefined()
  })

  it('computes on attach and recomputes on update', async () => {
    const editor = shallowRef<Editor | null>(null)
    const { state } = mountState(editor, (current) => current.textLength())
    editor.value = createEditor({ content: '<p>ab</p>' })
    await nextTick()
    expect(state.value).toBe(2)
    editor.value.setHTML('<p>abcd</p>')
    expect(state.value).toBe(4)
  })

  it('recomputes on selection', async () => {
    const element = document.body.appendChild(document.createElement('div'))
    const editor = shallowRef<Editor | null>(
      createEditor({ element, content: '<p>abc</p>', modules: [bold()] }),
    )
    const { state } = mountState(editor, (current) => current.isActive('bold'))
    expect(state.value).toBe(false)
    element.innerHTML = '<p><strong>abc</strong></p>'
    document.getSelection()?.collapse(element.querySelector('strong')?.firstChild as Text, 1)
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(state.value).toBe(true)
  })

  it('recomputes when readonly changes', () => {
    const created = createEditor({ content: '<p>a</p>', modules: [bold()] })
    const { state } = mountState(shallowRef<Editor | null>(created), (current) => ({
      canBold: current.can('bold'),
      readonly: current.readonly,
    }))
    expect(state.value).toEqual({ canBold: true, readonly: false })
    created.setReadonly(true)
    expect(state.value).toEqual({ canBold: false, readonly: true })
    created.setReadonly(false)
    expect(state.value).toEqual({ canBold: true, readonly: false })
  })

  it('resets and unsubscribes when the editor is removed', async () => {
    const created = createEditor({ content: '<p>ab</p>' })
    const editor = shallowRef<Editor | null>(created)
    const selector = vi.fn((current: Editor) => current.textLength())
    const { state } = mountState(editor, selector)
    editor.value = null
    await nextTick()
    expect(state.value).toBeUndefined()
    selector.mockClear()
    created.setHTML('<p>abc</p>')
    expect(selector).not.toHaveBeenCalled()
  })

  it('unsubscribes on unmount', () => {
    const created = createEditor({ content: '<p>ab</p>' })
    const selector = vi.fn((current: Editor) => current.textLength())
    const { unmount } = mountState(shallowRef(created), selector)
    unmount()
    selector.mockClear()
    created.setHTML('<p>abc</p>')
    created.setReadonly(true)
    expect(selector).not.toHaveBeenCalled()
  })
})
