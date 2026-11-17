import { describe, expect, it } from 'vitest'
import { htmlToMd, mdToHtml } from '../../markdown/index.js'
import { safeUrl, sanitize } from '../../sanitize/index.js'
import { ADVERSARIAL } from './inputs.js'

const REPEATS = 50_000
const URL_SPACES = 100_000
const MAX_TYPICAL_FACTOR = 30
const MAX_GROWTH = 3
const TIMER_NOISE_MS = 2

const MEASURE_ROUNDS = 3

const TYPICAL_MARKDOWN =
  'Some **bold** and *italic* text with a [link](https://example.com) and `code`.\n\n- item\n1. item\n\n# Title\n\n'
const TYPICAL_HTML =
  '<p>Some <strong>bold</strong> and <em>italic</em> text with a <a href="https://example.com">link</a>.</p><ul><li>item</li></ul><h2>Title</h2>'
const TYPICAL_URL = 'https://example.com/a-path/'

const typical = (unit: string, length: number): string =>
  unit.repeat(Math.ceil(length / unit.length)).slice(0, length)

const typicalHTML = (length: number): string =>
  TYPICAL_HTML.repeat(Math.ceil(length / TYPICAL_HTML.length))

const elapsed = (run: () => unknown): number => {
  run()
  let best = Infinity
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

const expectLinear = (
  parse: (input: string) => string,
  half: string,
  full: string,
  typicalOfHalfLength: string,
): void => {
  let halfTime = Infinity
  let typicalTime = Infinity
  let growth = Infinity
  for (let round = 0; round < MEASURE_ROUNDS; round++) {
    const roundHalf = elapsed(() => parse(half))
    halfTime = Math.min(halfTime, roundHalf)
    typicalTime = Math.min(
      typicalTime,
      elapsed(() => parse(typicalOfHalfLength)),
    )
    growth = Math.min(growth, elapsed(() => parse(full)) / Math.max(roundHalf, TIMER_NOISE_MS))
    if (growth < MAX_GROWTH && halfTime < MAX_TYPICAL_FACTOR * typicalTime) {
      break
    }
  }
  expect(halfTime).toBeLessThan(MAX_TYPICAL_FACTOR * Math.max(typicalTime, TIMER_NOISE_MS))
  expect(growth).toBeLessThan(MAX_GROWTH)
}

describe('markdown parsing stays linear (ReDoS)', () => {
  it.each(ADVERSARIAL)(
    '%j: 50k repetitions within 30x of typical Markdown of the same length, linear growth',
    (_name, build) => {
      const half = build(REPEATS)
      expectLinear(mdToHtml, half, build(REPEATS * 2), typical(TYPICAL_MARKDOWN, half.length))
    },
  )

  it.each([
    ['paragraphs', (count: number) => '<p>a <em>b</em> * _ [</p>'.repeat(count / 25)],
    ['list items', (count: number) => `<ul>${'<li>- a<br>1. b</li>'.repeat(count / 20)}</ul>`],
    ['whitespace', (count: number) => `<p>${' \n\t'.repeat(count / 3)}x</p>`],
  ])(
    'htmlToMd %s: within 30x of typical HTML of the same length, linear growth',
    (_name, build) => {
      const half = build(REPEATS)
      expectLinear(htmlToMd, half, build(REPEATS * 2), typicalHTML(half.length))
    },
  )

  it('htmlToMd at the browser parser nesting cap (512) stays within 30x of typical HTML', () => {
    const nested = `${'<strong><em>'.repeat(256)}x`
    const typicalTime = elapsed(() => htmlToMd(typicalHTML(nested.length)))
    expect(elapsed(() => htmlToMd(nested))).toBeLessThan(
      MAX_TYPICAL_FACTOR * Math.max(typicalTime, TIMER_NOISE_MS),
    )
  })

  it.each([
    ['safeUrl', (input: string) => String(safeUrl(input))],
    ['mdToHtml pointy link', (input: string) => mdToHtml(`[x](<${input}>)`)],
    ['sanitize href', (input: string) => sanitize(`<p><a href="${input}">x</a></p>`)],
    ['sanitize text', (input: string) => sanitize(`<p>${input.replaceAll(' ', ' \n')}</p>`)],
  ])(
    '%s with an interior whitespace run: 100k within 30x of a typical URL, linear growth',
    (_name, parse) => {
      const spaced = (count: number): string => `a${' '.repeat(count)}b`
      const half = spaced(URL_SPACES)
      expectLinear(parse, half, spaced(URL_SPACES * 2), typical(TYPICAL_URL, half.length))
    },
  )
})
