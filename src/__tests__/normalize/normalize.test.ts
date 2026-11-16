import { describe, expect, it } from 'vitest'
import type { Module } from '../../core/types.js'
import { isEmptyHTML, isEmptyNode, normalizeElement, normalizeHTML } from '../../normalize/index.js'
import { createSchema } from '../../sanitize/index.js'

const lists: Module = {
  name: 'lists',
  schema: {
    tags: {
      ul: { kind: 'list', attrs: [] },
      ol: { kind: 'list', attrs: ['start'] },
      li: { kind: 'item', attrs: [] },
    },
  },
}
const marks: Module = {
  name: 'marks',
  schema: {
    tags: {
      strong: { kind: 'inline', attrs: [] },
      em: { kind: 'inline', attrs: [] },
      a: {
        kind: 'inline',
        attrs: ['href', 'title'],
        urlAttrs: ['href'],
        fixedAttrs: { rel: 'noopener noreferrer nofollow' },
      },
      img: { kind: 'void', attrs: ['src', 'alt'], urlAttrs: ['src'] },
    },
    rename: { b: 'strong', i: 'em' },
  },
}
const schema = createSchema([lists, marks])

const normalizeLive = (html: string, target = schema): { html: string; changed: boolean } => {
  const root = document.createElement('div')
  root.innerHTML = html
  const changed = normalizeElement(root, target)
  return { html: root.innerHTML, changed }
}

const expectNormalized = (input: string, output: string): void => {
  const first = normalizeLive(input)
  expect(first.html).toBe(output)
  expect(first.changed).toBe(input !== output)
  expect(normalizeLive(first.html)).toEqual({ html: output, changed: false })
}

describe('normalizeElement', () => {
  it('leaves valid content untouched and reports no change', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>a <strong>b</strong></p><ul><li>c<ul><li>d</li></ul></li></ul>'
    const text = root.firstChild?.firstChild
    expect(normalizeElement(root, schema)).toBe(false)
    expect(root.firstChild?.firstChild).toBe(text)
  })

  it.each([
    ['loose text', 'text', '<p>text</p>'],
    ['whitespace between blocks', '\n<p>a</p>\n  <p>b</p>\n', '<p>a</p><p>b</p>'],
    [
      'an inline run with inner whitespace',
      '<b>a</b> <i>b</i><p>c</p>',
      '<p><strong>a</strong> <em>b</em></p><p>c</p>',
    ],
    ['a root line break', '<br>', '<p><br></p>'],
    ['div to p with attributes stripped', '<div class="x" id="y">a</div>', '<p>a</p>'],
    [
      'unknown elements unwrapped',
      '<p><span style="color:red">a<font>b</font></span></p>',
      '<p>ab</p>',
    ],
    ['unknown root wrappers unwrapped', '<section><p>a</p>b</section>', '<p>a</p><p>b</p>'],
    ['dropped elements removed', '<p>a<script>alert(1)</script><style>p{}</style></p>', '<p>a</p>'],
    ['comments removed', '<p>a<!--x--></p><!--y-->', '<p>a</p>'],
    ['empty blocks get a line break', '<p></p><p><strong></strong></p>', '<p><br></p><p><br></p>'],
    ['empty marks removed', '<p>a<em></em><strong><em></em></strong></p>', '<p>a</p>'],
    [
      'nested equal marks flattened',
      '<p><strong>a<strong>b<b>c</b></strong></strong></p>',
      '<p><strong>abc</strong></p>',
    ],
    [
      'adjacent equal marks merged',
      '<p><strong>a</strong><b>b</b></p>',
      '<p><strong>ab</strong></p>',
    ],
    [
      'merged marks re-merge their children',
      '<p><strong><em>a</em></strong><strong><em>b</em></strong></p>',
      '<p><strong><em>ab</em></strong></p>',
    ],
    [
      'marks across an empty mark',
      '<p><em>a</em><strong></strong><em>b</em></p>',
      '<p><em>ab</em></p>',
    ],
    [
      'marks with different attributes kept apart',
      '<p><a href="/a">a</a><a href="/b">b</a></p>',
      '<p><a href="/a" rel="noopener noreferrer nofollow">a</a><a href="/b" rel="noopener noreferrer nofollow">b</a></p>',
    ],
    [
      'unsafe URLs removed',
      '<p><a href="javascript:alert(1)" onclick="x">a</a></p>',
      '<p><a rel="noopener noreferrer nofollow">a</a></p>',
    ],
    [
      'URLs cleaned of control characters',
      '<p><a href=" https://a.example/\t" rel="noopener noreferrer nofollow">a</a></p>',
      '<p><a href="https://a.example/" rel="noopener noreferrer nofollow">a</a></p>',
    ],
    ['text in a list wrapped in an item', '<ul>a<li>b</li></ul>', '<ul><li>a</li><li>b</li></ul>'],
    ['whitespace in lists removed', '<ul>\n <li>a</li>\n</ul>', '<ul><li>a</li></ul>'],
    [
      'old-style nested lists moved into the previous item',
      '<ul><li>a</li><ul><li>b</li></ul></ul>',
      '<ul><li>a<ul><li>b</li></ul></li></ul>',
    ],
    ['paragraphs in items unwrapped', '<ul><li><p>a</p><p>b</p></li></ul>', '<ul><li>ab</li></ul>'],
    [
      'items in items unwrapped',
      '<ol start="2" type="a"><li>a<li>b</li></li></ol>',
      '<ol start="2"><li>a</li><li>b</li></ol>',
    ],
    [
      'stray items wrapped in a list',
      '<li>a</li>\n<li>b</li><p>c</p><li>d</li>',
      '<ul><li>a</li><li>b</li></ul><p>c</p><ul><li>d</li></ul>',
    ],
    ['inline then items at the root', 'a<li>b</li>', '<p>a</p><ul><li>b</li></ul>'],
    ['empty lists removed', '<ul> </ul><p>a</p>', '<p>a</p>'],
    ['empty items get a line break', '<ul><li></li></ul>', '<ul><li><br></li></ul>'],
    ['empty content becomes one empty paragraph', '', '<p><br></p>'],
    [
      'redundant trailing line breaks removed',
      '<p>a<br></p><p><strong>b</strong><br></p>',
      '<p>a</p><p><strong>b</strong></p>',
    ],
    [
      'an empty last line kept',
      '<p>a<br><br></p><ul><li>b<br><br></li></ul>',
      '<p>a<br><br></p><ul><li>b<br><br></li></ul>',
    ],
  ])('fixes %s', (_name, input, output) => {
    expectNormalized(input, output)
  })

  it('handles nodes created through the DOM', () => {
    const root = document.createElement('div')
    const paragraph = root.appendChild(document.createElement('p'))
    const lineBreak = paragraph.appendChild(document.createElement('br'))
    lineBreak.append('inside a void')
    paragraph.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))
    paragraph.append(document.createProcessingInstruction('x', 'y'))
    root.append(document.createTextNode(''))
    expect(normalizeElement(root, schema)).toBe(true)
    expect(root.innerHTML).toBe('<p><br></p>')
  })

  it('unwraps blocks nested in blocks through the DOM', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>a</p>'
    root.firstElementChild?.append(document.createElement('p'))
    root.querySelector('p p')?.append('b')
    expect(normalizeElement(root, schema)).toBe(true)
    expect(root.innerHTML).toBe('<p>ab</p>')
  })

  it('keeps a trailing line break after an empty text node', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>a<br></p>'
    root.firstElementChild?.insertBefore(document.createTextNode(''), root.querySelector('br'))
    expect(normalizeElement(root, schema)).toBe(false)
  })

  it('updates fixed attributes that were changed', () => {
    expect(normalizeLive('<p><a rel="opener">a</a></p>').html).toBe(
      '<p><a rel="noopener noreferrer nofollow">a</a></p>',
    )
  })

  it('falls back to p when the schema has no tag of the needed kind', () => {
    const listOnly = createSchema([
      { name: 'l', schema: { tags: { ul: { kind: 'list', attrs: [] } } } },
    ])
    expect(normalizeLive('<ul>a</ul>', listOnly).html).toBe('<ul><p>a</p></ul>')
  })
})

describe('normalizeHTML and emptiness', () => {
  it('sanitizes and normalizes HTML strings', () => {
    expect(normalizeHTML('a<b>b</b><img src=x onerror=alert(1)><ul><li>x', schema)).toBe(
      '<p>a<strong>b</strong><img src="x"></p><ul><li>x</li></ul>',
    )
  })

  it('returns an empty string for empty content', () => {
    expect(normalizeHTML('<p> <br></p><div>&nbsp;</div>', schema)).toBe('')
  })

  it('accepts another document', () => {
    const other = document.implementation.createHTMLDocument('')
    expect(normalizeHTML('x', schema, { document: other })).toBe('<p>x</p>')
  })

  it('detects empty HTML', () => {
    expect(isEmptyHTML('')).toBe(true)
    expect(isEmptyHTML('<p>​&nbsp; </p><script>text</script>')).toBe(true)
    expect(isEmptyHTML('<p>a</p>')).toBe(false)
    expect(isEmptyHTML('<img src=x>')).toBe(true)
    expect(isEmptyHTML('<img src=x>', { schema })).toBe(false)
  })

  it('treats visible void content as not empty', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p><br></p>'
    expect(isEmptyNode(root)).toBe(true)
    root.innerHTML = '<p><hr></p>'
    expect(isEmptyNode(root)).toBe(false)
  })
})
