import { describe, expect, it } from 'vitest'
import { htmlToMd, mdToHtml } from '../../markdown/index.js'

describe('htmlToMd', () => {
  it.each([
    ['', ''],
    ['<p></p><p><br></p><p> </p>', ''],
    ['<p>one</p><p>two</p>', 'one\n\ntwo'],
    ['loose <strong>inline</strong> text', 'loose **inline** text'],
    ['a<p>b</p>c', 'a\n\nb\n\nc'],
    ['<p>a\n  b \tc</p>', 'a b c'],
    ['<p>a<br>b<br><br>c<br></p>', 'a\\\nb\\\n\\\nc'],
    ['<p> a <br> b </p>', 'a\\\nb'],
  ])('paragraphs and breaks: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<h1>a</h1>', '# a'],
    ['<h6>a</h6>', '###### a'],
    ['<h2>a<br>b</h2>', '## a b'],
    ['<h3></h3>', '### '],
    ['<h2>C#</h2>', '## C\\#'],
  ])('headings: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<strong>a</strong> <b>b</b>', '**a** **b**'],
    ['<em>a</em> <i>b</i>', '*a* *b*'],
    ['x<strong> a </strong>y', 'x **a** y'],
    ['x<strong>a<br></strong>y', 'x**a**\\\ny'],
    ['x<strong> </strong>y', 'x y'],
    ['<strong><em>a</em></strong>', '***a***'],
    ['<span>a</span><u>b</u><code>c</code>', 'abc'],
    ['a<!-- c -->b', 'ab'],
    ['a<script>x()</script><style>p{}</style>b', 'ab'],
  ])('inline marks: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<a href="https://x.example/a_b">t</a>', '[t](https://x.example/a_b)'],
    ['<a href="/p(1)\\q">t</a>', '[t](/p\\(1\\)\\\\q)'],
    ['<a href="a b\nc<d>">t</a>', '[t](a%20b%0Ac\\<d\\>)'],
    ['<a href="">t</a>', '[t]()'],
    ['<a>t</a>', 't'],
    ['<a name="x">t</a>', 't'],
    ['<a href="u"><strong>b</strong> [c]</a>', '[**b** \\[c\\]](u)'],
  ])('links: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<ul><li>a</li><li>b</li></ul>', '- a\n- b'],
    ['<ol><li>a</li><li>b</li></ol>', '1. a\n2. b'],
    ['<ul>\n <li>a</li>\n text <p>x</p></ul>', '- a'],
    ['<ul><li></li></ul>', '- '],
    ['<ul><li>a<br>b</li></ul>', '- a\\\n  b'],
    [
      '<ul><li>a<ul><li>b<ol><li>c</li></ol></li></ul></li><li>d</li></ul>',
      '- a\n  - b\n    1. c\n- d',
    ],
    ['<ol><li>a<ul><li>b</li></ul></li></ol>', '1. a\n   - b'],
    ['<ul><li><ul><li>b</li></ul></li></ul>', '- \n  - b'],
    ['<ul><li>- a</li><li>1. b</li></ul>', '- \\- a\n- 1\\. b'],
    ['<p>a</p><ul><li>b</li></ul><ol><li>c</li></ol>', 'a\n\n- b\n\n1. c'],
  ])('lists: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<div><p>a</p><p>b</p></div>', 'a\n\nb'],
    ['<blockquote>quote</blockquote><section><h2>t</h2></section>', 'quote\n\n## t'],
    ['<div>a</div><div>b</div>', 'a\n\nb'],
    ['<li>stray</li>', 'stray'],
  ])('containers: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
  })

  it.each([
    ['<p>\\ * _ ` [ ] &lt; &gt; #</p>', '\\\\ \\* \\_ \\` \\[ \\] \\< \\> \\#'],
    ['<p>- a</p>', '\\- a'],
    ['<p>+ a</p>', '\\+ a'],
    ['<p>1. a</p>', '1\\. a'],
    ['<p>2) a</p>', '2\\) a'],
    ['<p>a<br>- b<br>3. c</p>', 'a\\\n\\- b\\\n3\\. c'],
    ['<p>a - b 1. c</p>', 'a - b 1. c'],
  ])('escapes markdown syntax in text and round trips: %j', (html, markdown) => {
    expect(htmlToMd(html)).toBe(markdown)
    expect(htmlToMd(mdToHtml(markdown))).toBe(markdown)
  })

  it('parses with the given document', () => {
    const inert = document.implementation.createHTMLDocument('')
    const spy = { implementation: { createHTMLDocument: () => inert } } as unknown as Document
    expect(htmlToMd('<p><strong>a</strong></p>', { document: spy })).toBe('**a**')
  })

  const deepDocument = (depth: number, tags: readonly string[]): Document => {
    let node: unknown = { nodeType: 3, data: 'x', textContent: 'x', childNodes: [] }
    for (let level = depth; level--;) {
      const child = node
      node = {
        nodeType: 1,
        localName: tags[level % tags.length],
        textContent: 'x',
        childNodes: [child],
        children: [child],
        getAttribute: () => null,
      }
    }
    const body = { childNodes: [node], innerHTML: '' }
    return {
      implementation: { createHTMLDocument: () => ({ body }) },
    } as unknown as Document
  }

  it.each([
    ['inline', ['em']],
    ['blocks', ['div']],
    ['lists', ['ul', 'li']],
  ])('converts 100k nested %s without overflowing the stack', (_name, tags) => {
    const markdown = htmlToMd('', { document: deepDocument(100_000, tags) })
    expect(markdown).toContain('x')
    expect(markdown.length).toBeLessThan(50_000)
  })

  it('converts 3000 parsed nested emphasis elements', () => {
    expect(htmlToMd(`${'<em>'.repeat(3000)}x`)).toContain('x')
  })

  it('keeps the text below the nesting cap', () => {
    expect(htmlToMd(`<p>${'<em>'.repeat(200)}a<strong>b</strong></p>`).replaceAll('*', '')).toBe(
      'ab',
    )
  })
})
