import { expect } from 'vitest'
import type { Module, TagRule } from '../../core/types.js'
import { createSchema, safeUrl } from '../../sanitize/index.js'

const block: TagRule = { kind: 'block', attrs: [] }
const mark: TagRule = { kind: 'inline', attrs: [] }

export const markdownTags: Module = {
  name: 'markdownTags',
  schema: {
    tags: {
      h1: block,
      h2: block,
      h3: block,
      h4: block,
      h5: block,
      h6: block,
      ul: { kind: 'list', attrs: [] },
      ol: { kind: 'list', attrs: [] },
      li: { kind: 'item', attrs: [] },
      strong: mark,
      em: mark,
      a: {
        kind: 'inline',
        attrs: ['href'],
        urlAttrs: ['href'],
        fixedAttrs: { rel: 'noopener noreferrer nofollow' },
      },
    },
  },
}

export const schema = createSchema([markdownTags])

export const outputSchema = createSchema([
  {
    name: 'markdownOutput',
    schema: {
      tags: {
        ...markdownTags.schema?.tags,
        a: { kind: 'inline', attrs: ['href'], urlAttrs: ['href'] },
      },
    },
  },
])

const OUTPUT_TAGS = new Set([
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'a',
])

export const expectSafeMarkup = (html: string, extraAttributes: readonly string[] = []): void => {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ALL)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    expect([1, 3]).toContain(node.nodeType)
    if (node.nodeType === 1) {
      const element = node as Element
      expect(OUTPUT_TAGS).toContain(element.localName)
      for (const name of element.getAttributeNames()) {
        expect(['href', ...extraAttributes]).toContain(name)
      }
      const href = element.getAttribute('href')
      if (href !== null) {
        expect(safeUrl(href)).not.toBeNull()
      }
    }
  }
}
