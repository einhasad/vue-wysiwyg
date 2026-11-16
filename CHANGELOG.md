# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-11-16

First preview release for integration testing; link, paste, Markdown and the default theme are not included yet.

### Added

- Headless core `createEditor` on a `contenteditable` root: schema-driven in-place normalization, command registry with typed `Commands`, keymap, `beforeinput` routing, sanitized paste and drop, line breaks, readonly mode, selection paths, events.
- `./sanitize` subpath (call it before `v-html`/`innerHTML` when displaying stored HTML): allow-list sanitizer that rebuilds fresh nodes from an inert parse, `safeUrl` URL policy, `createSchema`.
- `./normalize` subpath: `normalizeHTML`, `isEmptyHTML`, `normalizeElement`.
- `bold` and `italic` modules (`Mod-b`, `Mod-i`, `formatBold`, `formatItalic`).
- `underline`, `heading` (levels configurable), `lists` (bullet/ordered, indent/outdent), `history` (undo/redo), `placeholder` and `characterCount` modules.
- `./vue` subpath: `useEditor`, `useEditorState`, `EditorContent` and `WysiwygEditor` with `v-model` (emits `''` when empty, keeps the caret on echoed values), SSR safe.
