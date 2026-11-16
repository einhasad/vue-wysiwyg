// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface Snippet {
  readonly name: string
  readonly language: string
  readonly code: string
}

const ROOT = resolve(import.meta.dirname, '../../..')
const DOCUMENTS = ['README.md', 'docs/modules.md', 'docs/markdown.md']
const FENCE = /^```(ts|vue)\n([\s\S]*?)^```$/gm
const PACKAGE = '@einhasad-vue/vue-wysiwyg'

const UNTYPED_SLOT_PARAMETER_CODES = new Set([7006, 7031])

const THIRD_PARTY_TYPES = `
declare module 'linkedom' {
  export function parseHTML(html: string): { document: Document }
}
`

const snippetsOf = (document: string): Snippet[] =>
  [...readFileSync(resolve(ROOT, document), 'utf8').matchAll(FENCE)].map((match, index) => ({
    name: `${document}#${String(index + 1)}`,
    language: match[1] as string,
    code: match[2] as string,
  }))

const toTypeScript = ({ name, language, code }: Snippet): string => {
  if (language === 'ts') {
    return `${code}\nexport {}\n`
  }
  const { descriptor } = parse(code, { filename: `${name}.vue` })
  return compileScript(descriptor, { id: name, inlineTemplate: true }).content
}

const virtualPath = (index: number): string => resolve(ROOT, `__docs__/snippet-${String(index)}.ts`)

const typeErrors = (snippets: readonly Snippet[]): string[] => {
  const files = new Map(
    snippets.map((snippet, index) => [virtualPath(index), toTypeScript(snippet)]),
  )
  const typesFile = resolve(ROOT, '__docs__/third-party.d.ts')
  files.set(typesFile, THIRD_PARTY_TYPES)
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: ['vite/client'],
    strict: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    noEmit: true,
    paths: {
      [PACKAGE]: [resolve(ROOT, 'src/index.ts')],
      [`${PACKAGE}/theme.css`]: [resolve(ROOT, 'src/theme/theme.css')],
      [`${PACKAGE}/*`]: [resolve(ROOT, 'src/*/index.ts'), resolve(ROOT, 'src/*.ts')],
    },
  }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.fileExists = (path) => files.has(path) || ts.sys.fileExists(path)
  host.readFile = (path) => files.get(path) ?? readFile(path)
  host.getSourceFile = (path, version, ...rest) => {
    const text = files.get(path)
    return text === undefined
      ? getSourceFile(path, version, ...rest)
      : ts.createSourceFile(path, text, version, true)
  }
  const program = ts.createProgram([...files.keys()], options, host)
  return snippets.flatMap((snippet, index) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(virtualPath(index)))
      .filter(({ code }) => snippet.language === 'ts' || !UNTYPED_SLOT_PARAMETER_CODES.has(code))
      .map(
        (diagnostic) =>
          `${snippet.name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      ),
  )
}

describe('documentation snippets', () => {
  const snippets = DOCUMENTS.flatMap(snippetsOf)

  it('finds the README snippets', () => {
    expect(
      snippets.filter(({ name }) => name.startsWith('README.md')).length,
    ).toBeGreaterThanOrEqual(7)
  })

  it('typecheck against the sources', () => {
    expect(typeErrors(snippets)).toEqual([])
  }, 60_000)

  it('reports a type error in a snippet', () => {
    expect(
      typeErrors([
        {
          name: 'broken',
          language: 'ts',
          code: `import { createEditor } from '${PACKAGE}'\ncreateEditor({}).exec('nope')\n`,
        },
      ]),
    ).toEqual([expect.stringMatching(/^broken: Argument of type '"nope"' is not assignable/)])
  }, 60_000)
})
