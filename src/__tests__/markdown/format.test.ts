import { describe, expect, it } from 'vitest'
import { markdownFormat, markdownShortcuts } from '../../markdown/index.js'
import { mountEditor } from '../core/helpers.js'
import { markdownTags } from './schema.js'

describe('markdownFormat', () => {
  it('loads markdown content and exports markdown values', () => {
    const editor = mountEditor({
      modules: [markdownTags],
      format: markdownFormat,
      content: '# Title\n\nSome **bold** text\n\n- one\n- two',
    })
    expect(editor.getHTML()).toBe(
      '<h1>Title</h1><p>Some <strong>bold</strong> text</p><ul><li>one</li><li>two</li></ul>',
    )
    expect(editor.getValue()).toBe('# Title\n\nSome **bold** text\n\n- one\n- two')
  })

  it('round trips setValue and reports empty content as an empty string', () => {
    const editor = mountEditor({ modules: [markdownTags], format: markdownFormat })
    expect(editor.getValue()).toBe('')
    editor.setValue('[link](https://example.com) and *em*')
    expect(editor.getValue()).toBe('[link](https://example.com) and *em*')
    editor.setValue('')
    expect(editor.getValue()).toBe('')
  })

  it('drops markup the editor schema does not allow', () => {
    const editor = mountEditor({ format: markdownFormat, content: '## Heading with **bold**' })
    expect(editor.getHTML()).toBe('<p>Heading with bold</p>')
  })

  it('parses links with the URL policy of the editor', () => {
    const editor = mountEditor({
      modules: [markdownTags],
      format: markdownFormat,
      urlSchemes: ['https', 'ftp'],
      content: '[file](ftp://files.example/a) [mail](mailto:a@b.example)',
    })
    expect(editor.getHTML()).toBe(
      '<p><a href="ftp://files.example/a" rel="noopener noreferrer nofollow">file</a> mail</p>',
    )
    editor.setValue('[again](ftp://files.example/b)')
    expect(editor.getValue()).toBe('[again](ftp://files.example/b)')
  })

  it('re-exports the shortcuts module from the markdown entry', () => {
    expect(markdownShortcuts().name).toBe('markdownShortcuts')
  })
})
