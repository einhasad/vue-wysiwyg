import type { Module, Schema, SchemaOptions, TagKind, TagRule } from '../core/types.js'
import { DEFAULT_URL_SCHEMES } from './url.js'

export const DROPPED_TAGS: ReadonlySet<string> = new Set(
  'script style template iframe frame frameset object embed noscript noembed noframes svg math title textarea xmp plaintext select option form button input base meta link head selectedcontent'.split(
    ' ',
  ),
)

const UNSAFE_NAME = /^(on|(style|srcdoc|srcset|formaction|constructor|prototype)$)/

const assertSafeNames = (names: readonly string[], pattern: RegExp, isTag?: boolean): void => {
  for (const name of names) {
    if (!pattern.test(name) || UNSAFE_NAME.test(name) || (isTag && DROPPED_TAGS.has(name))) {
      throw new TypeError(name)
    }
  }
}

export const kindOf = (schema: Schema, node: Node | null): TagKind | undefined => {
  const name = (node as Element | null)?.localName as string
  return schema.tags.get(schema.rename.get(name) ?? name)?.kind
}

export const isBlockLevel = (schema: Schema, node: Node | null): boolean =>
  /^(block|list|item)$/.test(kindOf(schema, node) ?? '')

export function createSchema(modules: readonly Module[] = [], options: SchemaOptions = {}): Schema {
  const tags = new Map<string, TagRule>([
    ['p', { kind: 'block', attrs: [] }],
    ['br', { kind: 'void', attrs: [] }],
  ])
  const rename = new Map([['div', 'p']])
  for (const { schema } of modules) {
    const contributed = Object.entries(schema?.tags ?? {})
    const renamed = Object.entries(schema?.rename ?? {})
    assertSafeNames(
      [...contributed.map(([name]) => name), ...renamed.flat()],
      /^[a-z][a-z0-9]*$/,
      true,
    )
    for (const [name, rule] of contributed) {
      assertSafeNames(
        [...rule.attrs, ...(rule.urlAttrs ?? []), ...Object.keys(rule.fixedAttrs ?? {})],
        /^[a-z][a-z0-9-]*$/,
      )
      const previous = tags.get(name)
      tags.set(name, {
        kind: rule.kind,
        attrs: [...(previous?.attrs ?? []), ...rule.attrs],
        urlAttrs: [
          ...(previous?.urlAttrs ?? []),
          ...(rule.urlAttrs ?? []),
          'href',
          'src',
          'action',
        ],
        fixedAttrs: { ...rule.fixedAttrs, ...previous?.fixedAttrs },
      })
    }
    for (const [from, to] of renamed) {
      rename.set(from, to)
    }
  }
  return {
    tags,
    rename,
    urlSchemes: (options.urlSchemes ?? DEFAULT_URL_SCHEMES).filter(
      (scheme) => !/^(javascript|vbscript|data)$/i.test(scheme),
    ),
    allowProtocolRelative: !!options.allowProtocolRelative,
  }
}
