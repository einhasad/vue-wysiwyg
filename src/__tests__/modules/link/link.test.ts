import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor, EditorOptions } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { link, LINK_REL, linkHref, type LinkOptions } from '../../../modules/link.js'
import {
  beforeInput,
  keyDown,
  mountEditor,
  select,
  selectedText,
  textOf,
} from '../../core/helpers.js'

const REL = `rel="${LINK_REL}"`

const linkEditor = (
  content: string,
  options?: LinkOptions,
  editorOptions: EditorOptions = {},
): Editor => mountEditor({ content, modules: [link(options), bold()], ...editorOptions })

afterEach(() => {
  document.body.replaceChildren()
})

describe('link command', () => {
  it('wraps the selected text in a link with the fixed rel and keeps the selection', () => {
    const editor = linkEditor('<p>abcd</p>')
    select(textOf(editor, [0, 0]), 1, textOf(editor, [0, 0]), 3)
    expect(editor.exec('link', 'https://a.example/path?q=1')).toBe(true)
    expect(editor.getHTML()).toBe(`<p>a<a href="https://a.example/path?q=1" ${REL}>bc</a>d</p>`)
    expect(selectedText()).toBe('bc')
    expect(editor.isActive('link')).toBe(true)
    expect(linkHref(editor)).toBe('https://a.example/path?q=1')
  })

  it('accepts relative, fragment, mailto and tel urls and trims surrounding whitespace', () => {
    for (const [url, href] of [
      ['/docs', '/docs'],
      ['#top', '#top'],
      ['mailto:a@b.example', 'mailto:a@b.example'],
      ['tel:+123', 'tel:+123'],
      ['  https://a.example \n', 'https://a.example'],
    ] as const) {
      const editor = linkEditor('<p>ab</p>')
      select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
      expect(editor.exec('link', url)).toBe(true)
      expect(editor.getHTML()).toBe(`<p><a href="${href}" ${REL}>ab</a></p>`)
    }
  })

  it('updates the href of the whole link around a collapsed caret', () => {
    const editor = linkEditor('<p>x<a href="/old">link</a>y</p>')
    select(textOf(editor, [0, 1, 0]), 2)
    expect(linkHref(editor)).toBe('/old')
    expect(editor.isActive('link')).toBe(true)
    expect(editor.exec('link', '/new')).toBe(true)
    expect(editor.getHTML()).toBe(`<p>x<a href="/new" ${REL}>link</a>y</p>`)
  })

  it('removes the whole link around a collapsed caret with null', () => {
    const editor = linkEditor('<p>x<a href="/old"><strong>li</strong>nk</a>y</p>')
    select(textOf(editor, [0, 1, 1]), 1)
    expect(editor.exec('link', null)).toBe(true)
    expect(editor.getHTML()).toBe('<p>x<strong>li</strong>nky</p>')
    expect(editor.isActive('link')).toBe(false)
    expect(linkHref(editor)).toBeUndefined()
  })

  it('removes the link from the selected part only', () => {
    const editor = linkEditor('<p><a href="/a">abcd</a></p>')
    select(textOf(editor, [0, 0, 0]), 1, textOf(editor, [0, 0, 0]), 3)
    expect(editor.exec('link', null)).toBe(true)
    expect(editor.getHTML()).toBe(`<p><a href="/a" ${REL}>a</a>bc<a href="/a" ${REL}>d</a></p>`)
  })

  it('needs selected text or a caret inside a link', () => {
    const editor = linkEditor('<p>ab</p><p></p>')
    select(textOf(editor, [0, 0]), 1)
    expect(editor.exec('link', 'https://a.example')).toBe(false)
    select(editor.root.lastChild as Node, 0)
    expect(editor.exec('link', '/x')).toBe(false)
    expect(editor.getHTML()).toBe('<p>ab</p><p><br></p>')
  })

  it('returns false without a selection or for a null url outside a link', () => {
    const editor = linkEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 1)
    expect(editor.exec('link', null)).toBe(false)
    document.getSelection()?.removeAllRanges()
    expect(editor.exec('link', '/x')).toBe(false)
    expect(editor.isActive('link')).toBe(false)
    expect(linkHref(editor)).toBeUndefined()
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('does nothing when readonly', () => {
    const editor = linkEditor('<p>ab</p>', {}, { readonly: true })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(editor.can('link')).toBe(false)
    expect(editor.exec('link', '/x')).toBe(false)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('adds the target option as a fixed attribute to new and pasted links', () => {
    const editor = linkEditor('<p>ab<a href="/p" target="_top">c</a></p>', { target: '_blank' })
    expect(editor.getHTML()).toBe(`<p>ab<a href="/p" rel="${LINK_REL}" target="_blank">c</a></p>`)
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    editor.exec('link', '/x')
    expect(editor.root.querySelector('a')?.outerHTML).toBe(
      `<a href="/x" rel="${LINK_REL}" target="_blank">ab</a>`,
    )
  })

  it('drops target without the option and keeps rel fixed', () => {
    const editor = linkEditor('<p><a href="/p" target="_blank" rel="opener">c</a></p>')
    expect(editor.getHTML()).toBe(`<p><a href="/p" ${REL}>c</a></p>`)
  })

  it('respects the editor url schemes', () => {
    const editor = linkEditor('<p>ab</p>', {}, { urlSchemes: ['https'] })
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(editor.exec('link', 'mailto:a@b.example')).toBe(false)
    expect(editor.exec('link', 'https://a.example')).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'jav\nascript:alert(1)',
    '\u0001javascript:alert(1)',
    ' javascript:alert(1)',
    'java\u0000script:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'DATA:text/html,<script>alert(1)</script>',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    ' //evil.example',
  ])('2 rejects %j via safeUrl (security vector group 2)', (url) => {
    const editor = linkEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    expect(editor.exec('link', url)).toBe(false)
    select(textOf(editor, [0, 0]), 1)
    expect(editor.exec('link', url)).toBe(false)
    expect(editor.getHTML()).toBe('<p>ab</p>')
  })

  it('2 rejects entity-obfuscated schemes as decoded by the html parser', () => {
    for (const entity of [
      '&#106;avascript:alert(1)',
      'java&#x09;script:alert(1)',
      '&#x01;javascript:x',
    ]) {
      const decoded = new DOMParser()
        .parseFromString(`<a href="${entity}">`, 'text/html')
        .querySelector('a')
      const editor = linkEditor('<p>ab</p>')
      select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
      expect(editor.exec('link', decoded?.getAttribute('href') ?? '')).toBe(false)
      expect(editor.exec('link', entity)).toBe(true)
      expect(editor.root.querySelector('a')?.getAttribute('href')).toBe(entity)
      expect(editor.root.querySelector('a')?.protocol).not.toBe('javascript:')
    }
  })
})

describe('link input routing and shortcut', () => {
  it('routes beforeinput insertLink to the link command', () => {
    const editor = linkEditor('<p>ab</p>')
    select(textOf(editor, [0, 0]), 0, textOf(editor, [0, 0]), 2)
    const event = beforeInput(editor, 'insertLink', { data: 'https://a.example' })
    expect(event.defaultPrevented).toBe(true)
    expect(editor.getHTML()).toBe(`<p><a href="https://a.example" ${REL}>ab</a></p>`)
    beforeInput(editor, 'insertLink', { data: 'javascript:alert(1)' })
    expect(editor.getHTML()).toBe(`<p><a href="https://a.example" ${REL}>ab</a></p>`)
  })

  it('calls the shortcut handler on Mod-k and prevents the browser default', () => {
    const onShortcut = vi.fn()
    const editor = linkEditor('<p>ab</p>', { onShortcut })
    for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(keyDown(editor, { key: 'k', ...init }).defaultPrevented).toBe(true)
    }
    expect(onShortcut).toHaveBeenCalledTimes(2)
    expect(onShortcut).toHaveBeenCalledWith(editor)
    expect(keyDown(editor, { key: 'k', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
      false,
    )
    expect(keyDown(editor, { key: 'k' }).defaultPrevented).toBe(false)
    expect(onShortcut).toHaveBeenCalledTimes(2)
  })

  it('leaves Mod-k to the browser without a shortcut handler or when readonly', () => {
    expect(keyDown(linkEditor('<p>ab</p>'), { key: 'k', ctrlKey: true }).defaultPrevented).toBe(
      false,
    )
    const onShortcut = vi.fn()
    const editor = linkEditor('<p>ab</p>', { onShortcut }, { readonly: true })
    expect(keyDown(editor, { key: 'k', ctrlKey: true }).defaultPrevented).toBe(false)
    expect(onShortcut).not.toHaveBeenCalled()
  })
})
