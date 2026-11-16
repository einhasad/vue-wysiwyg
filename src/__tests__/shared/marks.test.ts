import { afterEach, describe, expect, it } from 'vitest'
import type { Editor, Module } from '../../core/types.js'
import { bold } from '../../modules/bold.js'
import { italic } from '../../modules/italic.js'
import {
  activeMark,
  isMarkActive,
  setMark,
  setMarkAtCaret,
  toggleMark,
} from '../../shared/marks.js'
import { mountEditor, select, selectedText, textOf } from '../core/helpers.js'

const REL = 'rel="noopener noreferrer nofollow"'

const linkLike: Module = {
  name: 'link-like',
  schema: {
    tags: {
      a: {
        kind: 'inline',
        attrs: ['href', 'target'],
        urlAttrs: ['href'],
        fixedAttrs: { rel: 'noopener noreferrer nofollow' },
      },
    },
  },
  commands: {
    link: {
      run: (editor: Editor, url: string | null) =>
        setMarkAtCaret(editor, 'a', url === null ? null : { href: url }),
    },
    toggleLink: { run: (editor: Editor) => toggleMark(editor, 'a', { href: '/t' }) },
  },
}

const run = (editor: Editor, name: string, arg?: string | null): boolean =>
  (editor.exec as (name: string, arg?: string | null) => boolean)(name, arg)

const linkEditor = (content: string): Editor => mountEditor({ content, modules: [linkLike] })

afterEach(() => {
  document.body.replaceChildren()
})

describe('setMark with attributes', () => {
  it('wraps the selection in a mark with attributes', () => {
    const editor = linkEditor('<p>abcd</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 3)
    expect(run(editor, 'link', 'https://a.example')).toBe(true)
    expect(editor.getHTML()).toBe(`<p>a<a href="https://a.example" ${REL}>bc</a>d</p>`)
    expect(selectedText()).toBe('bc')
  })

  it('replaces the attributes of marks inside the selection and merges the result', () => {
    const editor = linkEditor(`<p><a href="/old">ab</a>cd</p>`)
    select(textOf(editor, [0, 0, 0]), 1, textOf(editor, [0, 1]), 1)
    run(editor, 'link', '/new')
    expect(editor.getHTML()).toBe(`<p><a href="/old" ${REL}>a</a><a href="/new" ${REL}>bc</a>d</p>`)
  })

  it('updates the mark around a collapsed caret', () => {
    const editor = linkEditor('<p>x<a href="/old">link</a></p>')
    select(textOf(editor, [0, 1, 0]), 2)
    expect(activeMark(editor, 'a')?.getAttribute('href')).toBe('/old')
    expect(run(editor, 'link', '/new')).toBe(true)
    expect(editor.getHTML()).toBe(`<p>x<a href="/new" ${REL}>link</a></p>`)
  })

  it('removes the whole mark around a collapsed caret and keeps the caret', () => {
    const editor = linkEditor('<p>x<a href="/old">link</a>y</p>')
    const text = textOf(editor, [0, 1, 0])
    select(text, 2)
    expect(run(editor, 'link', null)).toBe(true)
    expect(editor.getHTML()).toBe('<p>xlinky</p>')
    expect(document.getSelection()?.anchorNode).toBe(text)
    expect(document.getSelection()?.anchorOffset).toBe(2)
  })

  it('returns false for a collapsed caret outside the mark or without a selection', () => {
    const editor = linkEditor('<p>plain</p>')
    select(textOf(editor, [0, 0]), 2)
    expect(run(editor, 'link', '/x')).toBe(false)
    expect(run(editor, 'link', null)).toBe(false)
    expect(setMark(editor, 'a', { href: '/x' })).toBe(false)
    document.getSelection()?.removeAllRanges()
    expect(setMark(editor, 'a', { href: '/x' })).toBe(false)
    expect(setMarkAtCaret(editor, 'a', { href: '/x' })).toBe(false)
    expect(activeMark(editor, 'a')).toBeUndefined()
  })

  it('removes the mark from a selection', () => {
    const editor = linkEditor('<p><a href="/a">abcd</a></p>')
    select(textOf(editor, [0, 0, 0]), 1, textOf(editor, [0, 0, 0]), 3)
    run(editor, 'link', null)
    expect(editor.getHTML()).toBe(`<p><a href="/a" ${REL}>a</a>bc<a href="/a" ${REL}>d</a></p>`)
  })

  it('returns false when the selection covers no text', () => {
    const editor = linkEditor('<p>ab</p><p>cd</p>')
    select(textOf(editor, [0, 0]), 2, textOf(editor, [1, 0]), 0)
    expect(setMark(editor, 'a', { href: '/x' })).toBe(false)
  })

  it('toggles a mark with attributes on and off', () => {
    const editor = linkEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    run(editor, 'toggleLink')
    expect(editor.getHTML()).toBe(`<p><a href="/t" ${REL}>ab</a></p>`)
    run(editor, 'toggleLink')
    expect(editor.getHTML()).toBe('<p>ab</p>')
    select(textOf(editor, [0, 0]), 1)
    expect(run(editor, 'toggleLink')).toBe(true)
    expect(editor.getHTML()).toBe('<p>ab</p>')
    expect(isMarkActive(editor, 'a')).toBe(true)
  })

  it('leaves URL safety to normalize when a caller skips safeUrl', () => {
    const editor = linkEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    run(editor, 'link', 'javascript:alert(1)')
    expect(editor.getHTML()).toBe(`<p><a ${REL}>ab</a></p>`)
  })

  it('sets and removes a mark with attributes across blocks', () => {
    const editor = linkEditor('<p>ab</p><p>cd</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [1, 0]), 1)
    run(editor, 'link', '/x')
    expect(editor.getHTML()).toBe(
      `<p>a<a href="/x" ${REL}>b</a></p><p><a href="/x" ${REL}>c</a>d</p>`,
    )
    expect(selectedText()).toContain('b')
    expect(selectedText()).toContain('c')
    run(editor, 'link', null)
    expect(editor.getHTML()).toBe('<p>ab</p><p>cd</p>')
  })

  it('keeps a selection inside a mark with the same attributes intact', () => {
    const editor = linkEditor(`<p><a href="/x">abc</a></p>`)
    select(textOf(editor, [0, 0, 0]), 1, textOf(editor, [0, 0, 0]), 2)
    run(editor, 'link', '/x')
    expect(editor.getHTML()).toBe(`<p><a href="/x" ${REL}>abc</a></p>`)
    expect(selectedText()).toBe('b')
  })

  it('reads and updates the mark around a caret inside a nested mark', () => {
    const editor = mountEditor({
      content: '<p><a href="/a" target="_blank"><strong>bo</strong>ld</a></p>',
      modules: [linkLike, bold()],
    })
    select(textOf(editor, [0, 0, 0, 0]), 1)
    expect(activeMark(editor, 'a')?.getAttribute('target')).toBe('_blank')
    expect(activeMark(editor, 'strong')?.textContent).toBe('bo')
    expect(run(editor, 'link', '/b')).toBe(true)
    expect(editor.getHTML()).toBe(
      `<p><a href="/b" target="_blank" ${REL}><strong>bo</strong>ld</a></p>`,
    )
    expect(run(editor, 'link', null)).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>bo</strong>ld</p>')
    expect(selectedText()).toBe('')
    expect(document.getSelection()?.anchorNode).toBe(textOf(editor, [0, 0, 0]))
    expect(document.getSelection()?.anchorOffset).toBe(1)
  })

  it('removes the mark when the caret sits on the mark element itself', () => {
    const editor = linkEditor('<p>x<a href="/a">link</a>y</p>')
    select(editor.root.firstChild?.childNodes[1] as Node, 0)
    expect(run(editor, 'link', null)).toBe(true)
    expect(editor.getHTML()).toBe('<p>xlinky</p>')
    expect(editor.root.contains(document.getSelection()?.anchorNode ?? null)).toBe(true)
  })
})

describe('toggleMark without attributes', () => {
  it('keeps a mark that already covers part of the selection and its nested marks', () => {
    const editor = mountEditor({
      content: '<p><strong>a<em>b</em></strong>c</p>',
      modules: [bold(), italic()],
    })
    select(textOf(editor, [0, 0, 0]), 0, textOf(editor, [0, 1]), 1)
    expect(editor.exec('bold')).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>a<em>b</em>c</strong></p>')
    expect(selectedText()).toBe('abc')
  })
})
