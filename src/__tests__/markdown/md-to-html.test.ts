import { describe, expect, it } from 'vitest'
import { mdToHtml } from '../../markdown/index.js'

describe('mdToHtml blocks', () => {
  it.each([
    ['', ''],
    ['   \n\t\n', ''],
    ['one\r\ntwo\rthree', '<p>one two three</p>'],
    ['one\n\n\ntwo', '<p>one</p><p>two</p>'],
    ['  indented start', '<p>indented start</p>'],
    ['a\0b', '<p>a�b</p>'],
  ])('paragraphs: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(html)
  })

  it.each([
    ['# a', '<h1>a</h1>'],
    ['###### a', '<h6>a</h6>'],
    ['   ## a', '<h2>a</h2>'],
    ['#\ttab', '<h1>tab</h1>'],
    ['#', '<h1></h1>'],
    ['# #', '<h1></h1>'],
    ['## a ##  ', '<h2>a</h2>'],
    ['## a#', '<h2>a#</h2>'],
    ['## a \\#', '<h2>a #</h2>'],
    ['    # four spaces', '<p># four spaces</p>'],
    ['####### seven', '<p>####### seven</p>'],
    ['#hash', '<p>#hash</p>'],
    ['text\n# heading\nmore', '<p>text</p><h1>heading</h1><p>more</p>'],
  ])('headings: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(html)
  })

  it.each([
    ['- a\n- b', '<ul><li>a</li><li>b</li></ul>'],
    ['* a\n+ b', '<ul><li>a</li><li>b</li></ul>'],
    ['1. a\n2) b', '<ol><li>a</li><li>b</li></ol>'],
    ['-', '<ul><li></li></ul>'],
    ['-a', '<p>-a</p>'],
    ['1234567890. a', '<p>1234567890. a</p>'],
    ['- a\n  - b\n- c', '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>'],
    ['- a\n  - b\n    - c\nd', '<ul><li>a<ul><li>b<ul><li>c d</li></ul></li></ul></li></ul>'],
    [
      '- a\n  - b\n    - c\n- d',
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>',
    ],
    ['- a\n 1. b', '<ul><li>a</li></ul><ol><li>b</li></ol>'],
    ['- a\n  - b\n  1. c', '<ul><li>a<ul><li>b</li></ul><ol><li>c</li></ol></li></ul>'],
    ['- a\nlazy', '<ul><li>a lazy</li></ul>'],
    ['- a\n\n  b', '<ul><li>a b</li></ul>'],
    ['- a\n\nb', '<ul><li>a</li></ul><p>b</p>'],
    ['- a\n\n- b', '<ul><li>a</li><li>b</li></ul>'],
    ['- a\n# h', '<ul><li>a</li></ul><h1>h</h1>'],
    ['para\n- item', '<p>para</p><ul><li>item</li></ul>'],
    ['- **a\n- b**', '<ul><li>**a</li><li>b**</li></ul>'],
  ])('lists: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(html)
  })

  it.each([
    ['a  \nb', '<p>a<br>b</p>'],
    ['a\\\nb', '<p>a<br>b</p>'],
    ['a \nb', '<p>a b</p>'],
    ['a  ', '<p>a</p>'],
    ['a\\', '<p>a\\</p>'],
    ['- a  \n  b', '<ul><li>a<br>b</li></ul>'],
  ])('line breaks: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(html)
  })
})

describe('mdToHtml inline', () => {
  it.each([
    ['*a*', '<em>a</em>'],
    ['_a_', '<em>a</em>'],
    ['**a**', '<strong>a</strong>'],
    ['__a__', '<strong>a</strong>'],
    ['***a***', '<em><strong>a</strong></em>'],
    ['*a **b** c*', '<em>a <strong>b</strong> c</em>'],
    ['**a *b* c**', '<strong>a <em>b</em> c</strong>'],
    ['a*b*c', 'a<em>b</em>c'],
    ['*a*b', '<em>a</em>b'],
    ['***a***b***', '<em><strong>a</strong></em>b***'],
    ['a_b_c', 'a_b_c'],
    ['a * b *', 'a * b *'],
    ['*a', '*a'],
    ['a*', 'a*'],
    ['**a*', '*<em>a</em>'],
    ['*a**', '<em>a</em>*'],
    ['***a**', '*<strong>a</strong>'],
    ['*"a"*', '<em>&#34;a&#34;</em>'],
    ['a*"b"*', 'a*&#34;b&#34;*'],
    ['_"a"_b', '_&#34;a&#34;_b'],
    ['*a _b* c_', '<em>a _b</em> c_'],
    ['_a *b_ c*', '<em>a *b</em> c*'],
    ['*a**b*', '*a**b*'],
    ['*a**b**c*', '<em>a<strong>b</strong>c</em>'],
  ])('emphasis: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(`<p>${html}</p>`)
  })

  it.each([
    ['[a](https://x.example)', '<a href="https://x.example">a</a>'],
    ['[a]( https://x.example )', '<a href="https://x.example">a</a>'],
    ['[a](/p?x=1&y=2)', '<a href="/p?x=1&#38;y=2">a</a>'],
    ['[a]()', '<a href="">a</a>'],
    ['[a](<b c>)', '<a href="b c">a</a>'],
    ['[a](<b)', '[a](&#60;b)'],
    ['[a](<b\nc>)', '[a](&#60;b c&#62;)'],
    ['[a](u(1))', '<a href="u(1)">a</a>'],
    ['[a](u(1 x)', '[a](u(1 x)'],
    ['[a](u\\))', '<a href="u)">a</a>'],
    ['[a](u\\q)', '<a href="u\\q">a</a>'],
    ['[a](u "t")', '<a href="u">a</a>'],
    ["[a](u 't')", '<a href="u">a</a>'],
    ['[a](u (t))', '<a href="u">a</a>'],
    ['[a](u "t\\"q")', '<a href="u">a</a>'],
    ['[a](u "t)', '[a](u &#34;t)'],
    ['[a](u (t(x)))', '[a](u (t(x)))'],
    ['[a](u "t" x)', '[a](u &#34;t&#34; x)'],
    ['[a](u x)', '[a](u x)'],
    ['[a](u\\', '[a](u\\'],
    ['[a] (u)', '[a] (u)'],
    ['[a]', '[a]'],
    ['a]', 'a]'],
    ['[a', '[a'],
    ['[a [b] c](u)', '<a href="u">a [b] c</a>'],
    ['[a [b](u) c](v)', '[a <a href="u">b</a> c](v)'],
    ['[a [b](u) [c](w)](v)', '[a <a href="u">b</a> <a href="w">c</a>](v)'],
    ['[**a**](u)', '<a href="u"><strong>a</strong></a>'],
    ['*[a*](u)', '*<a href="u">a*</a>'],
    ['[*a](u)*', '<a href="u">*a</a>*'],
    ['[a](javascript:alert(1))', 'a'],
    ['[a](//evil.example)', 'a'],
  ])('links: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(`<p>${html}</p>`)
  })

  it('rejects links that exceed the parenthesis nesting limit', () => {
    const deep = `[a](${'('.repeat(9)}${')'.repeat(9)})`
    expect(mdToHtml(deep)).not.toContain('<a')
    const allowed = `[a](${'('.repeat(8)}${')'.repeat(8)})`
    expect(mdToHtml(allowed)).toContain('<a href=')
  })

  it('applies a custom url policy', () => {
    const policy = { urlSchemes: ['ftp'], allowProtocolRelative: true }
    expect(mdToHtml('[a](ftp://x) [b](https://x) [c](//x)', policy)).toBe(
      '<p><a href="ftp://x">a</a> b <a href="//x">c</a></p>',
    )
  })

  it.each([
    ['\\*a\\*', '*a*'],
    ['\\\\', '\\'],
    ['\\a', '\\a'],
    ['\\', '\\'],
    ['\\<b\\>', '&#60;b&#62;'],
    ['<b onclick="x">&amp;</b>', '&#60;b onclick=&#34;x&#34;&#62;&#38;amp;&#60;/b&#62;'],
    ['`code`', '`code`'],
  ])('escapes and raw text: %j', (markdown, html) => {
    expect(mdToHtml(markdown)).toBe(`<p>${html}</p>`)
  })
})
