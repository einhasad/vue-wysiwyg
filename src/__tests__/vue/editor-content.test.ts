import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../core/editor.js'
import { EditorContent } from '../../vue/editor-content.js'

describe('EditorContent', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('renders an empty host without an editor', () => {
    const wrapper = mount(EditorContent)
    expect(wrapper.html()).toBe('<div></div>')
  })

  it('appends the editor root to its host', () => {
    const editor = createEditor({ content: '<p>a</p>' })
    const wrapper = mount(EditorContent, { props: { editor } })
    expect(editor.root.parentElement).toBe(wrapper.element)
    expect((wrapper.element as HTMLElement).innerHTML).toContain('<p>a</p>')
  })

  it('appends an editor that arrives after mount', async () => {
    const wrapper = mount(EditorContent, { props: { editor: null } })
    const editor = createEditor({ content: '<p>late</p>' })
    await wrapper.setProps({ editor })
    expect(editor.root.parentElement).toBe(wrapper.element)
  })

  it('keeps the root node and its caret when the host re-renders', async () => {
    const editor = createEditor({ content: '<p>abc</p>' })
    const wrapper = mount(EditorContent, { props: { editor }, attachTo: document.body })
    const text = editor.root.querySelector('p')?.firstChild as Text
    document.getSelection()?.collapse(text, 2)
    await wrapper.setProps({ editor })
    await wrapper.setProps({ editor: { ...editor } })
    expect(editor.root.parentElement).toBe(wrapper.element)
    expect((wrapper.element as HTMLElement).childNodes).toHaveLength(1)
    expect(document.getSelection()?.anchorNode).toBe(text)
    expect(document.getSelection()?.anchorOffset).toBe(2)
  })

  it('moves to another editor root when the editor changes', async () => {
    const first = createEditor({ content: '<p>1</p>' })
    const second = createEditor({ content: '<p>2</p>' })
    const wrapper = mount(EditorContent, { props: { editor: first } })
    await wrapper.setProps({ editor: second })
    expect(second.root.parentElement).toBe(wrapper.element)
  })
})
