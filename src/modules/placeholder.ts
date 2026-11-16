import type { Module } from '../core/types.js'

export interface PlaceholderOptions {
  readonly text?: string
  readonly emptyClass?: string
}

export const placeholder = ({
  text = '',
  emptyClass = 'is-empty',
}: PlaceholderOptions = {}): Module => ({
  name: 'placeholder',
  setup(editor) {
    const { root } = editor
    const refresh = (): void => {
      root.classList.toggle(emptyClass, editor.isEmpty())
    }
    root.dataset['placeholder'] = text
    root.setAttribute('aria-placeholder', text)
    refresh()
    const off = editor.on('update', refresh)
    return () => {
      off()
      root.classList.remove(emptyClass)
      root.removeAttribute('data-placeholder')
      root.removeAttribute('aria-placeholder')
    }
  },
})
