import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from '../../../core/editor.js'
import type { Editor, Module, Schema } from '../../../core/types.js'
import { bold } from '../../../modules/bold.js'
import { italic } from '../../../modules/italic.js'
import { link, LINK_REL } from '../../../modules/link.js'
import { cleanPastedHTML, paste } from '../../../modules/paste.js'
import { underline } from '../../../modules/underline.js'
import { safeUrl } from '../../../sanitize/index.js'
import { dispatch, keyDown, mountEditor, select, transfer } from '../../core/helpers.js'
import googleDocs from './fixtures/google-docs.html.txt?raw'
import wordMac from './fixtures/word-mac.html.txt?raw'
import wordWindows from './fixtures/word-windows.html.txt?raw'

const REL = `rel="${LINK_REL}"`

const listsSchema: Module = {
  name: 'lists-schema',
  schema: {
    tags: {
      h2: { kind: 'block', attrs: [] },
      ul: { kind: 'list', attrs: [] },
      ol: { kind: 'list', attrs: [] },
      li: { kind: 'item', attrs: [] },
    },
  },
}

const richModules = (): Module[] => [listsSchema, bold(), italic(), underline(), link(), paste()]

const editorAt = (modules: Module[], content = '<p>x</p>'): Editor => {
  const editor = mountEditor({ modules, content })
  select(editor.root.firstChild?.firstChild as Node, 1)
  return editor
}

const pasteInto = (editor: Editor, data: Readonly<Record<string, string>>): Event =>
  dispatch(editor.root, 'paste', { clipboardData: transfer(data) })

const pasted = (data: Readonly<Record<string, string>>, modules = richModules()): string => {
  const editor = editorAt(modules)
  pasteInto(editor, data)
  return editor.getHTML()
}

const expectAllowListed = (html: string, schema: Schema): void => {
  const template = document.createElement('template')
  template.innerHTML = html
  for (const element of template.content.querySelectorAll('*')) {
    const rule = schema.tags.get(element.localName)
    expect(rule, `<${element.localName}> in ${html}`).toBeDefined()
    for (const { name, value } of element.attributes) {
      expect([...(rule?.attrs ?? []), ...Object.keys(rule?.fixedAttrs ?? {})]).toContain(name)
      if (rule?.urlAttrs?.includes(name)) {
        expect(safeUrl(value, schema)).toBe(value)
      }
    }
  }
  expect(html).not.toMatch(
    /onerror|onclick|onmouseover|javascript:|vbscript:|data:|<script|style=/i,
  )
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('Word html', () => {
  it('converts Word for Windows lists, marks, o:p, conditional comments and styles', () => {
    expect(pasted({ 'text/html': wordWindows })).toBe(
      '<p>x</p>' +
        '<p>Intro with <strong>bold</strong>, <em>italic</em> and <strong><em>both</em></strong></p>' +
        '<ul><li>First bullet<ul><li>Nested bullet</li></ul></li><li>Second <strong>bullet</strong></li></ul>' +
        '<p>&nbsp;</p>' +
        '<ol><li>Step one</li><li>Step two</li></ol>' +
        `<p>Closing <strong>words</strong> <a href="https://example.com/doc" ${REL}>link</a></p>`,
    )
  })

  it('converts Word for Mac lists with comment-style conditionals and three levels', () => {
    expect(pasted({ 'text/html': wordMac })).toBe(
      '<p>x</p>' +
        '<ol><li>Alpha<ol><li>Roman<ul><li>Deep bullet</li></ul></li></ol></li><li>Beta</li></ol>' +
        '<p>After list</p>',
    )
  })

  it('keeps Word list paragraphs without markers when the schema has no lists', () => {
    expect(pasted({ 'text/html': wordMac }, [bold(), paste()])).toBe(
      '<p>x</p><p>Alpha</p><p>Roman</p><p>Deep bullet</p><p>Beta</p><p>After list</p>',
    )
  })

  it('starts a new list after a normal paragraph and fills a skipped level', () => {
    const item = (level: number, text: string): string =>
      `<p style="mso-list:l0 level${String(level)} lfo1"><span style="mso-list:Ignore">-</span>${text}</p>`
    const html = `${item(2, 'deep')}${item(1, 'top')}<p>between</p>\n${item(1, 'again')}`
    expect(cleanPastedHTML(html, mountEditor({ modules: [listsSchema] }))).toBe(
      '<ul><li><ul><li>deep</li></ul></li><li>top</li></ul><p>between</p> <ul><li>again</li></ul>',
    )
  })

  it('ignores mso-list values that are not list levels', () => {
    const html = '<p style="mso-list:none">a</p><h2 style="mso-list:l0 level1 lfo1">b</h2>'
    expect(cleanPastedHTML(html, mountEditor({ modules: [listsSchema] }))).toBe(
      '<p style="mso-list:none">a</p><h2 style="mso-list:l0 level1 lfo1">b</h2>',
    )
  })

  it('joins source line breaks of wrapped Word html into spaces', () => {
    expect(pasted({ 'text/html': '<p class=MsoNormal>one\r\n   two\n\n three</p>' })).toBe(
      '<p>x</p><p>one two three</p>',
    )
  })
})

describe('tables', () => {
  const excel =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><!--StartFragment-->' +
    '<table border=0 cellpadding=0 cellspacing=0 width=128 style="border-collapse:collapse">' +
    '<col width=64 span=2 style="width:48pt">' +
    '<tr height=20 style="height:15.0pt"><td height=20 class=xl65 style="mso-number-format:General">a1</td>' +
    '<td class=xl65>b1</td></tr>\r\n<tr><td>a2</td><td></td><td>c2</td></tr><!--EndFragment--></table></body></html>'

  const sheets =
    '<google-sheets-html-origin><table xmlns="http://www.w3.org/1999/xhtml" dir="ltr">' +
    '<colgroup><col width="100"></colgroup><tbody><tr style="height:21px">' +
    '<td style="font-weight:bold">Name</td><td>Qty</td></tr>' +
    '<tr><td>Bolt<br>M6</td><td>4</td></tr></tbody></table></google-sheets-html-origin>'

  it('turns Excel rows into paragraphs with tab separated cells, empty cells kept', () => {
    expect(pasted({ 'text/html': excel })).toBe('<p>x</p><p>a1\tb1</p><p>a2\t\tc2</p>')
  })

  it('turns Google Sheets rows into paragraphs and keeps the cell content', () => {
    expect(pasted({ 'text/html': sheets })).toBe('<p>x</p><p>Name\tQty</p><p>Bolt<br>M6\t4</p>')
  })

  it('keeps the text around a table in order', () => {
    expect(
      pasted({
        'text/html':
          '<p>before</p><table><thead><tr><th>h1</th><th>h2</th></tr></thead></table><p>after</p>',
      }),
    ).toBe('<p>x</p><p>before</p><p>h1\th2</p><p>after</p>')
  })
})

describe('Google Docs html', () => {
  it('unwraps the docs-internal-guid b and maps span weights and styles to marks', () => {
    expect(pasted({ 'text/html': googleDocs })).toBe(
      '<p>x</p><h2>Heading</h2>' +
        '<p>Plain <strong>bold</strong> <em>italic</em> <u><em><strong>all</strong></em></u> ' +
        `<a href="https://docs.example.com/x" ${REL}>site</a></p>` +
        '<ul><li>One<ul><li><strong>Nested</strong></li></ul></li><li>Two</li></ul>' +
        '<p><br></p><p>End</p>',
    )
  })

  it('keeps headings when the schema has them and drops marks the schema lacks', () => {
    expect(pasted({ 'text/html': googleDocs }, [listsSchema, paste()])).toBe(
      '<p>x</p><h2>Heading</h2><p>Plain bold italic all site</p>' +
        '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><p><br></p><p>End</p>',
    )
  })

  it.each([
    ['<b id="docs-internal-guid-1">a</b>', 'a'],
    ['<b style="font-weight:normal">a</b>', 'a'],
    ['<strong style="font-weight:400">a</strong>', 'a'],
    [
      '<b style="mso-bidi-font-weight:normal">a</b>',
      '<b style="mso-bidi-font-weight:normal">a</b>',
    ],
    ['<b style="font-weight:700">a</b>', '<b style="font-weight:700">a</b>'],
    [
      '<span style="font-weight:bold">a</span>',
      '<span style="font-weight:bold"><strong>a</strong></span>',
    ],
    [
      '<span style="font-weight:bolder">a</span>',
      '<span style="font-weight:bolder"><strong>a</strong></span>',
    ],
    [
      '<span style="font-weight:600">a</span>',
      '<span style="font-weight:600"><strong>a</strong></span>',
    ],
    ['<span style="font-weight:500">a</span>', '<span style="font-weight:500">a</span>'],
    [
      '<span style="font-style:italic">a</span>',
      '<span style="font-style:italic"><em>a</em></span>',
    ],
    ['<span style="font-style:oblique">a</span>', '<span style="font-style:oblique">a</span>'],
    [
      '<span style="text-decoration:underline">a</span>',
      '<span style="text-decoration:underline"><u>a</u></span>',
    ],
    [
      '<a href="/x"><span style="text-decoration:underline">a</span></a>',
      '<a href="/x"><span style="text-decoration:underline">a</span></a>',
    ],
    ['<p>a</p><br class="Apple-interchange-newline">', '<p>a</p>'],
  ])('cleans %s', (html, expected) => {
    expect(cleanPastedHTML(html, mountEditor())).toBe(expected)
  })
})

describe('plain text', () => {
  it('turns blank-line separated text into escaped paragraphs with line breaks', () => {
    expect(
      pasted({ 'text/plain': '\n\nfirst <b>\r\nline\r\n\r\nsecond & "third"\n \t\n\nlast\n\n' }),
    ).toBe('<p>x</p><p>first &lt;b&gt;<br>line</p><p>second &amp; "third"</p><p>last</p>')
  })

  it('leaves text without blank lines to the core line-break paste', () => {
    expect(pasted({ 'text/plain': 'a\nb' })).toBe('<p>xa<br>b</p>')
  })

  it('pastes only plain text after Mod-Shift-v and resets afterwards', () => {
    vi.useFakeTimers()
    const editor = editorAt(richModules())
    expect(keyDown(editor, { key: 'V', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(
      false,
    )
    pasteInto(editor, { 'text/html': '<p><strong>rich</strong></p>', 'text/plain': 'rich' })
    expect(editor.getHTML()).toBe('<p>xrich</p>')
    keyDown(editor, { key: 'v', metaKey: true, shiftKey: true })
    pasteInto(editor, { 'text/html': '<p><strong>rich</strong></p>', 'text/plain': 'a\n\nb' })
    expect(editor.getHTML()).toBe('<p>xrich</p><p>a</p><p>b</p>')
    vi.runAllTimers()
    pasteInto(editor, { 'text/html': '<strong>bold</strong>', 'text/plain': 'bold' })
    expect(editor.getHTML()).toBe('<p>xrich</p><p>a</p><p>b<strong>bold</strong></p>')
  })

  it('keeps plain paste mode per editor when the module instance is shared', () => {
    vi.useFakeTimers()
    const shared = richModules()
    const first = editorAt(shared)
    const element = document.body.appendChild(document.createElement('div'))
    const second = createEditor({ element, content: '<p>y</p>', modules: shared })
    keyDown(first, { key: 'v', ctrlKey: true, shiftKey: true })
    select(second.root.firstChild?.firstChild as Node, 1)
    pasteInto(second, { 'text/html': '<strong>b</strong>', 'text/plain': 'b' })
    expect(second.getHTML()).toBe('<p>y<strong>b</strong></p>')
  })

  it('keeps an unknown Mod-Shift key to the browser', () => {
    vi.useFakeTimers()
    const editor = editorAt(richModules())
    keyDown(editor, { key: 'x', ctrlKey: true, shiftKey: true })
    pasteInto(editor, { 'text/html': '<strong>b</strong>', 'text/plain': 'b' })
    expect(editor.getHTML()).toBe('<p>x<strong>b</strong></p>')
  })
})

describe('text/uri-list', () => {
  it('pastes the first url as a link when the link module is present', () => {
    expect(
      pasted({
        'text/uri-list': '# comment\r\nhttps://a.example/?q=1&r=2\r\nhttps://b.example',
        'text/plain': 'https://a.example/?q=1&r=2',
      }),
    ).toBe(
      `<p>x<a href="https://a.example/?q=1&amp;r=2" ${REL}>https://a.example/?q=1&amp;r=2</a></p>`,
    )
  })

  it('escapes an attribute breakout in the url', () => {
    const editor = editorAt(richModules())
    pasteInto(editor, { 'text/uri-list': 'https://a.example/"onmouseover="alert(1)' })
    expect(editor.getHTML()).toBe(
      `<p>x<a href="https://a.example/&quot;onmouseover=&quot;alert(1)" ${REL}>https://a.example/"onmouseover="alert(1)</a></p>`,
    )
    expect(editor.root.querySelector('a')?.getAttributeNames()).toEqual(['href', 'rel'])
  })

  it('prefers text/html over the uri list', () => {
    expect(pasted({ 'text/html': '<em>title</em>', 'text/uri-list': 'https://a.example' })).toBe(
      '<p>x<em>title</em></p>',
    )
  })

  it('pastes the plain text without the link module', () => {
    expect(
      pasted({ 'text/uri-list': 'https://a.example', 'text/plain': 'https://a.example' }, [
        bold(),
        paste(),
      ]),
    ).toBe('<p>xhttps://a.example</p>')
  })

  it('turns a dropped uri list into a link', () => {
    const editor = editorAt(richModules())
    const data = transfer({ 'text/uri-list': 'https://a.example' })
    dispatch(editor.root, 'drop', { dataTransfer: data, clientX: 0, clientY: 0 })
    expect(editor.getHTML()).toBe(
      `<p>x<a href="https://a.example" ${REL}>https://a.example</a></p>`,
    )
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    '//evil.example',
    '/\\evil.example',
  ])('14 rejects a %j uri list and falls back to the text (security vector group 14)', (url) => {
    const editor = editorAt(richModules())
    pasteInto(editor, { 'text/uri-list': `# x\n${url}`, 'text/plain': 'fallback' })
    expect(editor.getHTML()).toBe('<p>xfallback</p>')
    expect(editor.root.querySelector('a')).toBeNull()
    const empty = editorAt(richModules())
    pasteInto(empty, { 'text/uri-list': url })
    expect(empty.getHTML()).toBe('<p>x</p>')
  })
})

describe('paste module security (vector group 14)', () => {
  it.each([
    '<img src=x onerror=alert(1)>',
    '<b id="docs-internal-guid-1"><p><span style="font-weight:700" onclick="alert(1)">x</span><img src=x onerror=alert(1)></p></b>',
    '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span><a href="javascript:alert(1)">x</a><svg><script>alert(1)</script></svg></p>',
    '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·</span><img src=x onerror=alert(1)></p><p style="mso-list:l0 level9 lfo1">deep</p>',
    '<span style="font-style:italic"><a href="java&#x09;script:alert(1)" style="background:url(javascript:alert(1))">x</a></span>',
    '<span style="text-decoration:underline"><iframe srcdoc="<script>alert(1)</script>"></iframe></span>',
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    '<![if !supportLists]><img src=x onerror=alert(1)><![endif]><!--[if gte mso 9]><img src=x onerror=alert(1)><![endif]-->',
    '<template><img src=x onerror=alert(1)></template><form><input name=childNodes></form>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a><a href="vbscript:x">y</a>',
    '<p data-wysiwyg-x="1" data-mce-src="javascript:alert(1)" class="x" id="y">z</p>',
    '<__proto__>a</__proto__><p __proto__=x constructor=y>b</p>',
  ])('keeps html %s allow-listed after the paste transforms', (payload) => {
    for (const event of ['paste', 'drop']) {
      const editor = editorAt(richModules())
      const data = transfer({ 'text/html': payload })
      dispatch(editor.root, event, { clipboardData: data, dataTransfer: data })
      expectAllowListed(editor.getHTML(), editor.schema)
      expectAllowListed(editor.root.innerHTML, editor.schema)
    }
  })

  it('keeps text/plain markup as text in paragraphs', () => {
    const editor = editorAt(richModules())
    pasteInto(editor, { 'text/plain': '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>' })
    expect(editor.root.querySelector('script,img')).toBeNull()
    expect(editor.getHTML()).toBe(
      '<p>x</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>&lt;img src=x onerror=alert(1)&gt;</p>',
    )
  })
})

describe('paste module lifecycle', () => {
  it('ignores transfer events without data and readonly editors', () => {
    const editor = editorAt(richModules())
    expect(() => dispatch(editor.root, 'paste', { clipboardData: null })).not.toThrow()
    editor.setReadonly(true)
    pasteInto(editor, { 'text/uri-list': 'https://a.example' })
    expect(editor.getHTML()).toBe('<p>x</p>')
  })

  it('stops overriding transfer data after destroy', () => {
    const editor = editorAt(richModules())
    editor.destroy()
    const data = transfer({ 'text/uri-list': 'https://a.example' })
    const event = dispatch(editor.root, 'paste', { clipboardData: data })
    expect((event as ClipboardEvent).clipboardData).toBe(data)
  })
})
