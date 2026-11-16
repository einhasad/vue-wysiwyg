import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import type { Module, Schema } from '../../core/types.js'
import { normalizeHTML } from '../../normalize/index.js'
import { createSchema, safeUrl, sanitize, sanitizeToFragment } from '../../sanitize/index.js'
import { dispatch, mountEditor, select, transfer } from '../core/helpers.js'

const content: Module = {
  name: 'content',
  schema: {
    tags: {
      strong: { kind: 'inline', attrs: [] },
      em: { kind: 'inline', attrs: [] },
      h2: { kind: 'block', attrs: [] },
      ul: { kind: 'list', attrs: [] },
      ol: { kind: 'list', attrs: ['start'] },
      li: { kind: 'item', attrs: [] },
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
const schema = createSchema([content])

const expectAllowListed = (html: string, target: Schema = schema): void => {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ALL)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    expect([1, 3]).toContain(node.nodeType)
    if (node.nodeType !== 1) {
      continue
    }
    const element = node as Element
    const rule = target.tags.get(element.localName)
    expect(rule, `<${element.localName}> is not allow-listed in ${html}`).toBeDefined()
    expect(element.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    for (const { name, value } of element.attributes) {
      expect([...(rule?.attrs ?? []), ...Object.keys(rule?.fixedAttrs ?? {})]).toContain(name)
      if (rule?.urlAttrs?.includes(name)) {
        expect(safeUrl(value, target)).toBe(value)
      }
    }
  }
}

const throughEveryEntryPoint = (payload: string): string[] => {
  const outputs = [sanitize(payload, { schema }), normalizeHTML(payload, schema)]
  const editor = mountEditor({ modules: [content], content: payload })
  outputs.push(editor.getHTML())
  editor.setHTML(payload)
  outputs.push(editor.getHTML(), editor.root.innerHTML)
  const restored = mountEditor({ modules: [content] })
  restored.setHTML(editor.getHTML())
  outputs.push(restored.getHTML())
  for (const event of ['paste', 'drop']) {
    const target = mountEditor({ modules: [content], content: '<p>x</p>' })
    select(target.root.firstChild?.firstChild as Node, 1)
    const data = transfer({ 'text/html': payload })
    dispatch(target.root, event, { clipboardData: data, dataTransfer: data })
    outputs.push(target.getHTML(), target.root.innerHTML)
  }
  return outputs
}

const expectSafe = (payload: string): void => {
  for (const output of throughEveryEntryPoint(payload)) {
    expectAllowListed(output)
    expect(output).not.toMatch(
      /onerror|onclick|onmouseover|javascript:|vbscript:|<script|<svg|<math|srcdoc/i,
    )
  }
  const once = sanitize(payload, { schema })
  expect(sanitize(once, { schema })).toBe(once)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('mandatory XSS vectors', () => {
  it.each([
    ['1 img onerror (quill CVE-2021-3163)', '<img src=x onerror=alert(1)>'],
    ['1 img onerror inside text', '<p>a<img src="x" onerror="alert(1)" alt="b">c</p>'],
  ])('%s', (_name, payload) => {
    expectSafe(payload)
  })

  it.each([
    'JaVaScRiPt:alert(1)',
    'java&#x09;script:alert(1)',
    'jav&#x0A;ascript:alert(1)',
    '&#x01;javascript:alert(1)',
    '\u0001javascript:alert(1)',
    ' javascript:alert(1)',
    '&#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    '//evil.example',
    '/\\evil.example',
  ])('2 href and src variant %j (Tiptap CVE-2025-14284, Trix, Jodit)', (url) => {
    expectSafe(`<a href="${url}">x</a><img src="${url}">`)
    expect(sanitize(`<a href="${url}">x</a>`, { schema })).toBe(
      '<a rel="noopener noreferrer nofollow">x</a>',
    )
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><animate attributeName=href values=javascript:alert(1) /><a>x</a></svg>',
  ])('3 SVG %s', (payload) => {
    expectSafe(payload)
  })

  it.each([
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
    '<svg><foreignObject><p><svg><style><img src=x onerror=alert(1)></style></svg></p></foreignObject></svg>',
  ])('4 mXSS %s', (payload) => {
    expectSafe(payload)
  })

  it.each([
    '<textarea></textarea/><img src=x onerror=alert(1)>',
    '<xmp><img src=x onerror=alert(1)></xmp>',
    '<noembed><img src=x onerror=alert(1)></noembed>',
    '<title><img src=x onerror=alert(1)></title>',
    '<style><img src=x onerror=alert(1)></style>',
    '<plaintext><img src=x onerror=alert(1)>',
  ])('5 raw text %s', (payload) => {
    expectSafe(payload)
  })

  it.each([
    '<template><img src=x onerror=alert(1)></template>',
    '<select><selectedcontent><img src=x onerror=alert(1)></selectedcontent></select>',
  ])('6 template and selectedcontent %s', (payload) => {
    expectSafe(payload)
  })

  it.each([
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="javascript:alert(1)">',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<base href="javascript:alert(1)//">',
    '<link rel="import" href="javascript:alert(1)">',
    '<form action="javascript:alert(1)"><input type=submit></form>',
    '<button formaction="javascript:alert(1)">x</button>',
  ])('7 embedding elements %s', (payload) => {
    expectSafe(payload)
  })

  it('7 keeps no content of dropped embedding elements', () => {
    expect(sanitize('<button>label</button><select><option>o</option></select>a', { schema })).toBe(
      'a',
    )
  })

  it.each([
    '<p onclick="alert(1)">x</p>',
    '<strong onmouseover="alert(1)">x</strong>',
    '<p style="background:url(javascript:alert(1))">x</p>',
    '<p class="x" id="y" data-x="z">x</p>',
  ])('8 disallowed attributes %s', (payload) => {
    expectSafe(payload)
    expect(sanitize(payload, { schema })).toMatch(/^<(p|strong)>x<\/(p|strong)>$/)
  })

  it.each([
    '<p data-wysiwyg-bogus="1" data-mce-bogus="1" data-mce-href="javascript:alert(1)">x</p>',
    '<p><!--<img src=x onerror=alert(1)>-->x</p>',
    '<p><!--><img src=x onerror=alert(1)>--></p>',
  ])('9 internal markers and comments %s', (payload) => {
    expectSafe(payload)
    expect(sanitize(payload, { schema })).not.toContain('data-')
    expect(sanitize(payload, { schema })).not.toContain('<!--')
  })

  it.each([
    '<__proto__>x</__proto__>',
    '<p __proto__="x" constructor="y" prototype="z">x</p>',
    '<constructor>x',
  ])('10 prototype keys %s', (payload) => {
    expectSafe(payload)
    expect(Object.prototype).not.toHaveProperty('x')
  })

  it('10 rejects schema contributions with prototype keys or handlers', () => {
    for (const tags of [
      '{"__proto__":{"kind":"inline","attrs":[]}}',
      '{"toString":{"kind":"inline","attrs":[]}}',
    ]) {
      expect(() => createSchema([{ name: 'evil', schema: { tags: JSON.parse(tags) } }])).toThrow(
        TypeError,
      )
    }
    expect(() =>
      createSchema([
        { name: 'evil', schema: { tags: { p: { kind: 'block', attrs: ['onclick'] } } } },
      ]),
    ).toThrow(TypeError)
  })

  it('10 a later module adding the same tag keeps the URL policy and fixed attributes', () => {
    const plain: Module = {
      name: 'plain',
      schema: {
        tags: { a: { kind: 'inline', attrs: ['href', 'target'], fixedAttrs: { rel: 'x' } } },
      },
    }
    for (const [modules, rel] of [
      [[content, plain], 'noopener noreferrer nofollow'],
      [[plain, content], 'x'],
    ] as const) {
      const merged = createSchema(modules)
      const container = document.createElement('div')
      container.innerHTML = sanitize(
        '<p><a href="javascript:alert(1)" title="t" target="_blank">x</a></p>',
        { schema: merged },
      )
      const link = container.querySelector('a') as HTMLAnchorElement
      expect(link.hasAttribute('href')).toBe(false)
      expect([link.title, link.target, link.rel]).toEqual(['t', '_blank', rel])
      expect(sanitize('<a href="/ok">x</a>', { schema: merged })).toContain('href="/ok"')
    }
  })

  it.each(['href', 'src', 'action'])(
    '10 attribute %s is URL-checked without urlAttrs',
    (attribute) => {
      const loose = createSchema([
        {
          name: 'loose',
          schema: { tags: { span: { kind: 'inline', attrs: [attribute, 'title'] } } },
        },
      ])
      expect(
        sanitize(`<span ${attribute}="javascript:alert(1)" title="javascript:t">x</span>`, {
          schema: loose,
        }),
      ).toBe('<span title="javascript:t">x</span>')
      expect(sanitize(`<span ${attribute}="/ok">x</span>`, { schema: loose })).toBe(
        `<span ${attribute}="/ok">x</span>`,
      )
    },
  )

  it.each(['srcset', 'formaction', 'xlink:href'])('10 %s can not be allow-listed', (attribute) => {
    expect(() =>
      createSchema([
        { name: 'img', schema: { tags: { img: { kind: 'void', attrs: [attribute] } } } },
      ]),
    ).toThrow(TypeError)
  })

  it.each(['javascript', 'JavaScript', 'vbscript', 'data'])(
    '2 urlSchemes can not enable %s',
    (scheme) => {
      const permissive = createSchema([content], { urlSchemes: ['https', scheme] })
      expect(safeUrl(`${scheme}:alert(1)`, permissive)).toBeNull()
      expect(permissive.urlSchemes).toEqual(['https'])
      expect(sanitize(`<a href="${scheme}:alert(1)">x</a>`, { schema: permissive })).toBe(
        '<a rel="noopener noreferrer nofollow">x</a>',
      )
      const editor = mountEditor({
        modules: [content],
        urlSchemes: [scheme],
        content: `<p><a href="${scheme}:x">x</a></p>`,
      })
      expect(editor.root.querySelector('a')?.hasAttribute('href')).toBe(false)
    },
  )

  it.each([
    '<form><input name=childNodes><input name=attributes><input name=localName><input name=nodeType>x</form>y',
    '<img name=getAttribute><img name=body><img name=createElement>z',
    '<form id=x><input name=namespaceURI><img src=x onerror=alert(1)></form>',
  ])('11 DOM clobbering %s', (payload) => {
    expectSafe(payload)
  })

  it('12 survives 100k nested elements within the depth cap', () => {
    let root: unknown = { nodeType: 3, data: 'x', childNodes: [] }
    for (let index = 0; index < 100_000; index++) {
      root = {
        nodeType: 1,
        localName: 'strong',
        namespaceURI: 'http://www.w3.org/1999/xhtml',
        childNodes: [root],
        getAttribute: () => null,
      }
    }
    for (const fragment of [
      sanitizeToFragment({ childNodes: [root] } as unknown as Node, { schema }),
      sanitizeToFragment(`${'<strong>'.repeat(3000)}x${'</strong>'.repeat(3000)}`, { schema }),
    ]) {
      let depth = 0
      for (let node = fragment.firstChild; node?.firstChild; node = node.firstChild) {
        depth++
      }
      expect(depth).toBeLessThanOrEqual(128)
      expect(fragment.textContent).toBe('x')
    }
  })

  it('14 paste keeps text/plain markup as text', () => {
    const editor = mountEditor({ modules: [content], content: '<p>x</p>' })
    select(editor.root.firstChild?.firstChild as Node, 1)
    dispatch(editor.root, 'paste', {
      clipboardData: transfer({
        'text/plain': '<script>alert(1)</script><img src=x onerror=alert(1)>',
      }),
    })
    expect(editor.getHTML()).toBe(
      '<p>x&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p>',
    )
    expect(editor.root.querySelector('script,img')).toBeNull()
  })

  it('14 paste ignores a javascript text/uri-list in core', () => {
    const editor = mountEditor({ modules: [content], content: '<p>x</p>' })
    select(editor.root.firstChild?.firstChild as Node, 1)
    dispatch(editor.root, 'paste', {
      clipboardData: transfer({ 'text/uri-list': 'javascript:alert(1)' }),
    })
    expect(editor.getHTML()).toBe('<p>x</p>')
  })

  it('15 fuzz: sanitize is idempotent and its output is always allow-listed', () => {
    const tagNames = [
      'p',
      'div',
      'b',
      'strong',
      'i',
      'em',
      'a',
      'img',
      'ul',
      'ol',
      'li',
      'h2',
      'span',
      'script',
      'svg',
      'math',
      'style',
      'textarea',
      'form',
      'table',
      'br',
      'noscript',
      'template',
      'select',
    ]
    const attributes = [
      'href',
      'src',
      'title',
      'onclick',
      'style',
      'alt',
      'start',
      'name',
      'xlink:href',
    ]
    const values = [
      'javascript:alert(1)',
      'https://a.example',
      '//evil',
      'x',
      '"><img src=x onerror=alert(1)>',
      ' java\tscript:x',
    ]
    const attribute = fc
      .tuple(fc.constantFrom(...attributes), fc.constantFrom(...values))
      .map(([name, value]) => ` ${name}="${value.replaceAll('"', '&quot;')}"`)
    const token = fc.oneof(
      fc
        .tuple(fc.constantFrom(...tagNames), fc.array(attribute, { maxLength: 2 }))
        .map(([name, attrs]) => `<${name}${attrs.join('')}>`),
      fc.constantFrom(...tagNames).map((name) => `</${name}>`),
      fc.constantFrom('text', ' ', '\n', '&lt;', '<!--c-->', '&nbsp;', '<', '>'),
    )
    fc.assert(
      fc.property(
        fc.array(token, { maxLength: 30 }).map((tokens) => tokens.join('')),
        (html) => {
          const once = sanitize(html, { schema })
          expectAllowListed(once)
          expect(sanitize(once, { schema })).toBe(once)
          const normalized = normalizeHTML(html, schema)
          expectAllowListed(normalized)
          expect(normalizeHTML(normalized, schema)).toBe(normalized)
        },
      ),
      { numRuns: 1000 },
    )
  })
})
