# Dependency and license audit

Audited: 2026-08-09 from `package-lock.json` using `npm ls --all`, `npm audit`, and installed package metadata.

## Runtime dependencies

| Package                              | Purpose                                         | License      | Network behavior |
| ------------------------------------ | ----------------------------------------------- | ------------ | ---------------- |
| `ical.js`                            | RFC 5545 parsing and component normalization    | MPL-2.0      | None             |
| `rrule`                              | Bounded recurrence calculation and descriptions | BSD-3-Clause | None             |
| `@fontsource-variable/source-sans-3` | Self-hosted interface font assets               | OFL-1.1      | None             |

No runtime package is loaded from a CDN. Development-only packages cover TypeScript, Vite, linting, formatting, Vitest, jsdom, Playwright, axe, and script execution; they are not shipped as browser runtime code. Transitive licenses remain governed by each package. Before adding a runtime dependency, record purpose, maintained status, minified size, browser/network behavior, and license compatibility here.

This inventory is an engineering record, not legal advice. Preserve upstream license notices when redistributing dependency code.
