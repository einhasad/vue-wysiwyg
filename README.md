# @einhasad-vue/vue-wysiwyg

Tiny, modular, XSS-safe WYSIWYG editor for Vue 3 with a headless core and Markdown and HTML input and output.

> Status: pre-release, under active development. Not published to npm yet.

## Why

- **Small**: the headless core is under 5 KB gzipped, and features you do not import cost nothing.
- **Safe**: every HTML input and output path goes through an allow-list sanitizer that rebuilds fresh nodes.
- **Native typing**: the DOM is the model, so IME, spellcheck and autocorrect stay with the browser.
- **Modular**: bold, italic, headings, lists, links, history, paste cleanup, Markdown and the Vue binding are opt-in.
- **MIT**, no API key, no telemetry.

## Install

```sh
npm install @einhasad-vue/vue-wysiwyg
```

## Usage (headless)

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { italic } from '@einhasad-vue/vue-wysiwyg/modules/italic'

const editor = createEditor({
  element: document.querySelector('#editor') as HTMLElement,
  content: '<p>Hello <strong>world</strong></p>',
  modules: [bold(), italic()],
  label: 'Description',
})

editor.on('update', () => console.log(editor.getHTML()))
editor.exec('bold')
```

`getHTML()` returns `''` when the editor is empty.

## Security: sanitize where HTML is rendered

The editor sanitizes everything it inserts into its own live DOM: initial content, `setHTML`/`setValue`, paste, drop
and history restore. `getHTML()` serializes that already-clean DOM and does not sanitize again.

Stored HTML is untrusted when you display it later (it may have been changed in the database or sent by another
client). **Always call `sanitize()` before `v-html` or `innerHTML`:**

```ts
import { sanitize } from '@einhasad-vue/vue-wysiwyg/sanitize'

sanitize('<p onclick="x()">safe</p><script>alert(1)</script>') // '<p>safe</p>'
```

```vue
<div v-html="sanitize(article.body, { schema })" />
```

Pass the same `schema` your editor uses (`createSchema(modules)` from `./sanitize`, or `editor.schema`) so allowed
formatting survives. Pass `{ document }` to sanitize on the server with linkedom or jsdom. See [SECURITY.md](./SECURITY.md).

## Non-goals (v1)

Tables, collaboration, mentions, image upload and Word import.

## License

[MIT](./LICENSE)
