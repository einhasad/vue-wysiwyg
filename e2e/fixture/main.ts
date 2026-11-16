import { createEditor, type Editor, type Module } from '../../src/index.js'

declare global {
  interface Window {
    editor: Editor
    alerts: string[]
  }
}

const params = new URLSearchParams(location.search)
const loaders = import.meta.glob<Record<string, (options?: unknown) => Module>>('/src/modules/*.ts')
const names = (params.get('modules') ?? '').split(',').filter(Boolean)
const moduleOptions = JSON.parse(params.get('options') ?? '{}') as Record<string, unknown>

window.alerts = []
window.alert = (message?: unknown): void => {
  window.alerts.push(String(message))
}

const modules = await Promise.all(
  names.map(async (name) => {
    const load = loaders[`/src/modules/${name}.ts`]
    if (!load) {
      throw new Error(`Unknown module ${name}`)
    }
    const exports = await load()
    const exportName = name.replace(/-(\w)/g, (_match, letter: string) => letter.toUpperCase())
    const factory = exports[exportName]
    if (!factory) {
      throw new Error(`Module ${name} has no factory`)
    }
    return factory(moduleOptions[exportName])
  }),
)

const output = document.getElementById('output') as HTMLElement
const editor = createEditor({
  element: document.getElementById('editor') as HTMLElement,
  content: params.get('content') ?? '',
  readonly: params.has('readonly'),
  label: 'Editor',
  modules,
})
editor.on('update', () => {
  output.textContent = editor.getHTML()
})
output.textContent = editor.getHTML()
window.editor = editor
document.body.dataset['ready'] = 'true'
