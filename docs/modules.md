# Modules

Every feature is a module: a plain object created by a factory function and passed to `createEditor({ modules })` or
`<WysiwygEditor :modules>`. Modules you do not import are not in your bundle.

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { bold, heading, lists, starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'

const small = createEditor({ modules: [bold(), italic(), heading({ levels: [2, 3] }), lists()] })
const typical = createEditor({ modules: starterKit({ underline: false }) })
small.destroy()
typical.destroy()
```

The barrel `@einhasad-vue/vue-wysiwyg/modules` and the single files `@einhasad-vue/vue-wysiwyg/modules/<file>` export
the same factories, and importing one module from the barrel costs the same bytes as importing its file.

General rules:

- Commands run through `editor.exec(name, arg)`, which returns `false` when the command did nothing. `editor.can(name)`
  tells whether it would run, and `editor.isActive(name, arg)` whether the selection already has it.
- Key names: `Mod` is Ctrl on Windows and Linux and Cmd on macOS. On non-Latin keyboard layouts the physical key
  (`KeyB`) is used, so `Mod-b` still works.
- In readonly mode every command and shortcut is blocked; selecting and copying still work.
- Each module adds its tags to the schema. The schema decides what the sanitizer keeps, so use the same modules for
  `createSchema(modules)` when you sanitize stored HTML for display.
- One module array can serve several editors, for example `export const modules = starterKit()` shared by every
  `<WysiwygEditor>` on a page: each editor keeps its own state (undo stack, pending shortcut, paste mode).
- Commands work only on the part of the selection inside the editor; nodes outside the editor root are never changed.
- The editor root is a `role="textbox"` named by `label` (`createEditor`) or by `label`/`labelledby`
  (`<WysiwygEditor>`); without either it is named `Rich text editor`, so it is never an unnamed textbox.
- Sizes are size-limit measurements (esbuild, minified, gzip) of `createEditor` plus the module. Core alone is 4.97 kB,
  under 5 kB.

## starterKit

`starterKit(options?)` returns `bold`, `italic`, `underline`, `heading`, `lists`, `link`, `history`, `paste` and
`placeholder`, in that order. Each option is `false` to leave the module out, or the options of that module.

```ts
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'

export const modules = starterKit({
  heading: { levels: [2, 3] },
  link: { target: '_blank' },
  history: { depth: 50 },
  placeholder: { text: 'Write something' },
  underline: false,
})
```

Size: core + `starterKit()` 8.9 kB.

## bold, italic, underline

| Module        | Tag      | Command     | Keys    | Native input type | Also accepts |
| ------------- | -------- | ----------- | ------- | ----------------- | ------------ |
| `bold()`      | `strong` | `bold`      | `Mod-b` | `formatBold`      | `b`          |
| `italic()`    | `em`     | `italic`    | `Mod-i` | `formatItalic`    | `i`          |
| `underline()` | `u`      | `underline` | `Mod-u` | `formatUnderline` |              |

- No options.
- The command toggles the mark on the selected text, also across several blocks. On a collapsed caret it stores the
  mark for the next typed text: Mod-b then typing types bold, and Mod-b at the end of a bold run (or in a new line that
  Enter left inside bold) types outside it. Stored marks are dropped when the caret moves. `isActive` is true when the
  caret, or all selected text, is inside the mark, or when the mark is stored for the caret.
- `b` and `i` in pasted or loaded HTML become `strong` and `em`.
- Size: core + `bold` 5.9 kB. The marks helper is shared, so `italic` next to `bold` adds about 0.03 kB; core +
  `underline` alone is 5.9 kB.

## heading

```ts
import { heading } from '@einhasad-vue/vue-wysiwyg/modules'

export const headings = heading({ levels: [2, 3] })
```

| Option   | Type                       | Default              |
| -------- | -------------------------- | -------------------- |
| `levels` | array of `1` to `6` values | `[1, 2, 3, 4, 5, 6]` |

- Command `heading` with the level as argument: `editor.exec('heading', 2)`. It turns the selected blocks into that
  heading, or back into paragraphs when they all already are. A level outside `levels` returns `false`.
- `editor.can('heading')` is `false` when the selection holds only list items (lists keep their items; a mixed
  selection changes only its paragraphs and headings).
- `editor.isActive('heading', 2)` is true when the selected lines are `h2`.
- Keys: `Mod-Alt-1` to `Mod-Alt-6` (allowed levels only).
- Pasted or loaded headings of a level outside `levels` become paragraphs.
- Size: core + `heading` 5.5 kB.

## lists

- `lists({ types })`. `types` is `['ul', 'ol']` by default; `lists({ types: ['ul'] })` offers bulleted lists only. Tags
  are the listed types and `li`; a pasted or loaded list of a missing type becomes the first listed type. Only the
  commands of the listed types exist, so `EditorToolbar` shows only their buttons.
- Commands:
  - `bulletList` and `orderedList` wrap the selected blocks in a list, switch a list between `ul` and `ol`, or lift the
    items back into paragraphs when the whole selection already is that list. Adjacent lists of the same type merge.
    A heading turned into an item becomes that heading again when it leaves the list.
  - `indentList` nests the selected items into the previous item and is enabled only when one of them has a previous
    item; `outdentList` moves them one level up and is enabled when the selection contains list items.
- Keys: `Tab` indents and `Shift-Tab` outdents inside a list. When nothing can be indented (the first item) or
  outdented (outside a list), Tab keeps its native behavior and moves the focus, so a list is never a keyboard trap.
- Enter in an empty item leaves the list (or one nesting level). Backspace at the start of the first item lifts it out
  of the list.
- Size: core + `lists` 6.2 kB.

## link

```ts
import { link, linkHref } from '@einhasad-vue/vue-wysiwyg/modules'

export const links = link({
  target: '_blank',
  onShortcut: (editor) => {
    const url = window.prompt('URL', linkHref(editor) ?? 'https://')
    if (url !== null) {
      editor.exec('link', url)
    }
  },
})
```

| Option       | Type                       | Default                      |
| ------------ | -------------------------- | ---------------------------- |
| `target`     | string, such as `'_blank'` | none: links get no `target`  |
| `onShortcut` | `(editor: Editor) => void` | none: `Mod-k` is not handled |

- Tag `a` with `href`. Every link gets `rel="noopener noreferrer nofollow"`, plus `target` when the option is set.
- Command `link` with a URL links the selected text, or changes the URL of the link around the caret. A selection
  inside one paragraph, heading or list item becomes one link around its formatting (`<a><strong>…</strong> …</a>`) and
  replaces the links inside it; a selection that is exactly the text of one mark is linked inside that mark
  (`<strong><a>…</a></strong>`), and a selection across several blocks gets one link per block. With `null` it removes
  the link around the caret or from the selected text. A collapsed caret outside a link creates nothing.
- Every URL goes through `safeUrl`: only `http`, `https`, `mailto`, `tel` and relative URLs pass by default (change
  this with the `urlSchemes` editor option). A rejected URL returns `false` and changes nothing.
- `linkHref(editor)` returns the `href` of the link at the selection start, for prefilling a dialog.
- Only an `a` with `href` counts as a link. When the sanitizer rejects the URL of a stored or pasted link, it keeps the
  text in a bare `<a rel="…">` so stored HTML loads unchanged; there `isActive('link')` is `false`, `linkHref` is
  `undefined` and the link popover edits it like plain text. Running `link` with a
  URL on a caret inside it gives it that `href`; with `null` it is unwrapped.
- Keys: `Mod-k` calls `onShortcut`. `EditorToolbar` from `./theme` handles `Mod-k` itself and opens its link popover.
- The browser `insertLink` input type is routed to the `link` command.
- Size: core + `link` 5.8 kB.

## history

```ts
import { history } from '@einhasad-vue/vue-wysiwyg/modules'

export const undoRedo = history({ depth: 100, groupDelay: 500 })
```

| Option       | Type                                                     | Default |
| ------------ | -------------------------------------------------------- | ------- |
| `depth`      | number of undo steps kept                                | `100`   |
| `groupDelay` | ms within which typing of the same kind is one undo step | `500`   |

- Commands `undo` and `redo`. Every command (`bold`, `link` and so on) is its own step; consecutive typing of the same
  input type within `groupDelay` is grouped. A step that changed nothing is not recorded. An `editor.transact()` that
  runs commands inside is one step, so inserting text and linking it from the link popover is undone at once.
- Keys: `Mod-z` undo, `Mod-Shift-z` and `Mod-y` redo. The browser `historyUndo` and `historyRedo` input types (menu,
  shake to undo) are routed to the same commands, so the native undo stack never gets out of sync.
- Undo restores the HTML and the selection through `setHTML`, so restored content is sanitized again.
- An outside change of the content (`setHTML`/`setValue` without options, a new `v-model` value) starts a new history:
  undo and redo are cleared. Pass `{ history: true }` to `setHTML`/`setValue` to record the change as one undo step
  instead.
- Undo and redo emit `update` once, like any other command.
- Undo and redo are disabled while an IME composition is in progress.
- Without this module, `undo` and `redo` do nothing.
- Size: core + `history` 5.4 kB.

## paste

- `paste()`, no options. Core already sanitizes every paste and drop; this module cleans up content from office apps
  before that.
- Word (Windows and Mac): `mso-list` paragraphs become nested `ul`/`ol` lists (when `lists` is used); adjacent Word
  lists with a different list id or marker type stay separate lists. List markers, `<o:p>` placeholders and other
  Word-only markup are removed, so an empty Word line becomes an empty paragraph.
- Google Docs: the `b` wrapper with `font-weight: normal` is unwrapped, and `span` styles become `strong`, `em` and `u`.
- Tables (Excel, Google Sheets, web pages): every row becomes a paragraph with its cells separated by a tab, empty
  cells included.
- Plain text with blank lines becomes paragraphs, with single line breaks as `br`.
- `Mod-Shift-v` pastes plain text only.
- A pasted or dropped `text/uri-list` without `text/html` becomes a link through `safeUrl`, when `link` is used.
- Size: core + `paste` 5.9 kB.

## placeholder

```ts
import { placeholder } from '@einhasad-vue/vue-wysiwyg/modules'

export const hint = placeholder({ text: 'Write something', emptyClass: 'is-empty' })
```

| Option       | Type   | Default      |
| ------------ | ------ | ------------ |
| `text`       | string | `''`         |
| `emptyClass` | string | `'is-empty'` |

- Sets `data-placeholder` and `aria-placeholder` on the editor root and toggles `emptyClass` while the editor is empty.
  `theme.css` shows the text with `[data-placeholder].is-empty::before`; without the theme, style it yourself.
- The class is removed while an IME composition runs and checked again when it ends.
- No commands or keys.
- Size: core + `placeholder` 5.1 kB.

## characterCount

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { characterCount } from '@einhasad-vue/vue-wysiwyg/modules'

const counter = characterCount({ limit: 500 })
const editor = createEditor({ modules: [counter] })

editor.on('update', () => {
  console.log(`${String(counter.count())} / 500, ${String(counter.words())} words`)
})
```

| Option  | Type   | Default    |
| ------- | ------ | ---------- |
| `limit` | number | `Infinity` |

- `count(editor?)` returns the number of characters (`editor.textLength()`), and `words(editor?)` the number of words.
  Without an argument they count the editor the module was set up with last; pass the editor when one `characterCount`
  instance serves several editors.
- Typing that would go over `limit` is blocked, and pasted text or HTML is cut at the limit (never inside a surrogate
  pair). IME composition is never interrupted; if it ends over the limit, the content reverts to its state before the
  composition and the composition leaves no undo step.
- Without `limit` it only counts.
- No commands or keys.
- Size: core + `characterCount` 5.5 kB.

## markdownShortcuts

```ts
import { markdownShortcuts, starterKit } from '@einhasad-vue/vue-wysiwyg/modules'

export const modules = [...starterKit(), markdownShortcuts()]
```

Also exported from `@einhasad-vue/vue-wysiwyg/markdown`. No options. It runs the commands of other modules, so a
shortcut works only when the matching module is used.

| Typed at the start of a paragraph, then Space | Result                             | Needs     |
| --------------------------------------------- | ---------------------------------- | --------- |
| `#` to `######`                               | heading of that level (if allowed) | `heading` |
| `-`, `*` or `+`                               | bulleted list                      | `lists`   |
| `1.` or `1)` (any number)                     | numbered list                      | `lists`   |

| Typed anywhere | Result      | Needs    |
| -------------- | ----------- | -------- |
| `**text**`     | bold text   | `bold`   |
| `*text*`       | italic text | `italic` |

The marker characters are removed. Text typed right after an applied mark continues outside the mark. Undo
(`history`) reverts a shortcut. Size: core + `markdownShortcuts` 5.6 kB.

## Writing a module

`defineModule` keeps the literal type of a module. Add the command names to `Commands`, so that `exec` and `isActive`
are typed:

```ts
import { createEditor, defineModule } from '@einhasad-vue/vue-wysiwyg'

declare module '@einhasad-vue/vue-wysiwyg' {
  interface Commands {
    insertDate: undefined
  }
}

const insertDate = () =>
  defineModule({
    name: 'insertDate',
    commands: {
      insertDate: {
        run(editor) {
          const range = editor.selection.range()
          if (!range) {
            return false
          }
          editor.transact(() => {
            range.deleteContents()
            range.insertNode(document.createTextNode(new Date().toISOString().slice(0, 10)))
          })
          return true
        },
      },
    },
    keys: { 'Mod-Shift-d': 'insertDate' },
  })

const editor = createEditor({ modules: [insertDate()] })
editor.exec('insertDate')
```

A module can also:

- contribute schema tags: `schema: { tags: { s: { kind: 'inline', attrs: [] } } }`;
- handle `onBeforeInput` and `onKeyDown`, returning `true` when it handled the event;
- change pasted content before it is sanitized with `transformPastedHTML` and `transformPastedText`;
- add listeners in `setup(editor)` and return a cleanup function.

Change the DOM only inside `editor.transact(fn)` or a command, so normalization, history and the `update` event run.
A change made outside them through `editor.setHTML(html)` counts as an outside change and clears the undo history; use
`editor.setHTML(html, { history: true })` to record it. Tag and attribute names are validated: event handlers,
`style`, `srcdoc`, `srcset` and `formaction` can not be allowed.

Schema rules:

- `href`, `src` and `action` are always URL-checked with `safeUrl` against the editor's `urlSchemes`, even when a module
  does not list them in `urlAttrs`. List any other URL attribute in `urlAttrs`.
- When several modules contribute the same tag, the rules merge: `attrs` and `urlAttrs` are joined, the `kind` of the
  later module wins, and `fixedAttrs` of the earlier module win. A later module can therefore not drop the fixed `rel`
  of `link` or turn off the URL check of `a`.

### Helpers

`@einhasad-vue/vue-wysiwyg/helpers` exports the helpers the built-in modules use:

| Helper                                                 | Use                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `keyOf(event)`, `normalizeKeySpec(spec)`               | key names like `Mod-Shift-x` from a `KeyboardEvent`, as used in `keys`           |
| `markModule(name, tag, key, inputType, alias?)`        | a complete inline mark module like `bold`                                        |
| `toggleMark(editor, tag, attributes?)`                 | toggles a mark on the selection, or stores it for the next typed text at a caret |
| `setMark(editor, tag, attributes \| null)`             | sets or removes a mark on the selected text                                      |
| `setMarkAtCaret(editor, tag, attributes \| null)`      | like `setMark`, and updates or removes the whole mark around a collapsed caret   |
| `isMarkActive(editor, tag)`, `activeMark(editor, tag)` | whether the selection is inside the mark (or it is stored), and the mark element |
| `setBlocks(editor, tag)`                               | turns the selected blocks into `tag`, or back into `p` when all already are      |
| `selectedLines(editor)`, `isLineActive(editor, test)`  | the blocks and list items of the selection, and whether all pass `test`          |
| `typeWithStoredMarks(event, editor)`                   | `onBeforeInput` handler that types with the marks `toggleMark` stored at a caret |

`markModule` already sets `onBeforeInput: typeWithStoredMarks`. A hand-written module that calls `toggleMark` sets it
itself, otherwise a mark toggled at a caret is shown as active but not applied to the typed text.

```ts
import { createEditor, defineModule } from '@einhasad-vue/vue-wysiwyg'
import { isLineActive, markModule, setBlocks } from '@einhasad-vue/vue-wysiwyg/helpers'

declare module '@einhasad-vue/vue-wysiwyg' {
  interface Commands {
    strike: undefined
    codeBlock: undefined
  }
}

const strike = () => markModule('strike', 's', 'Mod-Shift-x', 'formatStrikeThrough', 'strike')

const codeBlock = () =>
  defineModule({
    name: 'codeBlock',
    schema: { tags: { pre: { kind: 'block', attrs: [] } } },
    commands: {
      codeBlock: {
        run: (editor) => setBlocks(editor, 'pre'),
        isActive: (editor) => isLineActive(editor, (line) => line.localName === 'pre'),
      },
    },
  })

const editor = createEditor({ modules: [strike(), codeBlock()] })
editor.exec('strike')
editor.exec('codeBlock')
```

A module that contributes a block container tag (`pre`, `blockquote`, ...) or renames it keeps it; otherwise the
default schema maps it to `p`.
