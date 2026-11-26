# Markdown

`@einhasad-vue/vue-wysiwyg/markdown` converts between Markdown and the editor's HTML. It also has a module that turns Markdown typed into the editor into formatting.

```ts
import { createEditor } from '@einhasad-vue/vue-wysiwyg'
import {
  markdownFormat,
  markdownShortcuts,
  mdToHtml,
  htmlToMd,
} from '@einhasad-vue/vue-wysiwyg/markdown'
import { bold } from '@einhasad-vue/vue-wysiwyg/modules/bold'
import { heading } from '@einhasad-vue/vue-wysiwyg/modules/heading'

const editor = createEditor({
  format: markdownFormat,
  content: '# Title\n\nSome **bold** text',
  modules: [heading(), bold(), markdownShortcuts()],
})
editor.getValue()
editor.setValue('- one\n- two')
```

The dialect is a subset of CommonMark, not GFM. Anything outside the subset stays as text, so no input is ever lost or turned into markup you did not ask for.

## API

| Export                          | What it does                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mdToHtml(markdown, policy?)`   | Returns HTML built only from `p, br, h1-h6, ul, ol, li, strong, em, a[href]`. All text is HTML-escaped and every link goes through `safeUrl`. `policy` is a `UrlPolicy` (`{ urlSchemes, allowProtocolRelative }`, for example `editor.schema`); by default only `http, https, mailto, tel` and relative URLs pass. |
| `htmlToMd(html, { document? })` | Parses `html` in an inert document (pass `document` from linkedom or jsdom on a server) and writes Markdown. Markdown characters in the text are escaped.                                                                                                                                                          |
| `markdownFormat`                | `{ parse: mdToHtml, stringify: htmlToMd }` for `EditorOptions.format`. `getValue()` returns Markdown and `setValue()` accepts it. Empty content is `''`.                                                                                                                                                           |
| `markdownShortcuts()`           | An editor module that applies input rules while you type (see below). It is also exported as `@einhasad-vue/vue-wysiwyg/modules/markdown-shortcuts`.                                                                                                                                                               |

For other URL schemes, use your own format: `{ parse: (md) => mdToHtml(md, editor.schema), stringify: htmlToMd }`.

## Security

`mdToHtml` never passes HTML through. `<img src=x onerror=alert(1)>` in Markdown becomes the visible text `<img src=x onerror=alert(1)>`. A link whose URL `safeUrl` rejects, such as `javascript:`, `vbscript:`, `data:` or `//host`, keeps its text but loses the link. Link titles are parsed and then dropped, so a quote in a title can't escape the attribute.

The editor sanitizes again when it renders (`setValue`, `setHTML`, initial content). If you render `mdToHtml` output yourself, run `sanitize(html, { schema })` from `./sanitize` before `v-html` or `innerHTML`. The library's rule is to sanitize where HTML is rendered.

Parsing is linear in the input length. The block parser uses only anchored regular expressions, and the inline parser is a single pass with a delimiter stack. Tests feed 50k-repetition adversarial inputs (`*`, `_`, `[`, `[](`, `\`, `<`, `#`, nested lists and more). Each one must finish in under 100 ms, and doubling the input must take less than three times as long.

## Supported Markdown

| Syntax                                                                                                | HTML                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------- |
| Paragraphs separated by a blank line                                                                  | `p`                             |
| Soft line break (a single newline)                                                                    | a space                         |
| Hard line break: two or more trailing spaces, or `\` at the end of a line                             | `br`                            |
| `#` to `######` followed by a space (up to 3 leading spaces; closing `#`s are removed)                | `h1` to `h6`; `#` maps to `h1`  |
| `*em*`, `_em_`                                                                                        | `em`                            |
| `**strong**`, `__strong__`                                                                            | `strong`                        |
| `***both***`                                                                                          | `em` + `strong`                 |
| `[text](url)`, `[text](<url with spaces>)`, `[text](url "title")`                                     | `a href` (the title is dropped) |
| `-`, `*`, `+` items                                                                                   | `ul > li`                       |
| `1.` and `1)` items                                                                                   | `ol > li`                       |
| Nested lists: indent an item to the content column of its parent (2 spaces after `- `, 3 after `1. `) | nested `ul`/`ol` inside `li`    |
| Backslash escapes of ASCII punctuation, such as `\*`, `\#`, `\[`                                      | the literal character           |

Emphasis follows the CommonMark flanking rules. `_` does not work inside words (`snake_case` stays text), while `*` does (`a*b*c`).

## Not supported (kept as text or lossy)

| Input                                                                                                             | Result                                                         |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Raw HTML, autolinks `<https://x>`                                                                                 | escaped, shown as text                                         |
| Code spans and blocks, block quotes `>`, horizontal rules `---`                                                   | text (`---` stays a paragraph)                                 |
| Images `![alt](src)`                                                                                              | `!` followed by a link                                         |
| Setext headings (`===` / `---` underlines), indented code                                                         | paragraph text                                                 |
| Tables, task lists, strikethrough, footnotes, reference links                                                     | text                                                           |
| HTML entities such as `&amp;`                                                                                     | shown as written: `&amp;` stays `&amp;`                        |
| A different bullet (`-`, `*`, `+`) or delimiter (`.`, `)`) in the middle of a list                                | continues the same list instead of starting a new one          |
| Ordered list start numbers                                                                                        | dropped: lists always start at 1                               |
| Loose lists (blank lines between items)                                                                           | rendered tight; a paragraph inside an item joins the item text |
| Link destinations with more than 8 nested parentheses                                                             | text                                                           |
| A closer that can't pair with the nearest opener because of the CommonMark "multiple of 3" rule, such as `*a**b*` | text: the closer does not search further back                  |
| An emphasis closer inside an open `[` whose opener is before the `[`                                              | not paired                                                     |

`htmlToMd` loses some information:

| HTML                                                                                   | Markdown                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `u`, `span`, `code` and other inline tags                                              | their text                                                    |
| `script`, `style`, comments                                                            | removed                                                       |
| `div`, `section`, `blockquote` and similar                                             | their blocks, or a paragraph                                  |
| Text or other non-`li` children directly inside `ul`/`ol`                              | dropped                                                       |
| `br` inside a heading                                                                  | a space                                                       |
| Several spaces, tabs, newlines and `&nbsp;`                                            | one space                                                     |
| Empty paragraphs                                                                       | removed                                                       |
| `strong` around `em` (`<strong><em>a</em></strong>`)                                   | `***a***`, which parses back as `<em><strong>a</strong></em>` |
| Emphasis that ends in punctuation and is followed by a letter (`<strong>a.</strong>b`) | `**a.**b`, which CommonMark reads as literal asterisks        |
| Two adjacent lists of the same type                                                    | one list after the round trip                                 |

Leading and trailing spaces inside `strong`/`em` move outside the delimiters: `x<strong> a </strong>y` becomes `x **a** y`. A leading `-`, `+`, `1.` or `1)` on a line is escaped (`\-`, `1\.`), and the characters ``\ * _ ` [ ] < > #`` are always escaped.

## Shortcuts module

`markdownShortcuts()` acts on `beforeinput insertText`. It never runs during IME composition or in readonly mode.

| You type                                                   | Result                                               | Needs     |
| ---------------------------------------------------------- | ---------------------------------------------------- | --------- |
| `#` to `######`, then a space, at the start of a paragraph | heading of that level (only if the level is allowed) | `heading` |
| `-`, `*` or `+`, then a space                              | bullet list                                          | `lists`   |
| `1.` or `1)`, then a space                                 | ordered list                                         | `lists`   |
| `**text*` and then `*`                                     | `strong`                                             | `bold`    |
| `*text` and then `*`                                       | `em`                                                 | `italic`  |

- Rules whose command is not registered do nothing, and the character is typed normally.
- Block rules apply only in a top-level paragraph, with the marker at the very start.
- Mark rules need non-empty text without leading or trailing spaces, inside one text node. They don't apply when the text already has that mark.
- The first character typed right after a new mark goes after the mark, so typing doesn't continue inside it.
- With the `history` module, one undo (`Mod-z`) restores the typed marker, for example `##`. The space or `*` that triggered the rule is not restored.
