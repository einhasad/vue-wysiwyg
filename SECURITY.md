# Security Policy

## Supported versions

Only the latest `0.x` release receives security fixes during the pre-1.0 period.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.
Use GitHub private vulnerability reporting ("Report a vulnerability" on the Security tab) with:

- a short description of the problem,
- the payload and the editor setup (modules, options) that trigger it, and
- the package version and browser affected.

You should get an acknowledgement within 72 hours. A fix and coordinated disclosure will follow.

## Threat model

Protection happens at render time: HTML is sanitized exactly where it is inserted into a live DOM.

- Inside the editor: initial content, `setHTML`/`setValue`, paste, drop and history restore are sanitized before they
  reach the `contenteditable` root. Markdown import goes through `setHTML`, so it is sanitized there.
- Export: `getHTML`/`getValue` serialize the editor DOM, which is already clean; they do not sanitize again.
  Normalization keeps the markup consistent, it is not a security step.
- Outside the editor: stored HTML is untrusted when displayed. Consumers must call `sanitize(html, { schema })`
  before `v-html`/`innerHTML`.

`sanitize` and `normalizeHTML` return only tags and attributes allowed by the schema, and every URL attribute passed `safeUrl`.

## Sanitizer guarantees

- Input is parsed in an inert document; the live document never parses untrusted HTML.
- Output is a rebuilt tree of fresh nodes. Nothing is filtered in place and the result is never re-parsed inside the sanitizer.
- Only HTML-namespace elements whose tag is in the schema are kept; SVG, MathML, comments and processing instructions are removed.
  `script`, `style`, `template`, `iframe`, `object`, `embed`, `noscript`, `form`, raw-text elements and similar are removed with their content; other unknown elements are unwrapped.
- Attributes are copied by iterating the schema allow-list, never the source attributes. Event handlers, `style`, `srcdoc` and `formaction` can not be allow-listed.
- Every URL attribute goes through `safeUrl`: control characters and whitespace are stripped before the scheme check, only `http`, `https`, `mailto`, `tel` and relative URLs pass by default, and protocol-relative URLs are rejected unless enabled.
- The walk is iterative with a depth cap of 128, so deeply nested input can not overflow the stack.
- Output is parse-stable: `sanitize(sanitize(x)) === sanitize(x)` (fuzz-tested).

## Scope

In scope: XSS through any render path above (editor input paths and `sanitize`), prototype pollution through schema or content, sanitizer bypasses.

Out of scope: rendering stored HTML without calling `sanitize()` in your own application, vulnerabilities in your application code, and `devDependencies` that do not ship in the package.
