import type { SanitizeOptions, Schema } from '../core/types.js'
import { sanitizeToFragment } from '../sanitize/sanitizer.js'
import { isEmptyNode } from './empty.js'
import { normalizeElement } from './normalize.js'

export { isEmptyNode, normalizeElement }

export function normalizeHTML(html: string, schema: Schema, options: SanitizeOptions = {}): string {
  const document = options.document ?? globalThis.document
  const container = document.createElement('div')
  container.appendChild(sanitizeToFragment(html, { ...options, schema }))
  normalizeElement(container, schema)
  return isEmptyNode(container) ? '' : container.innerHTML
}

export function isEmptyHTML(html: string, options: SanitizeOptions = {}): boolean {
  return isEmptyNode(sanitizeToFragment(html, options))
}
