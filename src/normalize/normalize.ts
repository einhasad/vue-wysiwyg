import type { Schema, TagKind, TagRule } from '../core/types.js'
import { HTML_NAMESPACE, shallowCopy } from '../sanitize/sanitizer.js'
import { DROPPED_TAGS, kindOf } from '../sanitize/schema.js'

type Context = 'root' | 'list' | 'item' | 'text'
type NodeClass = TagKind | 'text' | 'drop' | 'unknown'

const ALLOWED: Readonly<Record<Context, readonly NodeClass[]>> = {
  root: ['block', 'list'],
  list: ['item'],
  item: ['inline', 'void', 'list', 'text'],
  text: ['inline', 'void', 'text'],
}

const CHILD_CONTEXT: Readonly<Record<TagKind, Context>> = {
  block: 'text',
  inline: 'text',
  void: 'text',
  list: 'list',
  item: 'item',
}

export function normalizeElement(root: Element, schema: Schema): boolean {
  const document = root.ownerDocument
  let changed = false

  const firstTag = (kind: TagKind): string =>
    [...schema.tags].find(([, rule]) => rule.kind === kind)?.[0] ?? 'p'

  const nameOf = (node: Node): string => {
    const { localName } = node as Element
    return schema.rename.get(localName) ?? localName
  }

  const classOf = (node: Node): NodeClass =>
    node.nodeType === 3
      ? 'text'
      : node.nodeType !== 1 ||
          (node as Element).namespaceURI !== HTML_NAMESPACE ||
          DROPPED_TAGS.has((node as Element).localName)
        ? 'drop'
        : (kindOf(schema, node) ?? 'unknown')

  const flatten = (parent: Element, context: Context, marks: readonly string[]): void => {
    for (let node = parent.firstChild; node;) {
      let next = node.nextSibling
      const nodeClass = classOf(node)
      const name = nameOf(node)
      if (nodeClass === 'drop') {
        node.remove()
      } else if (
        nodeClass === 'unknown' ||
        marks.includes(name) ||
        (!ALLOWED[context].includes(nodeClass) && (context === 'item' || context === 'text'))
      ) {
        next = node.firstChild ?? next
        node.replaceWith(...node.childNodes)
      } else {
        const copy =
          nodeClass === 'text' ? node : shallowCopy(node as Element, name, schema, document)
        if (copy.isEqualNode(node.cloneNode())) {
          node = next
          continue
        }
        ;(copy as Element).append(...node.childNodes)
        node.replaceWith(copy)
      }
      changed = true
      node = next
    }
  }

  const group = (parent: Element, context: Context): void => {
    let wrapper = null as Element | null
    for (const node of [...parent.childNodes]) {
      const nodeClass = classOf(node)
      const whitespace = nodeClass === 'text' && /^[\t\n\f\r ]*$/.test((node as Text).data)
      const wrapperTag = firstTag(
        context === 'list' ? 'item' : nodeClass === 'item' ? 'list' : 'block',
      )
      const previous = node.previousSibling as Element | null
      if (ALLOWED[context].includes(nodeClass)) {
        wrapper = null
      } else if (whitespace && !wrapper) {
        node.remove()
        changed = true
      } else {
        if (!whitespace && wrapper?.localName !== wrapperTag) {
          wrapper =
            context === 'list' && previous?.localName === wrapperTag
              ? previous
              : parent.insertBefore(document.createElement(wrapperTag), node)
        }
        ;(wrapper as Element).append(node)
        changed = true
      }
    }
  }

  const visit = (parent: Element, context: Context, marks: readonly string[]): void => {
    flatten(parent, context, marks)
    if (context === 'root' || context === 'list') {
      group(parent, context)
    }
    for (let node = parent.firstChild; node;) {
      const next = node.nextSibling
      if (node.nodeType === 1) {
        const element = node as Element
        const { kind } = schema.tags.get(element.localName) as TagRule
        if (kind === 'void') {
          if (element.firstChild) {
            element.replaceChildren()
            changed = true
          }
        } else {
          visit(
            element,
            CHILD_CONTEXT[kind],
            kind === 'inline' ? [...marks, element.localName] : [],
          )
          const previous = element.previousSibling
          if ((kind === 'inline' || kind === 'list') && !element.firstChild) {
            element.remove()
            changed = true
          } else if (
            kind === 'inline' &&
            previous?.nodeType === 1 &&
            previous.cloneNode().isEqualNode(element.cloneNode())
          ) {
            ;(previous as Element).append(...element.childNodes)
            element.remove()
            visit(previous as Element, 'text', [...marks, element.localName])
            changed = true
          } else if (kind !== 'inline' && kind !== 'list') {
            const last = element.lastChild
            const beforeLast = last?.previousSibling
            if (
              last?.nodeName === 'BR' &&
              beforeLast &&
              beforeLast.nodeName !== 'BR' &&
              (beforeLast as Text).data !== ''
            ) {
              last.remove()
              changed = true
            }
            if (element.textContent === '' && !element.firstElementChild) {
              element.append(document.createElement('br'))
              changed = true
            }
          }
        }
      }
      node = next
    }
  }

  visit(root, 'root', [])
  if (!root.firstChild) {
    root.append(document.createElement(firstTag('block')))
    visit(root, 'root', [])
    changed = true
  }
  return changed
}
