import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { htmlToMd, markdownFormat, mdToHtml } from '../../markdown/index.js'
import { normalizeHTML } from '../../normalize/index.js'
import { mountEditor } from '../core/helpers.js'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sanitize } from '../../sanitize/index.js'
import { ADVERSARIAL } from './inputs.js'
import { expectSafeMarkup, markdownTags, outputSchema, schema } from './schema.js'

const VECTORS = [
  '[x](javascript:alert(1))',
  '[x](JaVaScRiPt:alert(1))',
  '[x](<javascript:alert(1)>)',
  '[x](<java\tscript:alert(1)>)',
  '[x](<java\u000ascript:alert(1)>)',
  '[x](<\u0001javascript:alert(1)>)',
  '[x](< javascript:alert(1)>)',
  '[x](&#106;avascript:alert(1))',
  '[x](vbscript:msgbox(1))',
  '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](//evil.example)',
  '[x](/\\evil.example)',
  '[x](\\/evil.example)',
  '<javascript:alert(1)>',
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">x</a>',
  '[x](https://a "\\" onmouseover=alert(1)")',
  '[x](https://a" onmouseover="alert(1))',
  '[x"><img src=x onerror=alert(1)>](https://a)',
  '# <svg onload=alert(1)>',
  '- <iframe srcdoc="<script>alert(1)</script>">',
]

describe('markdown XSS vectors (group 13)', () => {
  it.each(VECTORS)('mdToHtml output is allow-listed: %j', (markdown) => {
    expectSafeMarkup(mdToHtml(markdown))
  })

  it.each(VECTORS)('editor with markdownFormat renders it safely: %j', (markdown) => {
    const editor = mountEditor({ modules: [markdownTags], format: markdownFormat })
    editor.setValue(markdown)
    expectSafeMarkup(editor.root.innerHTML, ['rel'])
    expect(editor.root.querySelector('img,script,svg,iframe,[onmouseover],[onerror]')).toBeNull()
    expectSafeMarkup(mdToHtml(editor.getValue()))
  })

  it('keeps an attribute breakout title out of the markup', () => {
    expect(mdToHtml('[x](https://a "\\" onmouseover=alert(1)")')).toBe(
      '<p><a href="https://a">x</a></p>',
    )
  })

  it('keeps raw html and entities as visible text', () => {
    const editor = mountEditor({ modules: [markdownTags], format: markdownFormat })
    editor.setValue('<img src=x onerror=alert(1)> &#106;')
    expect(editor.root.textContent).toBe('<img src=x onerror=alert(1)> &#106;')
  })

  it('fuzz: any markdown becomes allow-listed markup, and editor markdown output is a fixed point', () => {
    const piece = fc.constantFrom(
      '*',
      '**',
      '_',
      '__',
      '[',
      ']',
      '(',
      ')',
      '<',
      '>',
      '"',
      "'",
      '\\',
      '\n',
      '\n\n',
      '  \n',
      '# ',
      '- ',
      '1. ',
      '  ',
      'a',
      'b c',
      'javascript:',
      'https://x',
      '&',
      '`',
      '\0',
      '\t',
    )
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 40 }), (pieces) => {
        const html = mdToHtml(pieces.join(''))
        expectSafeMarkup(html)
        const markdown = htmlToMd(normalizeHTML(html, schema))
        expect(htmlToMd(normalizeHTML(mdToHtml(markdown), schema))).toBe(markdown)
      }),
      { numRuns: 1000 },
    )
  })

  const fixturesDir = resolve(import.meta.dirname, 'fixtures')
  const STABILITY_INPUTS: readonly (readonly [string, string])[] = [
    ...readdirSync(fixturesDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => [file, readFileSync(resolve(fixturesDir, file), 'utf8')] as const),
    ...VECTORS.map((vector) => [vector, vector] as const),
    ...ADVERSARIAL.map(([name, build]) => [name, build(300)] as const),
  ]

  it.each(STABILITY_INPUTS)('sanitize leaves mdToHtml output unchanged: %j', (_name, markdown) => {
    const html = mdToHtml(markdown)
    const template = document.createElement('template')
    template.innerHTML = html
    expect(sanitize(html, { schema: outputSchema })).toBe(template.innerHTML)
  })
})
