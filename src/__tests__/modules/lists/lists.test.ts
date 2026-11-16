import { afterEach, describe, expect, it } from 'vitest'
import type { Editor } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { heading } from '../../../modules/heading.js'
import { lists } from '../../../modules/lists.js'
import { beforeInput, keyDown, mountEditor, select, selectedText } from '../../core/helpers.js'

afterEach(() => {
  document.body.replaceChildren()
})

const listEditor = (content: string): Editor =>
  mountEditor({ content, modules: [lists(), heading()] })

const textNode = (editor: Editor, text: string): Text => {
  const walker = document.createTreeWalker(editor.root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).data === text) {
      return node as Text
    }
  }
  throw new Error(`No text node ${text}`)
}

const caretAt = (editor: Editor, text: string, offset = 0): void => {
  select(textNode(editor, text), offset)
}

const selectTexts = (editor: Editor, from: string, to: string): void => {
  select(textNode(editor, from), 0, textNode(editor, to), to.length)
}

const anchor = (): Node | null => document.getSelection()?.anchorNode ?? null

describe('lists module', () => {
  it('contributes ul before ol and li', () => {
    const module = lists()
    expect(module.name).toBe('lists')
    expect(Object.entries(module.schema?.tags ?? {})).toEqual([
      ['ul', { kind: 'list', attrs: [] }],
      ['ol', { kind: 'list', attrs: [] }],
      ['li', { kind: 'item', attrs: [] }],
    ])
  })

  it.each([
    [['ul'], ['bulletList'], '<ul><li>a</li></ul><ul><li>b</li></ul>'],
    [['ol'], ['orderedList'], '<ol><li>a</li></ol><ol><li>b</li></ol>'],
    [['ol', 'ul'], ['orderedList', 'bulletList'], '<ul><li>a</li></ul><ol><li>b</li></ol>'],
  ] as const)('offers only the %j list types', (types, commands, html) => {
    const editor = mountEditor({
      content: '<ul><li>a</li></ul><ol><li>b</li></ol>',
      modules: [lists({ types })],
    })
    expect(editor.commands).toEqual([...commands, 'indentList', 'outdentList'])
    expect(editor.getHTML()).toBe(html)
    expect([...editor.schema.tags.keys()]).toEqual(['p', 'br', ...types, 'li'])
  })

  it('toggles the only list type and leaves the absent one unavailable', () => {
    const editor = mountEditor({ content: '<p>a</p>', modules: [lists({ types: ['ol'] })] })
    caretAt(editor, 'a')
    expect(editor.can('bulletList')).toBe(false)
    expect(editor.exec('orderedList')).toBe(true)
    expect(editor.getHTML()).toBe('<ol><li>a</li></ol>')
  })

  it('wraps a stray li in ul through normalize', () => {
    expect(listEditor('<li>a</li>').getHTML()).toBe('<ul><li>a</li></ul>')
  })

  describe('toggle', () => {
    it('turns the caret paragraph into a bullet list and keeps the caret', () => {
      const editor = listEditor('<p>abc</p>')
      caretAt(editor, 'abc', 2)
      expect(editor.exec('bulletList')).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>abc</li></ul>')
      expect(anchor()).toBe(textNode(editor, 'abc'))
      expect(document.getSelection()?.anchorOffset).toBe(2)
      expect(editor.isActive('bulletList')).toBe(true)
      expect(editor.isActive('orderedList')).toBe(false)
    })

    it('turns the item back into a paragraph', () => {
      const editor = listEditor('<ul><li>abc</li></ul>')
      caretAt(editor, 'abc', 1)
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<p>abc</p>')
      expect(anchor()).toBe(textNode(editor, 'abc'))
      expect(editor.isActive('bulletList')).toBe(false)
    })

    it('switches a bullet list to an ordered list and back', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul>')
      caretAt(editor, 'b')
      editor.exec('orderedList')
      expect(editor.getHTML()).toBe('<ol><li>a</li><li>b</li></ol>')
      expect(editor.isActive('orderedList')).toBe(true)
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>')
    })

    it('converts an empty paragraph and keeps the caret in it', () => {
      const editor = listEditor('<p>a</p><p></p>')
      select(editor.root.childNodes[1] as Node, 0)
      editor.exec('orderedList')
      expect(editor.root.innerHTML).toBe('<p>a</p><ol><li><br></li></ol>')
      expect(anchor()).toBe(editor.root.querySelector('li'))
    })

    it('puts every selected block into one list and keeps the selection', () => {
      const editor = listEditor('<p>one</p><h2>two</h2><p>three</p>')
      selectTexts(editor, 'one', 'three')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>')
      expect(selectedText()).toBe('onetwothree')
      expect(editor.isActive('bulletList')).toBe(true)
    })

    it('turns every selected item into a paragraph', () => {
      const editor = listEditor('<ul><li>one</li><li>two</li><li>three</li></ul>')
      selectTexts(editor, 'one', 'three')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<p>one</p><p>two</p><p>three</p>')
      expect(selectedText()).toBe('onetwothree')
    })

    it('splits the list when a middle item is toggled off', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li><li>c</li></ul>')
      caretAt(editor, 'b')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>')
    })

    it('joins the new item with the lists around it', () => {
      const editor = listEditor('<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>')
      caretAt(editor, 'b')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')
    })

    it('does not join lists of the other type', () => {
      const editor = listEditor('<ol><li>a</li></ol><p>b</p>')
      caretAt(editor, 'b')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ol><li>a</li></ol><ul><li>b</li></ul>')
    })

    it('makes a mixed paragraph and item selection one list', () => {
      const editor = listEditor('<p>a</p><ul><li>b</li></ul><p>c</p>')
      selectTexts(editor, 'a', 'c')
      expect(editor.isActive('bulletList')).toBe(false)
      editor.exec('orderedList')
      expect(editor.getHTML()).toBe('<ol><li>a</li><li>b</li><li>c</li></ol>')
      expect(editor.isActive('orderedList')).toBe(true)
    })

    it('adds a paragraph to a selected list of the same type', () => {
      const editor = listEditor('<ul><li>a</li></ul><p>b</p>')
      selectTexts(editor, 'a', 'b')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>')
    })

    it('makes a mixed heading and list selection one list', () => {
      const editor = listEditor('<h2>a</h2><ol><li>b</li></ol>')
      selectTexts(editor, 'a', 'b')
      editor.exec('orderedList')
      expect(editor.getHTML()).toBe('<ol><li>a</li><li>b</li></ol>')
    })

    it('keeps a heading when its list item is toggled back', () => {
      const editor = listEditor('<h2>t</h2><p>p</p>')
      selectTexts(editor, 't', 'p')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>t</li><li>p</li></ul>')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<h2>t</h2><p>p</p>')
      expect(selectedText()).toBe('tp')
    })

    it('keeps a heading when its item leaves the list by Shift-Tab or Enter', () => {
      const editor = listEditor('<h3>t</h3><h2><br></h2>')
      selectTexts(editor, 't', 't')
      editor.exec('orderedList')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<h3>t</h3><h2><br></h2>')
      select(editor.root.lastChild as Node, 0)
      editor.exec('orderedList')
      expect(editor.getHTML()).toBe('<h3>t</h3><ol><li><br></li></ol>')
      select(editor.root.querySelector('li') as Node, 0)
      expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<h3>t</h3><h2><br></h2>')
    })

    it('lifts a nested item all the way to a paragraph', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>')
      caretAt(editor, 'b')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<ul><li>a</li></ul><p>b</p><ul><li>c</li><li>d</li></ul>')
      expect(anchor()).toBe(textNode(editor, 'b'))
    })

    it('keeps the sub-list of a lifted item as a list', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li></ul></li></ul>')
      caretAt(editor, 'a')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<p>a</p><ul><li>b</li></ul>')
    })

    it('lifts a whole nested list selection to paragraphs', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')
      selectTexts(editor, 'a', 'c')
      editor.exec('bulletList')
      expect(editor.getHTML()).toBe('<p>a</p><p>b</p><p>c</p>')
    })

    it('switches only the nested list the caret is in', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li></ul></li></ul>')
      caretAt(editor, 'b')
      editor.exec('orderedList')
      expect(editor.getHTML()).toBe('<ul><li>a<ol><li>b</li></ol></li></ul>')
    })

    it('does nothing with the caret directly in the root', () => {
      const editor = listEditor('<p>a</p>')
      select(editor.root, 0)
      expect(editor.exec('bulletList')).toBe(false)
      expect(editor.isActive('bulletList')).toBe(false)
      expect(editor.getHTML()).toBe('<p>a</p>')
    })

    it('does nothing without a selection or in readonly mode', () => {
      const editor = listEditor('<p>a</p>')
      document.getSelection()?.removeAllRanges()
      expect(editor.exec('bulletList')).toBe(false)
      expect(editor.isActive('bulletList')).toBe(false)
      const readonly = mountEditor({ content: '<p>a</p>', modules: [lists()], readonly: true })
      caretAt(readonly, 'a')
      expect(readonly.exec('bulletList')).toBe(false)
      expect(readonly.getHTML()).toBe('<p>a</p>')
    })
  })

  describe('Enter', () => {
    it('exits the list from an empty last item', () => {
      const editor = listEditor('<ul><li>a</li><li></li></ul>')
      select(editor.root.querySelectorAll('li')[1] as Node, 0)
      const event = beforeInput(editor, 'insertParagraph')
      expect(event.defaultPrevented).toBe(true)
      expect(editor.root.innerHTML).toBe('<ul><li>a</li></ul><p><br></p>')
      expect(anchor()).toBe(editor.root.lastChild)
    })

    it('splits the list from an empty middle item', () => {
      const editor = listEditor('<ol><li>a</li><li></li><li>b</li></ol>')
      select(editor.root.querySelectorAll('li')[1] as Node, 0)
      beforeInput(editor, 'insertParagraph')
      expect(editor.root.innerHTML).toBe('<ol><li>a</li></ol><p><br></p><ol><li>b</li></ol>')
    })

    it('moves an empty nested item one level up', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li><li></li><li>c</li></ul></li></ul>')
      select(editor.root.querySelectorAll('li')[2] as Node, 0)
      beforeInput(editor, 'insertParagraph')
      expect(editor.root.innerHTML).toBe(
        '<ul><li>a<ul><li>b</li></ul></li><li><br><ul><li>c</li></ul></li></ul>',
      )
      expect(anchor()).toBe(editor.root.querySelectorAll('li')[2])
    })

    it('leaves Enter in a non-empty item to the browser', () => {
      const editor = listEditor('<ul><li>a</li></ul>')
      caretAt(editor, 'a', 1)
      expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
      expect(editor.getHTML()).toBe('<ul><li>a</li></ul>')
    })

    it('leaves Enter in a paragraph to the browser', () => {
      const editor = listEditor('<p></p>')
      select(editor.root.firstChild as Node, 0)
      expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    })

    it('leaves Enter with a non-collapsed selection to the browser', () => {
      const editor = listEditor('<ul><li>ab</li><li></li></ul>')
      select(textNode(editor, 'ab'), 0, textNode(editor, 'ab'), 1)
      expect(beforeInput(editor, 'insertParagraph').defaultPrevented).toBe(false)
    })

    it('emits one update', () => {
      const editor = listEditor('<ul><li></li></ul>')
      let updates = 0
      editor.on('update', () => updates++)
      select(editor.root.querySelector('li') as Node, 0)
      beforeInput(editor, 'insertParagraph')
      expect(updates).toBe(1)
      expect(editor.root.innerHTML).toBe('<p><br></p>')
    })
  })

  describe('Backspace', () => {
    it('lifts the first item at its start into a paragraph', () => {
      const editor = listEditor('<ul><li>ab</li><li>c</li></ul>')
      caretAt(editor, 'ab')
      const event = beforeInput(editor, 'deleteContentBackward')
      expect(event.defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<p>ab</p><ul><li>c</li></ul>')
      expect(anchor()).toBe(textNode(editor, 'ab'))
      expect(document.getSelection()?.anchorOffset).toBe(0)
    })

    it('lifts the first item on the Backspace key when no beforeinput follows', () => {
      const editor = listEditor('<ul><li>ab</li><li>c</li></ul>')
      caretAt(editor, 'ab')
      const event = keyDown(editor, { key: 'Backspace' })
      expect(event.defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<p>ab</p><ul><li>c</li></ul>')
    })

    it('leaves the Backspace key inside an item to the browser', () => {
      const editor = listEditor('<ul><li>ab</li></ul>')
      caretAt(editor, 'ab', 1)
      expect(keyDown(editor, { key: 'Backspace' }).defaultPrevented).toBe(false)
      expect(editor.getHTML()).toBe('<ul><li>ab</li></ul>')
    })

    it('lifts an empty only item', () => {
      const editor = listEditor('<p>x</p><ul><li></li></ul>')
      select(editor.root.querySelector('li') as Node, 0)
      beforeInput(editor, 'deleteContentBackward')
      expect(editor.root.innerHTML).toBe('<p>x</p><p><br></p>')
    })

    it('treats the start inside a mark as the item start', () => {
      const editor = mountEditor({
        content: '<ul><li><strong>ab</strong></li></ul>',
        modules: [lists(), bold()],
      })
      caretAt(editor, 'ab')
      expect(beforeInput(editor, 'deleteContentBackward').defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<p><strong>ab</strong></p>')
    })

    it('moves the first nested item one level up', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>')
      caretAt(editor, 'b')
      beforeInput(editor, 'deleteContentBackward')
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>')
    })

    it.each([
      ['inside the text', '<ul><li>ab</li></ul>', 'ab', 1],
      ['in a later item', '<ul><li>a</li><li>b</li></ul>', 'b', 0],
      ['after a line break', '<ul><li>a<br>b</li></ul>', 'b', 0],
      ['in a paragraph', '<p>ab</p>', 'ab', 0],
    ])('leaves Backspace %s to the browser', (_name, content, text, offset) => {
      const editor = listEditor(content)
      caretAt(editor, text, offset)
      expect(beforeInput(editor, 'deleteContentBackward').defaultPrevented).toBe(false)
      expect(editor.getHTML()).toBe(content)
    })

    it('leaves other input types to the browser', () => {
      const editor = listEditor('<ul><li>ab</li></ul>')
      caretAt(editor, 'ab')
      expect(beforeInput(editor, 'deleteContentForward').defaultPrevented).toBe(false)
      expect(beforeInput(editor, 'insertText', { data: 'x' }).defaultPrevented).toBe(false)
    })
  })

  describe('Tab and Shift-Tab', () => {
    it('nests an item into the previous item', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul>')
      caretAt(editor, 'b', 1)
      const event = keyDown(editor, { key: 'Tab' })
      expect(event.defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>')
      expect(anchor()).toBe(textNode(editor, 'b'))
      expect(document.getSelection()?.anchorOffset).toBe(1)
    })

    it('appends to an existing sub-list of the previous item', () => {
      const editor = listEditor('<ol><li>a<ol><li>b</li></ol></li><li>c</li></ol>')
      caretAt(editor, 'c')
      keyDown(editor, { key: 'Tab' })
      expect(editor.getHTML()).toBe('<ol><li>a<ol><li>b</li><li>c</li></ol></li></ol>')
    })

    it('creates a sub-list of its own type next to a sub-list of the other type', () => {
      const editor = listEditor('<ul><li>a<ol><li>b</li></ol></li><li>c</li></ul>')
      caretAt(editor, 'c')
      keyDown(editor, { key: 'Tab' })
      expect(editor.getHTML()).toBe('<ul><li>a<ol><li>b</li></ol><ul><li>c</li></ul></li></ul>')
    })

    it('leaves Tab on the first item to the browser so focus can leave the editor', () => {
      const editor = listEditor('<ul><li>a</li></ul>')
      caretAt(editor, 'a')
      expect(keyDown(editor, { key: 'Tab' }).defaultPrevented).toBe(false)
      expect(editor.can('indentList')).toBe(false)
      expect(editor.exec('indentList')).toBe(false)
      expect(editor.getHTML()).toBe('<ul><li>a</li></ul>')
    })

    it('nests only the selected items that have a previous item', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul>')
      selectTexts(editor, 'a', 'b')
      expect(keyDown(editor, { key: 'Tab' }).defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>')
    })

    it('leaves Tab to the browser when no selected item can be nested', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li></ul></li></ul>')
      selectTexts(editor, 'a', 'b')
      expect(keyDown(editor, { key: 'Tab' }).defaultPrevented).toBe(false)
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>')
    })

    it('leaves Shift-Tab on a paragraph after an outdent to the browser', () => {
      const editor = listEditor('<ul><li>a</li></ul>')
      caretAt(editor, 'a')
      expect(keyDown(editor, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<p>a</p>')
      expect(keyDown(editor, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false)
    })

    it('nests every selected item once', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li><li>c</li></ul>')
      selectTexts(editor, 'b', 'c')
      keyDown(editor, { key: 'Tab' })
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>')
      expect(selectedText()).toBe('bc')
    })

    it('moves a selected item together with its selected children', () => {
      const editor = listEditor('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>')
      selectTexts(editor, 'b', 'c')
      keyDown(editor, { key: 'Tab' })
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>')
    })

    it('outdents a nested item with Shift-Tab', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li></ul></li></ul>')
      caretAt(editor, 'b', 1)
      const event = keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(event.defaultPrevented).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>')
      expect(anchor()).toBe(textNode(editor, 'b'))
    })

    it('takes the following siblings along as children on Shift-Tab', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>')
      caretAt(editor, 'b')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>')
    })

    it('appends the following siblings to an existing sub-list of the same type', () => {
      const editor = listEditor(
        '<ul><li>a<ul><li>b<ul><li>x</li></ul></li><li>c</li></ul></li></ul>',
      )
      caretAt(editor, 'b')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b<ul><li>x</li><li>c</li></ul></li></ul>')
    })

    it('turns a top-level item into a paragraph with Shift-Tab', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li><li>c</li></ul>')
      caretAt(editor, 'b')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<ul><li>a</li></ul><p>b</p><ul><li>c</li></ul>')
    })

    it('outdents every selected item one level', () => {
      const editor = listEditor('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>')
      selectTexts(editor, 'a', 'c')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<p>a</p><ul><li>b<ul><li>c</li></ul></li></ul>')
    })

    it('outdents sibling items in order', () => {
      const editor = listEditor('<ul><li>a<ul><li>b</li><li>c</li></ul></li></ul>')
      selectTexts(editor, 'b', 'c')
      keyDown(editor, { key: 'Tab', shiftKey: true })
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')
    })

    it('leaves Tab outside a list to the browser', () => {
      const editor = listEditor('<p>a</p>')
      caretAt(editor, 'a')
      expect(keyDown(editor, { key: 'Tab' }).defaultPrevented).toBe(false)
      expect(keyDown(editor, { key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false)
      expect(editor.can('indentList')).toBe(false)
      expect(editor.can('outdentList')).toBe(false)
    })

    it('ignores Tab with Mod or Alt', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul>')
      caretAt(editor, 'b')
      expect(keyDown(editor, { key: 'Tab', ctrlKey: true }).defaultPrevented).toBe(false)
      expect(keyDown(editor, { key: 'Tab', altKey: true }).defaultPrevented).toBe(false)
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>')
    })

    it('runs indent and outdent as commands', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul>')
      caretAt(editor, 'b')
      expect(editor.can('indentList')).toBe(true)
      expect(editor.exec('indentList')).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>')
      expect(editor.exec('outdentList')).toBe(true)
      expect(editor.getHTML()).toBe('<ul><li>a</li><li>b</li></ul>')
    })

    it('indents only the items of a mixed paragraph and item selection', () => {
      const editor = listEditor('<ul><li>a</li><li>b</li></ul><p>c</p>')
      selectTexts(editor, 'b', 'c')
      expect(editor.can('indentList')).toBe(true)
      editor.exec('indentList')
      expect(editor.getHTML()).toBe('<ul><li>a<ul><li>b</li></ul></li></ul><p>c</p>')
    })
  })
})
