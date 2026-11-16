import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../core/editor.js'
import { defineModule } from '../../core/define-module.js'
import { htmlFormat } from '../../core/html-format.js'
import type { Editor, Module } from '../../core/types.js'
import { beforeInput, dispatch, keyDown, mountEditor, select, textOf } from './helpers.js'

const commandModule = (
  name: string,
  run: (editor: Editor) => boolean = vi.fn(() => true),
  extra: Partial<Module> = {},
): Module => defineModule({ name, commands: { [name]: { run } }, ...extra })

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('createEditor setup', () => {
  it('creates its own element with accessibility attributes when none is given', () => {
    const editor = createEditor({ label: 'Description' })
    expect(editor.root.localName).toBe('div')
    expect(editor.root.getAttribute('role')).toBe('textbox')
    expect(editor.root.getAttribute('aria-multiline')).toBe('true')
    expect(editor.root.getAttribute('aria-label')).toBe('Description')
    expect(editor.root.getAttribute('aria-readonly')).toBe('false')
    expect(editor.root.contentEditable).toBe('true')
    expect(editor.root.style.whiteSpace).toBe('pre-wrap')
    expect(editor.root.innerHTML).toBe('<p><br></p>')
  })

  it('works without any options', () => {
    expect(createEditor().getHTML()).toBe('')
  })

  it('omits aria-label without a label', () => {
    expect(mountEditor().root.hasAttribute('aria-label')).toBe(false)
  })

  it('sanitizes and normalizes the initial content', () => {
    const editor = mountEditor({ content: 'loose <script>alert(1)</script><div>block</div>' })
    expect(editor.root.innerHTML).toBe('<p>loose </p><p>block</p>')
  })

  it('parses the initial content through the format', () => {
    const editor = mountEditor({
      content: 'raw',
      format: { parse: (input) => `<p>${input}!</p>`, stringify: (html) => `[${html}]` },
    })
    expect(editor.getValue()).toBe('[<p>raw!</p>]')
  })

  it('throws on duplicate command names across modules', () => {
    expect(() => mountEditor({ modules: [commandModule('same'), commandModule('same')] })).toThrow(
      'Duplicate command: same',
    )
  })

  it('lists registered commands', () => {
    expect(mountEditor({ modules: [commandModule('one'), commandModule('two')] }).commands).toEqual(
      ['one', 'two'],
    )
  })

  it('runs module setup and its cleanup on destroy', () => {
    const cleanup = vi.fn()
    const editor = mountEditor({
      modules: [
        { name: 'a', setup: () => cleanup },
        { name: 'b', setup: () => undefined },
      ],
    })
    editor.destroy()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('exposes identity helpers', () => {
    const module = { name: 'x' }
    expect(defineModule(module)).toBe(module)
    expect(htmlFormat.parse('<p>a</p>')).toBe('<p>a</p>')
    expect(htmlFormat.stringify('<p>a</p>')).toBe('<p>a</p>')
  })
})

describe('content API', () => {
  it('returns an empty string for empty content', () => {
    for (const content of ['', '<p></p>', '<p> </p>', '<p>&nbsp;​</p>', '<p><br></p><p></p>']) {
      const editor = mountEditor({ content })
      expect(editor.getHTML()).toBe('')
      expect(editor.isEmpty()).toBe(true)
    }
  })

  it('keeps content that is not empty', () => {
    const editor = mountEditor({ content: '<p>a</p><p><br></p>' })
    expect(editor.getHTML()).toBe('<p>a</p><p><br></p>')
    expect(editor.isEmpty()).toBe(false)
  })

  it('sets HTML, sanitizes it and emits update', () => {
    const editor = mountEditor()
    const update = vi.fn()
    const beforeChange = vi.fn()
    editor.on('update', update)
    editor.on('beforeChange', beforeChange)
    editor.setHTML('<p onclick="x()">a<img src=x onerror=alert(1)></p>')
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(update).toHaveBeenCalledWith(editor, undefined)
    expect(beforeChange).not.toHaveBeenCalled()
    editor.setHTML('<p>b</p>', { history: true })
    expect(beforeChange).toHaveBeenCalledOnce()
  })

  it('sets and gets values through the format', () => {
    const editor = mountEditor({
      format: {
        parse: (input) => input.toUpperCase(),
        stringify: (html) => html.length.toString(),
      },
    })
    editor.setValue('<p>abc</p>')
    expect(editor.root.innerHTML).toBe('<p>ABC</p>')
    expect(editor.getValue()).toBe('10')
  })

  it('counts text length', () => {
    expect(mountEditor({ content: '<p>ab</p><p>c</p>' }).textLength()).toBe(3)
  })

  it('exports the live DOM without sanitizing it again', () => {
    const editor = mountEditor({ content: '<p>a</p>' })
    editor.root.insertAdjacentHTML('beforeend', '<p data-x="1">b</p>')
    expect(editor.getHTML()).toBe('<p>a</p><p data-x="1">b</p>')
  })

  it('uses an external sanitizer for incoming HTML', () => {
    const sanitizer = vi.fn((html: string) => {
      const template = document.createElement('template')
      template.innerHTML = html.replace('bad', 'good')
      return template.content
    })
    const editor = mountEditor({ content: '<p>bad</p>', sanitizer })
    expect(sanitizer).toHaveBeenCalledWith('<p>bad</p>')
    expect(editor.getHTML()).toBe('<p>good</p>')
  })
})

describe('commands', () => {
  it('runs a command as a transaction', () => {
    const run = vi.fn((editor: Editor) => {
      editor.root.append(document.createTextNode('loose'))
      return true
    })
    const editor = mountEditor({ modules: [commandModule('add', run)] })
    const events: string[] = []
    editor.on('beforeChange', () => events.push('beforeChange'))
    editor.on('update', () => events.push('update'))
    expect(editor.exec('add' as 'undo')).toBe(true)
    expect(run).toHaveBeenCalledWith(editor, undefined)
    expect(events).toEqual(['beforeChange', 'update'])
    expect(editor.root.innerHTML).toBe('<p><br></p><p>loose</p>')
  })

  it('does not emit update when the command declines', () => {
    const editor = mountEditor({
      modules: [
        commandModule(
          'noop',
          vi.fn(() => false),
        ),
      ],
    })
    const update = vi.fn()
    editor.on('update', update)
    expect(editor.exec('noop' as 'undo')).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns false for unknown commands', () => {
    expect(mountEditor().exec('undo')).toBe(false)
    expect(mountEditor().can('undo')).toBe(false)
  })

  it('respects isEnabled and reports isActive', () => {
    const editor = mountEditor({
      modules: [
        {
          name: 'm',
          commands: {
            on: {
              run: () => true,
              isEnabled: () => false,
              isActive: (_editor, arg?: unknown) => arg === 2,
            },
            plain: { run: () => true },
          },
        },
      ],
    })
    expect(editor.can('on' as 'undo')).toBe(false)
    expect(editor.exec('on' as 'undo')).toBe(false)
    expect(editor.can('plain' as 'undo')).toBe(true)
    expect(editor.isActive('on' as 'undo', 2)).toBe(true)
    expect(editor.isActive('on' as 'undo', 3)).toBe(false)
    expect(editor.isActive('plain' as 'undo')).toBe(false)
    expect(editor.isActive('missing' as 'undo')).toBe(false)
  })

  it('runs transact with beforeChange, normalize and update', () => {
    const editor = mountEditor()
    const update = vi.fn()
    editor.on('update', update)
    editor.transact(() => {
      editor.root.append(document.createElement('div'))
    })
    expect(editor.root.innerHTML).toBe('<p><br></p><p><br></p>')
    expect(update).toHaveBeenCalledOnce()
  })

  it('unsubscribes listeners', () => {
    const editor = mountEditor()
    const update = vi.fn()
    const off = editor.on('update', update)
    off()
    editor.setHTML('<p>a</p>')
    expect(update).not.toHaveBeenCalled()
  })
})

describe('readonly', () => {
  it('toggles contenteditable and aria-readonly', () => {
    const editor = mountEditor({ readonly: true })
    expect(editor.readonly).toBe(true)
    expect(editor.root.contentEditable).toBe('false')
    expect(editor.root.getAttribute('aria-readonly')).toBe('true')
    editor.setReadonly(false)
    expect(editor.readonly).toBe(false)
    expect(editor.root.contentEditable).toBe('true')
  })

  it('emits readonly when setReadonly is called so state consumers can refresh', () => {
    const editor = mountEditor({
      readonly: true,
      modules: [{ name: 'noop', commands: { noop: { run: () => true } } }],
    })
    const states: [boolean, boolean][] = []
    editor.on('readonly', (current) => {
      states.push([current.readonly, current.can('noop' as never)])
    })
    editor.setReadonly(false)
    editor.setReadonly(true)
    expect(states).toEqual([
      [false, true],
      [true, false],
    ])
  })

  it('blocks commands, transact, input, keys, paste and history', () => {
    const run = vi.fn(() => true)
    const undo = vi.fn(() => true)
    const hook = vi.fn(() => true)
    const editor = mountEditor({
      content: '<p>text</p>',
      readonly: true,
      modules: [
        {
          name: 'm',
          commands: { cmd: { run }, undo: { run: undo } },
          keys: { 'Mod-b': 'cmd' },
          onKeyDown: hook,
        },
      ],
    })
    expect(editor.exec('cmd' as 'undo')).toBe(false)
    editor.transact(() => {
      editor.root.replaceChildren()
    })
    expect(editor.getHTML()).toBe('<p>text</p>')
    for (const type of [
      'insertText',
      'historyUndo',
      'insertFromPaste',
      'formatBold',
      'insertCompositionText',
    ]) {
      expect(beforeInput(editor, type).defaultPrevented).toBe(true)
    }
    expect(keyDown(editor, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(false)
    select(textOf(editor, [0, 0]), 1)
    dispatch(editor.root, 'paste', { clipboardData: { getData: () => 'pasted' } })
    expect(editor.getHTML()).toBe('<p>text</p>')
    expect(run).not.toHaveBeenCalled()
    expect(undo).not.toHaveBeenCalled()
    expect(hook).not.toHaveBeenCalled()
  })

  it('still allows programmatic setHTML', () => {
    const editor = mountEditor({ readonly: true })
    editor.setHTML('<p>a</p>')
    expect(editor.getHTML()).toBe('<p>a</p>')
  })
})

describe('focus, blur, selection and destroy', () => {
  it('emits focus and blur', () => {
    const editor = mountEditor()
    const focus = vi.fn()
    const blur = vi.fn()
    editor.on('focus', focus)
    editor.on('blur', blur)
    const nativeFocus = vi.spyOn(editor.root, 'focus')
    editor.focus()
    expect(nativeFocus).toHaveBeenCalledOnce()
    editor.root.dispatchEvent(new FocusEvent('focus'))
    editor.root.dispatchEvent(new FocusEvent('blur'))
    expect(focus).toHaveBeenCalledOnce()
    expect(blur).toHaveBeenCalledOnce()
  })

  it('emits throttled selection events only for selections inside the root', async () => {
    const editor = mountEditor({ content: '<p>abc</p>' })
    const selection = vi.fn()
    editor.on('selection', selection)
    const outside = document.body.appendChild(document.createTextNode('outside'))
    select(outside, 1)
    document.dispatchEvent(new Event('selectionchange'))
    select(textOf(editor, [0, 0]), 1)
    document.dispatchEvent(new Event('selectionchange'))
    document.dispatchEvent(new Event('selectionchange'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(selection).toHaveBeenCalledOnce()
  })

  it('removes every listener and emits destroy', () => {
    const editor = mountEditor({ content: '<p>abc</p>' })
    const destroy = vi.fn()
    const update = vi.fn()
    editor.on('destroy', destroy)
    editor.on('update', update)
    editor.destroy()
    expect(destroy).toHaveBeenCalledOnce()
    expect(editor.root.hasAttribute('contenteditable')).toBe(false)
    dispatch(editor.root, 'input')
    document.dispatchEvent(new Event('selectionchange'))
    expect(update).not.toHaveBeenCalled()
  })
})
