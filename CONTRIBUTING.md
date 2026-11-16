# Contributing

Thanks for your interest. This document describes the local setup, the checks a pull request must pass, the project
rules and the manual device checklist.

## Local setup

```sh
git clone https://github.com/einhasad/vue-wysiwyg.git
cd vue-wysiwyg
npm ci
npm run dev        # e2e fixture page: http://localhost:5174/e2e/fixture/index.html?modules=bold,lists
npm run demo       # demo app
```

The fixture page loads modules from `?modules=a,b` (file names in `src/modules`) and module options from
`?options=<json>` keyed by the factory name (`{"characterCount":{"limit":10}}`), and exposes the editor as `window.editor`.

## Before opening a pull request

CI runs the same commands on Node 20, 22 and 24:

```sh
npm run lint            # ESLint, 0 warnings
npm run format:check    # Prettier
npm run typecheck       # vue-tsc
npm run test:coverage   # Vitest + coverage thresholds
npm run size            # build + size-limit
npm run test:e2e        # Playwright on Chromium, Firefox and WebKit
```

While working, run only what you touch: `npx vitest run src/__tests__/modules/lists`,
`npx playwright test e2e/lists.spec.ts`.

## Rules

- **Size budgets**: every entry in `size/*.json` is a ceiling. A pull request never raises one to make CI green; if a
  change needs more bytes, say how many and why in the pull request.
- **Coverage**: 100% statements, branches, functions and lines for `src/core`, `src/sanitize`, `src/normalize` and
  `src/markdown`; 95% everywhere else.
- **Tests are not weakened** to pass: no skips, no looser assertions.
- **Security**: HTML reaches the live editor DOM only through the sanitizing paths (`setHTML`, initial content,
  paste, drop). Parse untrusted HTML only in an inert document (`document.implementation.createHTMLDocument`). Every
  URL goes through `safeUrl`. A new render path needs tests from `src/__tests__/security/vectors.test.ts`.
- **No `execCommand`**, and no `preventDefault` on `insertCompositionText`.
- **Code**: TypeScript strict, ESM, relative imports with `.js` extensions, no runtime dependencies. Names explain the
  code; no explanatory comments. Vue components are render-function `.ts` files (smaller than compiled SFCs).
- **Modules** live in `src/modules/<name>.ts`, export a camelCase factory with the file name (`character-count.ts`
  exports `characterCount`), and are added to the `src/modules/index.ts` barrel and `docs/modules.md`.
- **Docs**: TypeScript and Vue code blocks in `README.md` and `docs/*.md` are type-checked by
  `src/__tests__/docs/snippets.test.ts`, so keep them complete and compilable.
- **Changelog**: add a line under `[Unreleased]` in `CHANGELOG.md`.

## Manual device and IME checklist

Automated tests cannot drive real mobile keyboards and IMEs. Run this list on real devices before a release that
touches `src/core`, `src/normalize`, `lists`, `heading`, `history`, `markdownShortcuts` or `characterCount`, and paste
the results into the pull request (device, OS, browser, keyboard, pass/fail).

Devices: Android (Chrome + Gboard, Chrome + Samsung Keyboard), iOS Safari (system keyboard), desktop with a Japanese or
Chinese IME (macOS and Windows).

1. Type a sentence with autocorrect on; accept a suggestion from the suggestion bar. The text is correct, no letters
   are doubled or lost, the caret stays at the end.
2. Swipe or glide typing (Gboard): words appear once, with one space between them.
3. Voice dictation: the dictated text appears once and the caret ends after it.
4. Backspace across a word that is still underlined (in composition): only the expected letters are deleted.
5. Enter in the middle of a word on Android: the paragraph splits at the caret and no text is duplicated.
6. Shift+Enter or the keyboard's line-break key, where available: a line break, not a new paragraph.
7. Japanese or Chinese IME: compose a word, change candidates, confirm with Enter. Only the confirmed text is inserted,
   and Enter during composition does not create a paragraph.
8. Compose inside bold text and inside a list item: the formatting is kept and the list item is not split.
9. Undo (`Mod-z` or the toolbar) right after composition: the whole composed word is undone in one step.
10. `characterCount` with a limit: composing past the limit reverts to the last valid text when composition ends.
11. Markdown shortcuts (`# `, `- `, `1. `, `**bold**`) typed with the mobile keyboard apply once.
12. Long-press text selection, then the toolbar Bold button: the selection is kept and becomes bold.
13. Paste from the system clipboard (long press, Paste): the content is sanitized and the caret is after it.
14. Readonly: the keyboard can select and copy text but can not change it.
15. Screen reader (VoiceOver on iOS, TalkBack on Android): the editor is announced as an editable text field with its
    label, and toolbar buttons announce their pressed state.

## Commit messages

Short imperative subject line under 72 characters, for example `Add strike module`. The body is optional.

## Reporting security issues

See [SECURITY.md](./SECURITY.md). Do not open public issues for vulnerabilities.
