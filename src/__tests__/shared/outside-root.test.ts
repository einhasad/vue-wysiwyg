import { afterEach, describe, expect, it } from 'vitest'
import { createEditor } from '../../core/editor.js'
import type { Editor, Module } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { heading } from '../../modules/heading.js'
import { link } from '../../modules/link.js'
import { lists } from '../../modules/lists.js'

const PAGE = '<p id="before">page before</p><div id="editor"></div><p id="after">page after</p>'

const editorInPage = (content: string, modules: readonly Module[]): Editor => {
  document.body.innerHTML = PAGE
  const element = document.getElementById('editor') as HTMLElement
  return createEditor({ element, content, modules: [...modules] })
}

const outside = (id: string): Text => document.getElementById(id)?.firstChild as Text

const insideText = (editor: Editor, index = 0): Text =>
  editor.root.querySelectorAll('p')[index]?.firstChild as Text

const pageOutside = (): string[] =>
  [document.getElementById('before'), document.getElementById('after')].map(
    (element) => element?.outerHTML ?? '',
  )

const UNTOUCHED = ['<p id="before">page before</p>', '<p id="after">page after</p>']

const run = (editor: Editor, name: string, arg?: unknown): boolean =>
  (editor.exec as (name: string, arg?: unknown) => boolean)(name, arg)

afterEach(() => {
  document.body.replaceChildren()
})

describe('commands with a selection that leaves the editor', () => {
  it.each([
    ['bold', [bold()], 'bold', undefined, 'after'],
    ['bold with the focus before the editor', [bold()], 'bold', undefined, 'before'],
    ['link', [link()], 'link', 'https://a.dev', 'after'],
    ['bulletList', [lists()], 'bulletList', undefined, 'after'],
    ['heading', [heading()], 'heading', 2, 'before'],
  ] as const)(
    '%s changes nothing inside or outside the editor',
    (_name, modules, command, arg, side) => {
      const editor = editorInPage('<p>inside</p>', modules)
      document.getSelection()?.setBaseAndExtent(insideText(editor), 2, outside(side), 4)
      expect(run(editor, command, arg)).toBe(false)
      expect(editor.getHTML()).toBe('<p>inside</p>')
      expect(pageOutside()).toEqual(UNTOUCHED)
    },
  )
})
