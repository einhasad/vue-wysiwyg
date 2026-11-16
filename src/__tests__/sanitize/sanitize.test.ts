import { describe, expect, it } from 'vitest'
import type { Module, TagRule } from '../../core/types.js'
import { createSchema, safeUrl, sanitize, sanitizeToFragment } from '../../sanitize/index.js'

const tag = (name: string, rule: Partial<TagRule> = {}): Module => ({
  name,
  schema: { tags: { [name]: { kind: 'inline', attrs: [], ...rule } } },
})

const link = tag('a', {
  attrs: ['href', 'title'],
  urlAttrs: ['href'],
  fixedAttrs: { rel: 'noopener noreferrer nofollow' },
})

describe('createSchema', () => {
  it('starts with p, br and the div rename', () => {
    const schema = createSchema()
    expect([...schema.tags.keys()]).toEqual(['p', 'br'])
    expect(schema.rename.get('div')).toBe('p')
    expect(schema.urlSchemes).toEqual(['http', 'https', 'mailto', 'tel'])
    expect(schema.allowProtocolRelative).toBe(false)
  })

  it('merges module contributions and options', () => {
    const schema = createSchema(
      [link, { name: 'none' }, { name: 'rename', schema: { rename: { b: 'strong' } } }],
      { urlSchemes: ['https'], allowProtocolRelative: true },
    )
    expect(schema.tags.get('a')?.attrs).toEqual(['href', 'title'])
    expect(schema.rename.get('b')).toBe('strong')
    expect(schema.urlSchemes).toEqual(['https'])
    expect(schema.allowProtocolRelative).toBe(true)
  })

  it.each([
    ['an invalid tag name', tag('My-Tag')],
    ['a dropped tag', tag('script')],
    [
      'a prototype key tag',
      { name: 'x', schema: { tags: JSON.parse('{"__proto__":{"kind":"inline","attrs":[]}}') } },
    ],
    ['a constructor tag', tag('constructor')],
    ['an event handler attribute', tag('x', { attrs: ['onclick'] })],
    ['a style attribute', tag('x', { attrs: ['style'] })],
    ['a srcdoc url attribute', tag('x', { urlAttrs: ['srcdoc'] })],
    ['a formaction fixed attribute', tag('x', { fixedAttrs: { formaction: 'x' } })],
    ['a prototype attribute', tag('x', { attrs: ['prototype'] })],
    ['a __proto__ attribute', tag('x', { attrs: ['__proto__'] })],
    ['a toString attribute', tag('x', { attrs: ['toString'] })],
    ['a rename to a dropped tag', { name: 'x', schema: { rename: { p: 'iframe' } } }],
    ['a rename from a dropped tag', { name: 'x', schema: { rename: { script: 'p' } } }],
  ])('rejects %s', (_name, module) => {
    expect(() => createSchema([module as Module])).toThrow(TypeError)
  })
})

describe('safeUrl', () => {
  it.each([
    ['https://a.example/x?y#z', 'https://a.example/x?y#z'],
    ['HTTP://A.EXAMPLE', 'HTTP://A.EXAMPLE'],
    ['mailto:a@b.example', 'mailto:a@b.example'],
    ['tel:+123', 'tel:+123'],
    ['/relative/path', '/relative/path'],
    ['relative', 'relative'],
    ['#fragment', '#fragment'],
    ['?query', '?query'],
    ['  https://a.example/a b \n', 'https://a.example/a b'],
    ['https://a.\texample/', 'https://a.example/'],
  ])('allows %j', (input, output) => {
    expect(safeUrl(input)).toBe(output)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'jav\nascript:alert(1)',
    '\u0001javascript:alert(1)',
    ' javascript:alert(1)',
    'java\u0000script:alert(1)',
    'javascript\u0085:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '\\/evil.example',
    ' //evil.example',
  ])('rejects %j', (input) => {
    expect(safeUrl(input)).toBeNull()
  })

  it('follows the schema policy', () => {
    const schema = createSchema([], { urlSchemes: ['https'], allowProtocolRelative: true })
    expect(safeUrl('http://a.example', schema)).toBeNull()
    expect(safeUrl('//cdn.example/x', schema)).toBe('//cdn.example/x')
  })
})

describe('sanitize', () => {
  const schema = createSchema([
    link,
    tag('strong'),
    tag('img', { kind: 'void', attrs: ['src'], urlAttrs: ['src'] }),
  ])

  it('keeps allowed tags and attributes only', () => {
    expect(
      sanitize(
        '<p id="x" class="y">a<a href="/x" title="t" target="_blank" rel="opener">b</a></p>',
        { schema },
      ),
    ).toBe('<p>a<a href="/x" title="t" rel="noopener noreferrer nofollow">b</a></p>')
  })

  it('drops unsafe URLs but keeps the element', () => {
    expect(
      sanitize('<a href="javascript:alert(1)">x</a><img src="data:text/html,x">', { schema }),
    ).toBe('<a rel="noopener noreferrer nofollow">x</a><img>')
  })

  it('unwraps unknown elements and renames by schema', () => {
    expect(sanitize('<span><div>a</div><custom-el>b</custom-el></span>')).toBe('<p>a</p>b')
  })

  it('removes dropped elements together with their content', () => {
    expect(sanitize('a<script>alert(1)</script><style>*{}</style><textarea>t</textarea>b')).toBe(
      'ab',
    )
  })

  it('removes comments and empty text', () => {
    expect(sanitize('a<!-- c -->b')).toBe('ab')
  })

  it('keeps void elements empty', () => {
    expect(sanitize('a<br>b')).toBe('a<br>b')
  })

  it('unwraps blocks in inline context so output is parse-stable', () => {
    expect(sanitize('<div><div>a</div></div><strong><div>b</div></strong>', { schema })).toBe(
      '<p>a</p><strong>b</strong>',
    )
  })

  it('escapes text', () => {
    expect(sanitize('<p>&lt;img src=x onerror=alert(1)&gt; &amp; "</p>')).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &amp; "</p>',
    )
  })

  it('accepts nodes and walks them without parsing', () => {
    const element = document.createElement('div')
    element.innerHTML = '<p onclick="x()">a</p>'
    element.append(document.createTextNode(''))
    const fragment = sanitizeToFragment(element)
    expect(fragment.childNodes).toHaveLength(1)
    expect(fragment.childNodes[0]?.textContent).toBe('a')
  })

  it('applies an external sanitizer before its own pass', () => {
    const sanitizer = (html: string): DocumentFragment => {
      const template = document.createElement('template')
      template.innerHTML = `${html}<img src=x onerror=alert(1)>`
      return template.content
    }
    expect(sanitize('<p>a</p>', { sanitizer })).toBe('<p>a</p>')
  })

  it('works with another document implementation', () => {
    const other = document.implementation.createHTMLDocument('')
    const fragment = sanitizeToFragment('<p>a</p>', { document: other })
    expect(fragment.ownerDocument).toBe(other)
    expect(sanitize('<p>a</p>', { document: other })).toBe('<p>a</p>')
  })

  it('flattens nested equal marks', () => {
    expect(sanitize('<strong>a<span>b<strong>c</strong></span></strong>', { schema })).toBe(
      '<strong>abc</strong>',
    )
  })

  it('caps the depth of the rebuilt tree', () => {
    const lists = createSchema([tag('ul', { kind: 'list' }), tag('li', { kind: 'item' })])
    const deep = `${'<ul><li>'.repeat(150)}x${'</li></ul>'.repeat(150)}`
    const output = sanitizeToFragment(deep, { schema: lists })
    let depth = 0
    for (let node = output.firstChild; node?.firstChild; node = node.firstChild) {
      depth++
    }
    expect(depth).toBe(128)
    expect(output.textContent).toBe('x')
  })
})
