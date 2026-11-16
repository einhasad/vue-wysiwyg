import type { SanitizeOptions, Schema, TagRule } from '../core/types.js'
import { createSchema, DROPPED_TAGS } from './schema.js'
import { safeUrl } from './url.js'

export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

let defaultSchema: Schema | undefined

export function shallowCopy(
  source: Element,
  name: string,
  schema: Schema,
  document: Document,
): Element {
  const copy = document.createElement(name)
  const rule = schema.tags.get(name) as TagRule
  for (const attribute of rule.attrs) {
    const raw = source.getAttribute(attribute)
    const value = raw !== null && rule.urlAttrs?.includes(attribute) ? safeUrl(raw, schema) : raw
    if (value !== null) {
      copy.setAttribute(attribute, value)
    }
  }
  for (const [attribute, value] of Object.entries(rule.fixedAttrs ?? {})) {
    copy.setAttribute(attribute, value)
  }
  return copy
}

export function sanitizeToFragment(
  input: string | Node,
  {
    schema = (defaultSchema ??= createSchema()),
    document = globalThis.document,
    sanitizer,
  }: SanitizeOptions = {},
): DocumentFragment {
  let source = input as Node
  if (typeof input === 'string') {
    if (sanitizer) {
      source = sanitizer(input)
    } else {
      const body = document.implementation.createHTMLDocument('').body
      body.innerHTML = input
      source = body
    }
  }
  const output = document.createDocumentFragment()
  const stack: [Node, Node, number][] = []
  const pushChildren = (node: Node, parent: Node, depth: number): void => {
    const children = node.childNodes
    for (let index = children.length; index--;) {
      stack.push([children[index] as Node, parent, depth])
    }
  }
  pushChildren(source, output, 0)
  for (let item = stack.pop(); item; item = stack.pop()) {
    const [node, parent, depth] = item
    const element = node as Element
    const localName: unknown = element.localName
    const parentKind = schema.tags.get((parent as Element).localName)?.kind
    if (node.nodeType === 3) {
      if ((node as Text).data) {
        parent.appendChild(document.createTextNode((node as Text).data))
      }
    } else if (
      node.nodeType === 1 &&
      element.namespaceURI === HTML_NAMESPACE &&
      typeof localName === 'string' &&
      !DROPPED_TAGS.has(localName)
    ) {
      const name = schema.rename.get(localName) ?? localName
      const kind = schema.tags.get(name)?.kind
      const textOnly = parentKind === 'block' || parentKind === 'inline'
      const inline = kind === 'inline'
      if (
        !kind ||
        depth >= 128 ||
        (textOnly && !inline && kind !== 'void') ||
        (kind === 'item' && parentKind === 'item') ||
        (inline && textOnly && !!(parent as Element).closest(name))
      ) {
        pushChildren(node, parent, depth + 1)
      } else {
        const copy = parent.appendChild(shallowCopy(element, name, schema, document))
        if (kind !== 'void') {
          pushChildren(node, copy, depth + 1)
        }
      }
    }
  }
  return output
}

export function sanitize(html: string, options: SanitizeOptions = {}): string {
  const fragment = sanitizeToFragment(html, options)
  const container = fragment.ownerDocument.createElement('div')
  container.appendChild(fragment)
  return container.innerHTML
}
