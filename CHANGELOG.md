# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Replacing the content from outside (`setHTML`/`setValue` without `{ history: true }`, or a new `v-model` value on `WysiwygEditor`) starts a new undo history: undo and redo are cleared, so `Mod-z` can no longer bring back content of the replaced document. If the outside change restores exactly the state before the last step, only that step is dropped. Pass `setHTML(html, { history: true })` / `setValue(value, { history: true })` to make an outside change undoable.
- Undo and redo emit `update` (and `WysiwygEditor` emits `update:modelValue`) once instead of twice; `exec` no longer emits a second `update` when the command already committed through `setHTML` or `transact`. Nothing to do unless you counted two events per undo or redo.

### Fixed

- `characterCount`: an IME composition reverted because it ended over the limit no longer leaves an empty undo step.

## [0.1.2] - 2026-11-17

### Fixed

- A mark turned off (or on) on a collapsed caret survives Enter: after `Mod-b` off at the end of bold text, the new paragraph or list item is typed plain and the toolbar `aria-pressed` stays off; the same for italic and underline.

## [0.1.1] - 2026-11-17

### Fixed

- The demo and README sanitize stored HTML with the editor schema (`sanitize(html, { schema })`); the default schema keeps only `p` and `br`.
- The editor emits `selection` once when the selection leaves it (another input, the page), so `isActive` and the toolbar `aria-pressed` turn off; in Firefox the editor selection is dropped when the focus moves into an outside text field, as in Chrome and Safari.

## [0.1.0] - 2026-11-16

### Added

- `link` module: `link` command (a URL, or `null` to remove) that passes every URL through `safeUrl`, fixed `rel="noopener noreferrer nofollow"`, optional `target`, `onShortcut` for `Mod-k`, and `linkHref(editor)` for link dialogs. The link popover turns a bare domain such as `example.com` into `https://example.com`.
- `paste` module: Word (Windows and Mac) `mso-list` paragraphs become nested `ul`/`ol`, Google Docs wrappers and inline styles become `strong`/`em`/`u`, `Mod-Shift-v` pastes plain text, plain text with blank lines becomes paragraphs, and a pasted or dropped `text/uri-list` becomes a link through `safeUrl`.
- `./markdown` subpath: `mdToHtml`, `htmlToMd` and `markdownFormat` for `v-model` in Markdown. CommonMark subset with linear-time parsing; raw HTML in Markdown stays text and unsafe link URLs are dropped. Lossy cases are documented in `docs/markdown.md`.
- `markdownShortcuts` module (`./markdown` and `./modules/markdown-shortcuts`): `#`, `-`, `1.` block shortcuts and `**bold**`, `*italic*` while typing.
- `./theme` subpath: `EditorToolbar` (WAI-ARIA toolbar with roving tabindex, Alt+F10 and Escape, `aria-pressed`/`aria-disabled`, `messages` prop, `#icon` slot), `LinkPopover` and `defaultMessages`.
- `./theme.css`: zero-specificity `:where()` styles with `--vw-*` variables and dark mode (`prefers-color-scheme`, `.vw-dark`, `.dark`, `[data-theme='dark']`).
- `./modules` barrel with every module and `starterKit(options)` (bold, italic, underline, heading, lists, link, history, paste, placeholder; `false` leaves a module out). Tree-shakeable: importing one module from the barrel costs the same as from its own file.
- `./helpers` subpath for custom modules: `keyOf`, `normalizeKeySpec`, `markModule`, `toggleMark`, `setMark`, `setMarkAtCaret`, `isMarkActive`, `activeMark`, `typeWithStoredMarks`, `setBlocks`, `selectedLines`, `isLineActive` and the `MarkAttributes` type.
- `lists({ types })` option: `lists({ types: ['ul'] })` offers bulleted lists only, a loaded or pasted list of the missing type becomes the listed one, and `EditorToolbar` shows only the available buttons. `starterKit({ lists })` passes it through.
- Stored marks: `Mod-b`, `Mod-i`, `Mod-u` and the toolbar buttons on a collapsed caret apply to the next typed text (start typing bold, or leave bold at the end of a bold run); `isActive` and `aria-pressed` follow the stored mark.
- Default accessible name `"Rich text editor"` on the editor root and `WysiwygEditor` when no `label`, `aria-label` or `aria-labelledby` is given; `WysiwygEditor` gets a `labelledby` prop.
- Demo app in `demo/`, deployed to GitHub Pages at https://einhasad.github.io/vue-wysiwyg/, with a smoke page `npm.html` that runs the published package from a CDN.
- Documentation: README with quick starts, module sizes, security, rendering stored HTML, SSR/Nuxt, theming, accessibility, performance and browser support; `docs/modules.md`; `CONTRIBUTING.md` with a manual device and IME checklist. README and docs code snippets are type-checked in the test suite.
- Size gates for every new entry, plus `starter` (core + `starterKit`), `./helpers` and `all`.

### Changed

- Module state is kept per editor: one module instance or one `starterKit()` array can be shared by several editors (`history` stacks, `characterCount`, `markdownShortcuts`, `paste` plain mode). `characterCount().count(editor?)` and `words(editor?)` take the editor to count.
- `history`: a transaction that runs other commands (for example the link popover inserting and linking a URL) is one undo step.
- `WysiwygEditor` emits `update:modelValue` only after a user edit, not when loading a value or when an external value normalizes differently.
- A readonly editor stays focusable (`tabindex="0"` unless the element has its own) so it can be read and copied with the keyboard.
- `destroy()` restores the attributes the element had before (`role`, `aria-*`, `contenteditable`, `tabindex`, `style`); API calls after `destroy()` do nothing.
- `Format.parse(input, schema?)` receives the editor schema, so `markdownFormat` follows the editor's `urlSchemes` and `allowProtocolRelative`.
- The package ships no source or declaration maps and includes `CHANGELOG.md` and `SECURITY.md`.
- CI runs on Node 22 and 24; publishing runs the unit, size, e2e and demo e2e checks first.

### Fixed

- Block boundaries are kept on paste and `setHTML`: blocks inside `div` or inline wrappers (Gmail, Outlook, web pages, Google Docs `<b>` wrappers) and a list item with several paragraphs no longer glue their words together.
- Pretty-printed source whitespace in loaded or pasted HTML is collapsed, so the editor shows what a rendered page shows.
- `setHTML` and `setValue` keep the caret where it was instead of moving it to the start.
- A heading toggled into a list keeps its heading level when it leaves the list again (toggle, `Shift-Tab`, `Enter`).
- `Tab` in a list item that can not be indented (the first item) is left to the browser, so keyboard focus can leave the editor.
- `Alt+F10` no longer throws when the toolbar has no buttons.
- A pasted table (Excel, Google Sheets, web pages) becomes one paragraph per row with tabs between cells instead of one run of glued cells.
- The placeholder hides as soon as IME composition starts instead of overlapping the composed text.
- An external drop after an internal drag whose `dragend` never reached the editor is sanitized.
- Normalizing works when `document.getSelection()` returns `null`.

### Security

- `safeUrl` trims in linear time (no ReDoS on long whitespace runs) and rejects `javascript:` prefixed by invisible characters such as U+00A0 and U+FEFF.
- The `paste` module source line-break regex runs in linear time.
- When several modules contribute the same tag, the schema rules merge: a later module can not drop the URL check or the fixed `rel` of an earlier one.
- `href`, `src` and `action` are always URL-checked, even when a module does not list them in `urlAttrs`; `srcset` can not be allowed.
- `javascript:`, `vbscript:` and `data:` can not be enabled through `urlSchemes`.
- `htmlToMd` caps the nesting depth (128, like the sanitizer), so deeply nested input can not overflow the stack.
- `SECURITY.md`: an external sanitizer used in place of the built-in one must parse inertly (`DOMParser`, DOMPurify), never through live `innerHTML` or `createContextualFragment`.
- Commands never read or change DOM outside the editor root, even when the document selection is elsewhere.
- The Markdown XSS vectors (`javascript:` links and autolinks, raw HTML, title quote breakout) and the paste vectors (`text/html` payloads through the Word and Google Docs cleanup, `text/uri-list` with `javascript:` variants) are tested against `mdToHtml`, `markdownFormat` and the `paste` and `link` modules.

## [0.0.1] - 2026-11-16

First preview release for integration testing; link, paste, Markdown and the default theme are not included yet.

### Added

- Headless core `createEditor` on a `contenteditable` root: schema-driven in-place normalization, command registry with typed `Commands`, keymap, `beforeinput` routing, sanitized paste and drop, line breaks, readonly mode, selection paths, events.
- `./sanitize` subpath (call it before `v-html`/`innerHTML` when displaying stored HTML): allow-list sanitizer that rebuilds fresh nodes from an inert parse, `safeUrl` URL policy, `createSchema`.
- `./normalize` subpath: `normalizeHTML`, `isEmptyHTML`, `normalizeElement`.
- `bold` and `italic` modules (`Mod-b`, `Mod-i`, `formatBold`, `formatItalic`).
- `underline`, `heading` (levels configurable), `lists` (bullet/ordered, indent/outdent), `history` (undo/redo), `placeholder` and `characterCount` modules.
- `./vue` subpath: `useEditor`, `useEditorState`, `EditorContent` and `WysiwygEditor` with `v-model` (emits `''` when empty, keeps the caret on echoed values), SSR safe.

[Unreleased]: https://github.com/einhasad/vue-wysiwyg/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/einhasad/vue-wysiwyg/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/einhasad/vue-wysiwyg/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/einhasad/vue-wysiwyg/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/einhasad/vue-wysiwyg/releases/tag/v0.0.1
