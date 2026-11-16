import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { htmlToMd, mdToHtml } from '../../markdown/index.js'
import { normalizeHTML } from '../../normalize/index.js'
import { expectSafeMarkup, schema } from './schema.js'

const FIXTURES = ['inline', 'headings', 'lists', 'links', 'escapes']

const fixture = (name: string, extension: 'md' | 'html'): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', `${name}.${extension}`), 'utf8')

const normalized = (html: string): string => normalizeHTML(html, schema)

describe.each(FIXTURES)('golden fixture %s', (name) => {
  const markdown = fixture(name, 'md')
  const html = fixture(name, 'html')

  it('md -> html equals the fixture html', () => {
    expect(normalized(mdToHtml(markdown))).toBe(normalized(html))
  })

  it('md -> html output is allow-listed before any sanitizer runs', () => {
    expectSafeMarkup(mdToHtml(markdown))
  })

  it('html -> md -> html is stable', () => {
    expect(normalized(mdToHtml(htmlToMd(html)))).toBe(normalized(html))
  })

  it('md -> html -> md is idempotent after the first pass', () => {
    const once = htmlToMd(mdToHtml(markdown))
    expect(htmlToMd(mdToHtml(once))).toBe(once)
  })
})
