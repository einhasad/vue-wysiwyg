# @einhasad-vue/vue-wysiwyg

Tiny, modular, XSS-safe WYSIWYG editor for Vue 3 with a headless core and Markdown and HTML input and output.

**[Live demo](https://einhasad.github.io/vue-wysiwyg/)** ·
[CDN smoke test](https://einhasad.github.io/vue-wysiwyg/npm.html) · [Modules](./docs/modules.md) ·
[Markdown](./docs/markdown.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

> Status: pre-1.0. The API can change between minor versions; breaking changes are listed in the changelog.

## Why

- **Small**: the headless core is 4.97 kB gzipped (under 5 kB), a typical editor (core + `starterKit`) is 8.9 kB,
  and modules you do not import cost 0 bytes. Every size is gated in CI.
- **Safe**: all HTML that reaches the live editor DOM (initial content, `setHTML`, paste, drop, undo) goes through an
  allow-list sanitizer that rebuilds fresh nodes. Every link passes one URL policy.
- **Native typing**: the DOM is the model. Typing, IME, spellcheck and autocorrect stay with the browser; the editor
  only normalizes the result against a schema. No `document.execCommand`.
- **Modular**: bold, italic, underline, headings, lists, links, history, paste cleanup, placeholder, character count,
  Markdown, the Vue binding and the theme are separate imports.
- **Markdown and HTML**: `v-model` holds HTML or Markdown (CommonMark subset), and `''` when the editor is empty.
- **MIT**: no API key, no telemetry, no cloud, zero runtime dependencies.

## Why not

- You need tables, images, collaboration, mentions, comments or track changes. These are non-goals for v1.
- You need a JSON document model or complete GFM Markdown. Look at Tiptap, Lexical or Milkdown.
- You need Vue 2 or old browsers (see [Browser support](#browser-support)).
- You edit very long documents. Every keystroke normalizes the whole document: about 4-10 ms per keystroke at 3000
  paragraphs on a desktop CPU, and several times more on a mid-range phone. Documents of a few hundred paragraphs
  stay well under a frame.

## Install

```sh
npm install @einhasad-vue/vue-wysiwyg
```

`vue` ^3.5 is a peer dependency, needed only by the `./vue` and `./theme` subpaths.

The package is ESM only (Node 20 or newer). The [live demo](https://einhasad.github.io/vue-wysiwyg/)
runs the current source; the [CDN smoke test](https://einhasad.github.io/vue-wysiwyg/npm.html) loads the published
package from jsDelivr without a build step (`?v=<version>` picks a version, `latest` by default).

## Quick start: Vue component

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { EditorToolbar } from '@einhasad-vue/vue-wysiwyg/theme'
import { WysiwygEditor } from '@einhasad-vue/vue-wysiwyg/vue'
import '@einhasad-vue/vue-wysiwyg/theme.css'

const body = ref('<p>Hello <strong>world</strong></p>')
const modules = starterKit({
  heading: { levels: [2, 3] },
  placeholder: { text: 'Write something' },
})
</script>

<template>
  <WysiwygEditor v-model="body" class="vw-editor" :modules="modules" label="Article" name="body">
    <template #toolbar="{ editor }">
      <EditorToolbar :editor="editor" />
    </template>
  </WysiwygEditor>
</template>
```

`WysiwygEditor` props: `v-model` (string, `''` when empty), `modules`, `format` and `sanitizer` (read once on mount),
`readonly`, `label` (the accessible name) and `name` (renders a hidden input for native form posts). It emits `focus`
and `blur` and exposes `editor`. An echoed `v-model` value does not reset the content, so the caret never jumps.

## Quick start: headless

Your own toolbar in Vue, with `useEditor`, `useEditorState` and `EditorContent`:

```vue
<script setup lang="ts">
import { bold, history, italic } from '@einhasad-vue/vue-wysiwyg/modules'
import { EditorContent, useEditor, useEditorState } from '@einhasad-vue/vue-wysiwyg/vue'

const editor = useEditor({
  content: '<p>Notes</p>',
  modules: [bold(), italic(), history()],
  label: 'Notes',
})
const isBold = useEditorState(editor, (current) => current.isActive('bold'))
</script>

<template>
  <button type="button" :aria-pressed="isBold" @mousedown.prevent @click="editor?.exec('bold')">
    Bold
  </button>
  <EditorContent :editor="editor" />
</template>
```

Without Vue, on any element:

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'

const editor = createEditor({
  element: document.querySelector<HTMLElement>('#editor') ?? undefined,
  content: '<p>Hello</p>',
  modules: starterKit(),
  label: 'Description',
})

editor.on('update', () => {
  console.log(editor.getHTML())
})
editor.exec('heading', 2)
editor.exec('bold')
editor.destroy()
```

Editor API: `getHTML`/`setHTML(html, { history })`, `getValue`/`setValue(value, { history })` (in the editor `format`;
without `history: true` an outside change clears undo/redo), `isEmpty`, `textLength`,
`exec(name, arg)`, `can(name)`, `isActive(name, arg)`, `transact(fn)`, `selection.save`/`restore`, `setReadonly`,
`focus`, `on(event, listener)` (`update`, `selection`, `focus`, `blur`, `keydown`, `beforeChange`, `readonly`,
`destroy`) and `destroy`. Command names and arguments are typed: `exec('heading', 2)` compiles, `exec('nope')` does not.

## Modules

Import from the `@einhasad-vue/vue-wysiwyg/modules` barrel or one file at a time from
`@einhasad-vue/vue-wysiwyg/modules/<name>`; the barrel is tree-shakeable, so both cost the same.
`starterKit(options)` returns the first nine modules below. Pass `false` to leave one out, or the module options:
`starterKit({ underline: false, link: { target: '_blank' } })`.

| Module                           | Commands and keys                                                            | Core + module, gzip     |
| -------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `bold()`                         | `bold`, `Mod-b`                                                              | 5.9 kB                  |
| `italic()`                       | `italic`, `Mod-i`                                                            | +0.03 kB next to `bold` |
| `underline()`                    | `underline`, `Mod-u`                                                         | 5.9 kB                  |
| `heading({ levels })`            | `heading` (level 1-6), `Mod-Alt-1` to `Mod-Alt-6`                            | 5.5 kB                  |
| `lists({ types })`               | `bulletList`, `orderedList`, `indentList`, `outdentList`, `Tab`, `Shift-Tab` | 6.2 kB                  |
| `link({ target, onShortcut })`   | `link` (a URL, or `null` to remove), `Mod-k`                                 | 5.8 kB                  |
| `history({ depth, groupDelay })` | `undo`, `redo`, `Mod-z`, `Mod-Shift-z`, `Mod-y`                              | 5.4 kB                  |
| `paste()`                        | Word and Google Docs cleanup, `Mod-Shift-v` plain paste, URL to link         | 5.9 kB                  |
| `placeholder({ text })`          | `data-placeholder`, `aria-placeholder`, `is-empty` class                     | 5.1 kB                  |
| `characterCount({ limit })`      | `count()`, `words()`; blocks typing and truncates paste over `limit`         | 5.5 kB                  |
| `markdownShortcuts()`            | `# `, `- `, `1. `, `**bold**`, `*italic*` while typing                       | 5.6 kB                  |

| Entry                                | gzip    |
| ------------------------------------ | ------- |
| core `createEditor`                  | 4.97 kB |
| core + `starterKit()`                | 8.9 kB  |
| core + `./vue`                       | 5.7 kB  |
| core + `./vue` + `./theme`           | 7.2 kB  |
| `theme.css`                          | 0.8 kB  |
| `./sanitize` `sanitize`              | 1.7 kB  |
| `./markdown` `mdToHtml` + `htmlToMd` | 2.4 kB  |
| everything                           | 14.3 kB |

Sizes are measured with size-limit (esbuild, minified, gzip, `vue` excluded). Options, commands, keys and behavior of
every module are in [docs/modules.md](./docs/modules.md), including how to write your own with `defineModule`.

## Markdown

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { htmlToMd, markdownFormat, mdToHtml } from '@einhasad-vue/vue-wysiwyg/markdown'
import { markdownShortcuts, starterKit } from '@einhasad-vue/vue-wysiwyg/modules'

const editor = createEditor({
  format: markdownFormat,
  content: '# Title\n\nSome **bold** text',
  modules: [...starterKit(), markdownShortcuts()],
})

editor.getValue() // '# Title\n\nSome **bold** text'
editor.getHTML() // '<h1>Title</h1><p>Some <strong>bold</strong> text</p>'
htmlToMd(mdToHtml('- one\n- two')) // '- one\n- two'
```

With `<WysiwygEditor :format="markdownFormat">` the `v-model` holds Markdown. The dialect is a CommonMark subset
(paragraphs, line breaks, ATX headings, strong, em, links, nested lists, escapes), and everything else stays text. Raw
HTML in Markdown is never passed through, and parsing is linear in the input length. Lossy cases are listed in
[docs/markdown.md](./docs/markdown.md).

## Security: sanitize where HTML is rendered

The rule is **protect at render**: HTML is sanitized exactly where it is inserted into a live DOM.

- The editor sanitizes everything it renders into its own `contenteditable`: initial content, `setHTML`/`setValue`
  (Markdown too), paste, drop and history restore. Links go through `safeUrl`, which allows only `http`, `https`,
  `mailto`, `tel` and relative URLs by default.
- **`getHTML` is not re-sanitized.** It serializes the editor DOM, which is already clean. Stored HTML is untrusted
  when you display it later: it may have been changed in the database, by an API client or by another app.
- **Sanitize at render: call `sanitize(html, { schema })` before `v-html`/`innerHTML`.**

```ts
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { createSchema, sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'

const schema = createSchema(starterKit())

export function renderArticle(element: HTMLElement, storedHtml: string): void {
  element.innerHTML = sanitize(storedHtml, { schema })
}

sanitize('<p onclick="x()">safe</p><script>alert(1)</script>', { schema }) // '<p>safe</p>'
```

```vue
<script setup lang="ts">
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { createSchema, sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'

const props = defineProps<{ body: string }>()
const schema = createSchema(starterKit())
</script>

<template>
  <article v-html="sanitize(props.body, { schema })" />
</template>
```

Pass the schema of the editor that wrote the HTML (`createSchema(modules)` or `editor.schema`), so the allowed
formatting survives and nothing else does. To add DOMPurify, pass the editor option
`sanitizer: (html) => DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })`; the built-in allow-list still runs
after it. The threat model, the sanitizer guarantees and how to report a vulnerability are in
[SECURITY.md](./SECURITY.md).

## Rendering stored HTML

The output of `getHTML` is meant to be rendered the way the editor shows it. Three rules keep the page and the editor
the same:

- **Sanitize before `v-html`/`innerHTML`** with the schema of the editor that wrote the HTML (see the section above).
  Elements outside the schema are unwrapped and their text kept; `div` becomes `p`, `b` becomes `strong` and `i`
  becomes `em`; a wrapper around paragraphs is removed so the paragraphs stay separate.
- **Whitespace**: the editor root uses `white-space: pre-wrap`, so spaces the user typed are kept, including double
  spaces and spaces at the end of a line. Render the output with the same rule, or double spaces collapse on the page.
  Pretty-printed source HTML is not affected: when HTML enters the editor (initial content, `setHTML`, paste), a
  whitespace run that contains a line break becomes one space, and it is removed at the start and end of a block.
- **Links**: `rel="noopener noreferrer nofollow"` is a fixed attribute of every link and can not be removed by
  content. `link({ target: '_blank' })` (or `starterKit({ link: { target: '_blank' } })`) adds a fixed `target` to
  every link; without it a `target` in stored HTML is dropped.

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'

const editor = createEditor({ modules: starterKit({ link: { target: '_blank' } }) })

export function renderStored(element: HTMLElement, storedHtml: string): void {
  element.style.whiteSpace = 'pre-wrap'
  element.innerHTML = sanitize(storedHtml, { schema: editor.schema })
}

sanitize('<div><p>a</p><p>b</p></div>', { schema: editor.schema }) // '<p>a</p><p>b</p>'
```

## SSR and Nuxt

- Every subpath evaluates without a DOM. `./vue` and `./theme` touch the DOM only after mount.
- On the server `WysiwygEditor` and `EditorContent` render an empty host, never the model HTML. The editor is created
  in `onMounted` on the client, so no `<ClientOnly>` wrapper is needed.
- To sanitize on the server, pass any `Document` implementation, such as linkedom or jsdom:

```ts
import { starterKit } from '@einhasad-vue/vue-wysiwyg/modules'
import { createSchema, sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'
import { parseHTML } from 'linkedom'

const { document } = parseHTML('<!doctype html><html><body></body></html>')
const schema = createSchema(starterKit())

export const sanitizeOnServer = (html: string): string => sanitize(html, { schema, document })
```

In Nuxt, add `css: ['@einhasad-vue/vue-wysiwyg/theme.css']` to `nuxt.config.ts` and use the components as in the
quick start.

## Theming

`theme.css` is optional. It styles the editor, the toolbar and the link popover inside an element with the
`vw-editor` class. All selectors use `:where()` (zero specificity), so any rule of yours wins. Override the variables:

```css
.vw-editor {
  --vw-accent: #7c3aed;
  --vw-radius: 0;
  --vw-min-height: 12rem;
}
```

Variables: `--vw-bg`, `--vw-fg`, `--vw-muted`, `--vw-border`, `--vw-accent`, `--vw-pressed-bg`, `--vw-hover-bg`,
`--vw-readonly-bg`, `--vw-error`, `--vw-focus-ring`, `--vw-radius`, `--vw-gap`, `--vw-padding`, `--vw-min-height`,
`--vw-font`.

Dark mode follows `prefers-color-scheme`. `.vw-dark` on the editor, or `.dark` or `[data-theme='dark']` on an
ancestor, forces it; `.vw-light` opts out of the system dark mode. Toolbar labels come from `defaultMessages` and are
replaced through the `messages` prop (i18n). Icons are replaced through the `#icon` slot.

## Accessibility

- The editor root is `role="textbox"` with `aria-multiline`, `aria-label` (from `label`; "Rich text editor" when no
  label is given and the element has no `aria-label`), `aria-readonly` and `aria-placeholder`. A readonly editor
  keeps `tabindex="0"`, so it can still be reached with Tab to read and copy.
- `EditorToolbar` follows the WAI-ARIA toolbar pattern: one tab stop, roving `tabindex`, ArrowLeft, ArrowRight, Home
  and End, `aria-pressed` and `aria-disabled` from the editor state, and `aria-controls` pointing to the editor.
  Alt+F10 in the editor moves focus to the toolbar and Escape returns it; there is no keyboard trap.
- The link popover (`Mod-k` or the link button) is a labelled group. An unsafe URL is reported with `aria-invalid`
  and a described error message.
- Toolbar buttons do not take the editor selection away (`mousedown` is prevented).
- The e2e suite runs axe on the themed editor in light, dark, readonly and popover states, with 0 violations.

## Browser support

Current Chrome, Edge, Firefox and Safari, desktop and iOS. The build targets ES2022 and needs Input Events Level 2
(`beforeinput`): about Chrome and Edge 94+, Firefox 93+ and Safari 16.4+. Every change runs the e2e tests on Chromium,
Firefox and WebKit. Android keyboards and IMEs are checked by hand with the device checklist in
[CONTRIBUTING.md](./CONTRIBUTING.md); composition input is never cancelled, and the DOM is not normalized while
composing.

## Comparison

| Editor (gzip, typical setup) | Model                  | Sanitizer built in      | Markdown in/out | Vue 3 binding | License      |
| ---------------------------- | ---------------------- | ----------------------- | --------------- | ------------- | ------------ |
| **vue-wysiwyg** (8.9 kB)     | DOM + schema normalize | allow-list rebuild, URL | built in        | official      | MIT          |
| Tiptap 3 (124 kB)            | ProseMirror document   | schema only             | extension       | official      | MIT          |
| Lexical (83 kB)              | own editor state       | node types only         | package         | community     | MIT          |
| Quill 2 (60 kB)              | Delta and blots        | format allow-list       | no              | community     | BSD-3-Clause |
| Squire (18.5 kB)             | DOM                    | bring your own          | no              | no            | MIT          |
| Pell (1.6 kB)                | DOM + `execCommand`    | no                      | no              | Vue 2 only    | MIT          |

Competitor sizes were measured on 2026-11-16 with esbuild (bundled, minified) and gzip -9: Tiptap with StarterKit,
Lexical with rich-text, history, html and list. Choose a model-based editor when you need tables, collaboration or a
JSON document.

## License

[MIT](./LICENSE). No API key, no telemetry, no paid tier.
