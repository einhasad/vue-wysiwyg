import { describe, expect, it } from 'vitest'
import { cleanPastedHTML } from '../../../modules/paste.js'
import { mountEditor } from '../../core/helpers.js'

const RUN = 100_000
const MAX_GROWTH = 3
const ROUNDS = 3
const TIMER_NOISE_MS = 2

const fastest = (run: () => unknown): number => {
  run()
  let best = Infinity
  for (let attempt = 0; attempt < ROUNDS; attempt++) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

describe('paste html cleaning stays linear (ReDoS)', () => {
  it.each([
    ['spaces', ' '],
    ['tabs and carriage returns', '\t\r'],
    ['spaces before a final newline', ' '],
  ])('a 100k run of %s: doubling the input less than triples the time', (name, unit) => {
    const editor = mountEditor()
    const tail = name.endsWith('newline') ? '\n' : ''
    const build = (count: number): string => `<p>a${unit.repeat(count / unit.length)}${tail}b</p>`
    const half = build(RUN)
    const full = build(RUN * 2)
    let growth = Infinity
    for (let round = 0; round < ROUNDS && growth >= MAX_GROWTH; round++) {
      const halfTime = fastest(() => cleanPastedHTML(half, editor))
      growth = Math.min(
        growth,
        fastest(() => cleanPastedHTML(full, editor)) / Math.max(halfTime, TIMER_NOISE_MS),
      )
    }
    expect(growth).toBeLessThan(MAX_GROWTH)
  })

  it('keeps whitespace runs without a newline and joins runs with one', () => {
    const editor = mountEditor()
    expect(cleanPastedHTML('<p>a \t b\r\n \t c</p>\n<p>d</p>', editor)).toBe(
      '<p>a \t b c</p> <p>d</p>',
    )
  })
})
