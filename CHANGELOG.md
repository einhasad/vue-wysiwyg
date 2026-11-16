# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Headless core `createEditor` on a `contenteditable` root: schema-driven in-place normalization, command registry with typed `Commands`, keymap, `beforeinput` routing, sanitized paste and drop, line breaks, readonly mode, selection paths, events.
- `./sanitize` subpath (call it before `v-html`/`innerHTML` when displaying stored HTML): allow-list sanitizer that rebuilds fresh nodes from an inert parse, `safeUrl` URL policy, `createSchema`.
- `./normalize` subpath: `normalizeHTML`, `isEmptyHTML`, `normalizeElement`.
- `bold` and `italic` modules (`Mod-b`, `Mod-i`, `formatBold`, `formatItalic`).
