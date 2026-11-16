import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { placeholder, type PlaceholderOptions } from '../../../modules/placeholder.js'
import { beforeInput, dispatch, mountEditor, select } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const placeholderEditor = (content: string, options?: PlaceholderOptions): Editor =>
  mountEditor({ content, modules: [placeholder(options)] })

const firstBlock = (editor: Editor): Element => editor.root.firstElementChild as Element

describe('placeholder module', () => {
  it('sets data-placeholder, aria-placeholder and the empty class on an empty editor', () => {
    const { root } = placeholderEditor('', { text: 'Write something' })
    expect(root.dataset['placeholder']).toBe('Write something')
    expect(root.getAttribute('aria-placeholder')).toBe('Write something')
    expect(root.classList.contains('is-empty')).toBe(true)
  })

  it('does not set the empty class when there is initial content', () => {
    const { root } = placeholderEditor('<p>a</p>', { text: 'x' })
    expect(root.classList.contains('is-empty')).toBe(false)
    expect(root.dataset['placeholder']).toBe('x')
  })

  it('treats whitespace-only content as empty', () => {
    expect(placeholderEditor('<p>  </p><p><br></p>').root.classList.contains('is-empty')).toBe(true)
  })

  it('defaults to an empty text', () => {
    const { root } = mountEditor({ modules: [placeholder()] })
    expect(root.getAttribute('data-placeholder')).toBe('')
    expect(root.getAttribute('aria-placeholder')).toBe('')
  })

  it('toggles the class on update', () => {
    const editor = placeholderEditor('', { text: 'x' })
    editor.setHTML('<p>a</p>')
    expect(editor.root.classList.contains('is-empty')).toBe(false)
    editor.setHTML('')
    expect(editor.root.classList.contains('is-empty')).toBe(true)
  })

  it('follows native typing through the input event', () => {
    const editor = placeholderEditor('', { text: 'x' })
    const paragraph = firstBlock(editor)
    select(paragraph, 0)
    beforeInput(editor, 'insertText', { data: 'a' })
    paragraph.prepend('a')
    dispatch(editor.root, 'input')
    expect(editor.root.classList.contains('is-empty')).toBe(false)
    paragraph.replaceChildren()
    dispatch(editor.root, 'input')
    expect(editor.root.classList.contains('is-empty')).toBe(true)
  })

  it('keeps the class while composing and updates after compositionend', () => {
    const editor = placeholderEditor('', { text: 'x' })
    dispatch(editor.root, 'compositionstart')
    firstBlock(editor).prepend('か')
    dispatch(editor.root, 'input', { isComposing: true })
    expect(editor.root.classList.contains('is-empty')).toBe(true)
    dispatch(editor.root, 'compositionend')
    expect(editor.root.classList.contains('is-empty')).toBe(false)
  })

  it('supports a custom empty class', () => {
    const { root } = placeholderEditor('', { text: 'x', emptyClass: 'vw-empty' })
    expect(root.classList.contains('vw-empty')).toBe(true)
    expect(root.classList.contains('is-empty')).toBe(false)
  })

  it('adds no styles to the root', () => {
    const { root } = placeholderEditor('', { text: 'x' })
    expect(root.getAttribute('style')).toBe('white-space: pre-wrap;')
  })

  it('removes its attributes and stops updating on destroy', () => {
    const editor = placeholderEditor('', { text: 'x' })
    const { root } = editor
    editor.destroy()
    expect(root.hasAttribute('data-placeholder')).toBe(false)
    expect(root.hasAttribute('aria-placeholder')).toBe(false)
    expect(root.classList.contains('is-empty')).toBe(false)
    root.replaceChildren()
    dispatch(root, 'input')
    expect(root.classList.contains('is-empty')).toBe(false)
  })
})
