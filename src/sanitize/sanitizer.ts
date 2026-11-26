import type { SanitizeOptions, Schema, TagRule } from '../core/types.js'
import { createSchema, DROPPED_TAGS, isBlockLevel, kindOf, unwrapsRename } from './schema.js'
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
  let breakBefore: Node | undefined
  const append = (parent: Node, child: Node): Node => {
    let pending = breakBefore
    while (pending && pending !== parent && kindOf(schema, pending) === 'inline') {
      pending = pending.parentNode as Node
    }
    if (pending === parent && !isBlockLevel(schema, child)) {
      parent.appendChild(document.createElement('br'))
    }
    breakBefore = undefined
    return parent.appendChild(child)
  }
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
    const parentKind = kindOf(schema, parent)
    if (node === parent) {
      breakBefore = parent
    } else if (node.nodeType === 3) {
      const { data, previousSibling, nextSibling } = node as Text
      const atBlockEdge = isBlockLevel(schema, node.parentNode)
      const text = data.replace(/[\t\n\r ]+/g, (run, offset: number) =>
        !run.includes('\n')
          ? run
          : !atBlockEdge ||
              (offset ? offset + run.length < data.length || nextSibling : previousSibling)
            ? ' '
            : '',
      )
      if (text) {
        append(parent, document.createTextNode(text))
      }
    } else if (
      node.nodeType === 1 &&
      element.namespaceURI === HTML_NAMESPACE &&
      typeof localName === 'string' &&
      !DROPPED_TAGS.has(localName)
    ) {
      const name = schema.rename.get(localName) ?? localName
      const kind = kindOf(schema, node)
      const textOnly = parentKind === 'block' || parentKind === 'inline'
      const inline = kind === 'inline'
      const separated =
        (textOnly && !inline && kind !== 'void') ||
        (parentKind === 'item' && (kind === 'block' || kind === 'item')) ||
        (parentKind === 'list' && kind === 'block')
      if (
        !kind ||
        separated ||
        depth >= 128 ||
        (inline && textOnly && !!(parent as Element).closest(name)) ||
        unwrapsRename(schema, node)
      ) {
        if (kind && separated) {
          let before = !!parent.lastChild
          for (
            let ancestor = parent;
            !before && kindOf(schema, ancestor) === 'inline';
            ancestor = ancestor.parentNode as Node
          ) {
            before = !!ancestor.previousSibling && !!kindOf(schema, ancestor.parentNode)
          }
          if (before) {
            breakBefore = parent
          }
          stack.push([parent, parent, depth])
        }
        pushChildren(node, parent, depth + 1)
      } else {
        const copy = append(parent, shallowCopy(element, name, schema, document))
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
