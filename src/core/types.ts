export type TagKind = 'block' | 'inline' | 'void' | 'list' | 'item'

export interface TagRule {
  readonly kind: TagKind
  readonly attrs: readonly string[]
  readonly urlAttrs?: readonly string[]
  readonly fixedAttrs?: Readonly<Record<string, string>>
}

export interface SchemaContribution {
  readonly tags?: Readonly<Record<string, TagRule>>
  readonly rename?: Readonly<Record<string, string>>
}

export interface UrlPolicy {
  readonly urlSchemes: readonly string[]
  readonly allowProtocolRelative: boolean
}

export interface Schema extends UrlPolicy {
  readonly tags: ReadonlyMap<string, TagRule>
  readonly rename: ReadonlyMap<string, string>
}

export interface SchemaOptions {
  readonly urlSchemes?: readonly string[]
  readonly allowProtocolRelative?: boolean
}

export type ExternalSanitizer = (html: string) => DocumentFragment

export interface SanitizeOptions {
  readonly schema?: Schema
  readonly document?: Document
  readonly sanitizer?: ExternalSanitizer
}

export interface Commands {
  undo: undefined
  redo: undefined
}

export type CommandName = keyof Commands

export type CommandArgs<K extends CommandName> = Commands[K] extends undefined ? [] : [Commands[K]]

export interface CommandSpec<A = undefined> {
  run(editor: Editor, arg: A): boolean
  isActive?(editor: Editor, arg?: A): boolean
  isEnabled?(editor: Editor): boolean
}

export interface Module {
  readonly name: string
  readonly priority?: number
  readonly schema?: SchemaContribution
  readonly commands?: Readonly<Record<string, CommandSpec<never>>>
  readonly keys?: Readonly<Record<string, string>>
  readonly inputTypes?: Readonly<Record<string, string>>
  onBeforeInput?(event: InputEvent, editor: Editor): boolean
  onKeyDown?(event: KeyboardEvent, editor: Editor): boolean
  transformPastedHTML?(html: string, editor: Editor): string
  transformPastedText?(text: string, editor: Editor): string
  setup?(editor: Editor): (() => void) | undefined
}

export interface Format {
  parse(input: string, schema?: Schema): string
  stringify(html: string): string
}

export interface EditorOptions extends SchemaOptions {
  readonly element?: HTMLElement
  readonly content?: string
  readonly modules?: readonly Module[]
  readonly format?: Format
  readonly readonly?: boolean
  readonly label?: string
  readonly sanitizer?: ExternalSanitizer
}

export type EditorEvent =
  'update' | 'selection' | 'focus' | 'blur' | 'keydown' | 'beforeChange' | 'readonly' | 'destroy'

export type EditorListener = (editor: Editor, event?: Event) => void

export interface SelectionPath {
  readonly anchor: readonly number[]
  readonly focus: readonly number[]
}

export interface EditorSelection {
  range(): Range | null
  save(): SelectionPath | null
  restore(path: SelectionPath | null): void
}

export interface SetHTMLOptions {
  readonly history?: boolean
}

export interface Editor {
  readonly root: HTMLElement
  readonly schema: Schema
  readonly readonly: boolean
  readonly commands: readonly string[]
  readonly selection: EditorSelection
  getHTML(): string
  setHTML(html: string, options?: SetHTMLOptions): void
  getValue(): string
  setValue(value: string, options?: SetHTMLOptions): void
  isEmpty(): boolean
  textLength(): number
  exec<K extends CommandName>(name: K, ...arg: CommandArgs<K>): boolean
  can(name: CommandName): boolean
  isActive(name: CommandName, arg?: unknown): boolean
  transact(mutate: () => void): void
  setReadonly(value: boolean): void
  focus(): void
  on(event: EditorEvent, listener: EditorListener): () => void
  destroy(): void
}
