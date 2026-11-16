import type { Format } from './types.js'

export const htmlFormat: Format = {
  parse: (input) => input,
  stringify: (html) => html,
}
