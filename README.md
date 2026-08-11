# Calendar Contact Tools

A production-oriented, static collection of privacy-first utilities for `.ics` calendars and `.vcf` / vCard contacts. Files are read, parsed, transformed, and downloaded entirely in the visitor’s browser. There is no backend, account, database, or file-upload endpoint.

## Included tools

- ICS viewer, CSV converter, merge, timezone fixer, and bounded recurring-event viewer
- VCF viewer, CSV converter, merge, and review-driven duplicate remover
- Shared accessible uploader with drag-and-drop, keyboard fallback, configurable validation, reset, samples, and friendly errors
- Date-aware direct sponsorships, secondary donation links, and disabled-by-default anonymous analytics adapter
- Static-route fallbacks, route-specific metadata, sitemap, manifest, CSP, responsive light/dark design, and deployment workflows

## Local development

Requirements: Node.js 20.19 or later and npm.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run audit:dom
npm run test:e2e
npm run test:smoke
npm run build
npm run preview
```

Playwright requires browsers on a fresh machine: `npx playwright install chromium firefox webkit`. On Linux CI or a fresh Linux workstation, use `npx playwright install --with-deps chromium firefox webkit` when administrator access is available.

## Architecture and local processing

`src/pages` assembles route content. Calendar and contact routes delegate orchestration to focused modules under `src/controllers/ics` and `src/controllers/vcf`; those controllers call canonical parsers and pure domain modules under `src/features`. The browser `File` API supplies text in memory. Results are rendered using text nodes and downloaded through temporary object URLs. File content is never written to Web Storage or passed to the analytics adapter. There are no upload requests.

Calendar values retain both their original RFC 5545 value and an explicit time kind: UTC, named-zone wall time, floating wall time, or date-only. Only UTC and unambiguous supported named-zone values receive an absolute instant. Large calendar inputs cross a size threshold into a module Web Worker; small files stay on the main thread to avoid worker startup overhead. The worker has a typed request/response protocol and no network capability.

The app uses History API routing and Vite emits an `index.html` fallback inside every named route directory. This permits client navigation and direct static-host navigation. Calendar and contact feature chunks are imported only when their tool group runs.

## Project map

```text
src/components/      shared uploader, tables, privacy, sponsor, donation, layout
src/config/          launch configuration and centralized site/calendar limits
src/controllers/     route-specific ICS/VCF orchestration and shared result UI
src/data/            sponsor records
src/features/ics/    parsing, recurrence, timezone, merge, duplicate detection
src/features/vcf/    parsing, merge, serialization, duplicate detection
src/pages/           homepage, static pages, and tool controllers
src/tests/           unit tests
e2e/                 Playwright journeys
public/samples/      fictional ICS and VCF fixtures
scripts/             build-time sponsor validation
docs/                sponsor operations and privacy-safe growth baseline
.github/workflows/   Pages deployment and daily sponsor maintenance
```

## Configuration to replace before launch

Edit `src/config/site.ts`:

- `siteUrl` (the build generates route canonicals, `robots.txt`, and `sitemap.xml` from it)
- `contactEmail`
- `githubUrl`
- `koFiUrl` and `githubSponsorsUrl`
- `monthlyVisitors` only after measuring a reliable integer baseline; otherwise leave it `null`
- `analyticsProvider`, keeping `analyticsEnabled` false until an approved adapter is connected
- pricing/currency if the introductory sponsor offer changes

Run `npm run validate:production-config` before launch. It fails on important placeholder values without making local development fail. The production build generates route metadata, JSON-LD, sitemap, robots, route-specific HTML CSP hashes, and a Cloudflare `_headers` hash allowlist from the central configuration.

The example sponsor is deliberately inactive and is not a fake live endorsement. Replace it or remove it before launch.

## Sponsorships

Add records to `src/data/sponsors.json`:

```json
{
  "id": "unique-kebab-id",
  "name": "Sponsor name",
  "description": "A short factual description.",
  "image": "/sponsors/image.svg",
  "url": "https://sponsor.example/",
  "placement": ["homepage", "ics-tools"],
  "startDate": "2026-08-01",
  "endDate": "2026-09-01",
  "label": "Sponsor",
  "isActive": true
}
```

Allowed placements are `homepage`, `ics-tools`, `vcf-tools`, `all-tools`, and `footer`. `startDate` is inclusive and `endDate` is exclusive. `npm run validate:sponsors` checks required fields, HTTPS URLs, date ranges, duplicate IDs, placement values, image presence/size, and unsafe SVG content. The build runs validation automatically. The UI repeats date filtering at runtime. Expired records remain in Git history but are hidden. A daily workflow reports expired IDs and then builds/tests the project. See `docs/SPONSOR_TEMPLATE.md` for enquiry, invoice, onboarding, renewal, and offboarding checklists.

Sponsor images belong in `public/sponsors`. Cards use safe external-link attributes, have reserved layout space, contain no pixels, do not rotate, and are visibly distinct from tool actions.

## Donations and analytics

Replace Ko-fi and GitHub Sponsors URLs in `src/config/site.ts`; donation prompts remain hidden while both are placeholders. `src/utils/analytics.ts` is disabled by default and dispatches nothing in that state. To enable analytics later, implement or connect an approved privacy-friendly consumer for the `privacy-analytics` browser event, choose a non-`none` provider name, update the CSP `connect-src` only for that exact endpoint, document retention, and set `analyticsEnabled` to true. The runtime allowlist accepts only fixed coarse properties. Never add filenames, content, names, emails, phone numbers, exact counts, query strings, unique IDs, or exported values. See `docs/GROWTH_BASELINE.md`.

## Add a tool

1. Add route metadata to `src/routes.ts`, its path to `src/routePaths.ts`, and distinct content to `src/content/toolContent.ts`.
2. Add a focused feature module and route controller; register calendar controllers in `src/controllers/ics/index.ts`.
3. Reuse `FileUploader` and `ToolLayout`; keep file values out of `innerHTML`.
4. Add unique metadata, instructions, FAQ/limitations, related links, a fictional sample, unit tests, and an end-to-end happy path.
5. Run `npm run validate:site`; sitemap and static route HTML are generated automatically.

## Deployment

Cloudflare Pages on a custom HTTPS domain is the recommended production target because it serves the generated CSP and defense-in-depth response headers. GitHub Pages remains a useful repository-subpath preview target. Before any public launch, replace the required placeholders in `src/config/site.ts` and run `npm run validate:launch`.

### GitHub Pages

Enable **Settings → Pages → Source: GitHub Actions**, then push `main` or run the deployment workflow manually. The workflow sets `BASE_PATH` to the repository name so asset links work below `/<repository>/`. For a user/organization site or custom domain, change `BASE_PATH` to `/`. Replace canonical URLs with the final origin.

GitHub Pages does not support custom response headers, so the CSP is also delivered as an HTML meta policy. Other security headers in `_headers` apply on Cloudflare Pages.

### Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Environment: Node.js 20+
- `BASE_PATH`: `/`

Connect the repository in Cloudflare Pages. For a custom domain, add it in the Pages project’s **Custom domains** area and follow the shown DNS instructions. Every planned route has a generated static `index.html`; the generated root `404.html` handles unknown paths with a genuine 404, and `_headers` supplies security headers. Configure preview/branch deployments with an `X-Robots-Tag: noindex, nofollow` response-header rule; do not add that header to production. After deployment run `npm run verify:deployment -- https://your-domain.example/` to check routes, canonical URLs, public assets, a genuine 404, CSP, and headers.

Deployment, browser, security, performance, and post-launch operations are documented in `docs/LAUNCH_CHECKLIST.md`, `docs/BROWSER_SUPPORT.md`, `docs/THREAT_MODEL.md`, `docs/PERFORMANCE_BASELINE.md`, and `docs/FIRST_30_DAYS.md`.

## Publishing a new GitHub repository

The repository is prepared for a `main` branch and excludes dependencies, builds, test reports, local architecture output, editor state, logs, TypeScript caches, and environment files. Before the first public push:

1. Replace the required placeholders in `src/config/site.ts` or leave deployment disabled until the final values are known.
2. Run `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
3. Create an empty GitHub repository without an autogenerated README, license, or `.gitignore`.
4. Add it as `origin` and push `main`.

The Pages workflow deliberately refuses deployment while required public configuration remains incomplete. Creating the source repository does not require enabling Pages immediately.

## Supported standards and known limitations

Runtime dependencies:

- [`ical.js`](https://github.com/mozilla-comm/ical.js), MPL-2.0: mature browser-side iCalendar parsing and normalized event access. It performs no network requests.
- [`rrule`](https://github.com/jkbrzt/rrule), BSD-3-Clause: browser-compatible recurrence parsing, plain-language descriptions, exclusions, and bounded expansion. It performs no network requests.

VCF parsing and CSV serialization are maintained locally to avoid a heavier dependency. Common vCard 2.1, 3.0, and 4.0 records share one normalized contact model. This is intentional compatibility for common exports, not a claim of universal conformance.

### Contact viewing and conversion

The canonical contact model keeps formatted and structured name components, organization hierarchy, title/role, repeated typed emails, phones, postal addresses and URLs, dates as source strings, categories, repeated notes, UID/kind, timezone/GEO, vendor properties, source file, diagnostics, and non-rendering PHOTO/LOGO metadata. Missing `FN` is diagnosed and a display label may be derived conservatively from `N`; this does not rewrite the source. Partial recovery keeps readable cards when another card is malformed or truncated.

vCard 2.1 support includes common bare `TYPE` parameters and quoted-printable values. vCard 3.0 and 4.0 support common named parameters including `TYPE`, `PREF`, `LANGUAGE`, `VALUE`, `MEDIATYPE`, `ALTID`, and `PID`, which remain available in raw normalized properties. Space/tab folding, quoted-printable soft lines, escaped commas/semicolons/backslashes/newlines, structured `N`, `ORG`, and `ADR`, repeated `EMAIL`/`TEL`/`ADR`/`URL`, partial dates such as `--04-15`, and UTF-8 text are tested. Quoted-printable decoding explicitly supports UTF-8 and ISO-8859-1; an unsupported charset or invalid byte sequence is preserved and diagnosed instead of silently replaced.

The viewer searches human-facing fields with case- and accent-insensitive comparison while preserving original display text. It filters by common field presence, source, and version, sorts locale-aware copies, and renders at most 500 matching rows at once. Files at or above 500,000 encoded bytes parse in a module Web Worker. Contact/property/repeated-value limits are centralized in `src/config/vcf.ts`; 10,000-contact generated inputs are covered by unit tests.

CSV conversion has two schemas:

- **One contact per row:** repeated values are joined with `|` in stable columns such as `full_name`, `organization`, `emails`, `phones`, `addresses`, and `source_file`.
- **Expanded long format:** each email, phone, address, or website gets one row and four additional columns: `repeated_field`, `repeated_value`, `repeated_types`, and `repeated_preference`. This avoids unbounded `email_1…email_n` columns.

Downloads are valid UTF-8 CSV and the download helper adds a UTF-8 BOM for Excel/LibreOffice compatibility. Formula-like free-text cells beginning with `=`, `+`, `-`, or `@` are prefixed with an apostrophe in the CSV representation only. Phone columns and expanded phone values retain legitimate international `+` prefixes. Canonical contact values are never changed by export protection.

### VCF merge and duplicate review

VCF merge is a combine operation first. It parses every selected file, reports malformed cards, and offers a direct download containing every readable original record without removing duplicates or changing its source vCard version. Balanced records rejected by the parser are omitted and reported. Indexed duplicate analysis is advisory; a separate reviewed download is produced only after explicit choices.

Duplicate candidates are classified as **certain**, **likely**, or **possible** and show the supporting reasons rather than an unexplained score. Indexes cover semantic exact signatures, UID, email, phone, normalized name, address, organization plus family name, and birthday plus family name. Same name, organization, address, or birthday alone is not enough to delete or merge a contact. Exact copies have a separately confirmed batch action; likely and possible groups always require review. Related-pair chains may form one group even when every record does not directly match every other record, so the UI exposes the individual evidence edges and warns before merging.

Email comparison trims, Unicode-normalizes, and lowercases for matching. It deliberately keeps plus aliases and dots meaningful and makes no provider-specific rewrites. Phone comparison removes harmless visual formatting while preserving the leading `+`, country code, and extension. It does not guess a country or equate a national number with an international form. Generic mailbox names and shared work numbers are treated conservatively. Accent-insensitive names can generate candidates, but accents remain meaningful when deciding whether records are semantically exact.

Duplicate analysis uses bounded index buckets instead of scanning every pair of contacts. Weak buckets are capped at 100 contacts, strong buckets at 1,000, total candidate pairs at 50,000, and related groups at 50 records. Inputs of 750 contacts or more run duplicate analysis in a cancellable local module Web Worker. Review renders at most 100 matching groups at once. Limit diagnostics are visible when unusually repetitive data prevents complete analysis.

Field-level merge uses the selected primary contact only as a deterministic starting suggestion; richness never affects duplicate confidence. Repeated emails, phones, addresses, URLs, and categories are unioned, retaining compatible `TYPE` and useful parameters. Addresses remain whole records rather than component hybrids. Compatible organization hierarchies retain the richer unit list. Conflicting singular fields and notes expose source file/contact provenance and require a choice; notes can also be combined without repeating identical text. The selected primary supplies UID unless the user explicitly chooses another UID. Source contacts remain immutable: every export is derived from the originals plus an in-memory resolution map, with undo and reset available before download.

Reviewed/merged output is normalized to vCard 4.0 because the local serializer safely represents the canonical modeled fields. It emits CRLF, folds lines to 75 UTF-8 octets, escapes text, preserves structured names/addresses and repeated values, and retains useful `TYPE`, `PREF`, `LANGUAGE`, `VALUE`, `MEDIATYPE`, `ALTID`, and `PID` parameters. Non-standard/vendor properties are preserved as uninterpreted values and exact duplicates are removed; conflicting vendor values are both retained rather than guessed. PHOTO/LOGO payloads and references are not carried into normalized merged output and the review reports the omission. The direct no-deduplication merge remains available when source fidelity is preferable.

PHOTO and LOGO values are metadata only. Embedded base64 is neither decoded nor inserted into the DOM, and remote references are displayed only as text. vCard URLs do not trigger requests or previews; unsafe protocols such as `javascript:` remain inert text with diagnostics. Notes, filenames, vendor fields, and all other uploaded values use text-node rendering. The parser performs no network requests and contact content is not persisted.

Known VCF limitations include uncommon legacy charsets, vCard 2.1 base64 layouts that do not use standard folding, AGENT/key/signature semantics, arbitrary vendor parameter conventions, cryptographic properties, and full RFC validation. Binary content is not exported by the normalized contact serializer. Candidate caps favor browser safety over completeness for highly repetitive address books, names are not linguistically transliterated, phone comparison does not parse regional numbering plans, and arbitrary vendor properties are preserved without semantic reconciliation.

### Calendar merge behavior

Merge parses every source into the shared calendar event model, combines the readable events, and serializes a new `VCALENDAR`. Output uses `VERSION:2.0`, the application `PRODID`, and `CALSCALE:GREGORIAN`. Invitation methods such as `REQUEST`, `REPLY`, and `CANCEL` are not carried into a combined calendar. A calendar name or descriptive field is reused only when the sources supply one unambiguous value; otherwise the output uses a neutral name or omits the field.

Duplicate detection is review-only. A non-empty matching UID is certain evidence only when the events represent the same recurrence instance. A recurring master and a `RECURRENCE-ID` override are distinct. Different UIDs may be likely candidates when normalized title, semantic start/end, and location match, or possible candidates when fewer signals match. Normalization trims, collapses whitespace, and compares case-insensitively; it does not erase punctuation. All events are kept by default, and only an explicit review action excludes one from the download.

`VTIMEZONE` blocks are grouped by `TZID`. Byte-equivalent unfolded definitions are deduplicated. Conflicting definitions with the same `TZID` produce a warning; the first definition is preserved and event TZIDs are not rewritten. The merger does not evaluate arbitrary embedded transition rules or synthesize replacement definitions.

### Timezone fixer behavior

**Convert timezone** preserves a resolvable absolute instant and changes its wall-clock representation. It applies only to UTC or browser-recognized named-zone values matching the selected source zone. **Assign timezone** preserves a floating wall-clock value and gives it an explicit zone, which creates an absolute instant. Floating values are never treated as UTC or as the browser’s local zone automatically.

Date-only all-day values are always unchanged. Assignment is blocked when the selected local time is in a DST gap or fold, because choosing an adjusted or repeated instant would be a guess. Unknown/custom TZIDs are preserved but cannot be converted unless the browser recognizes them. Embedded `VTIMEZONE` components remain available in output, but the tool relies on the browser’s IANA timezone data and does not execute their transition rules.

Recurring floating events can be assigned a zone while retaining `RRULE`, `RDATE`, `EXDATE`, and `RECURRENCE-ID` values where representable. Conversion of an event with `RRULE` is currently blocked: changing one DTSTART representation cannot guarantee that every future instance keeps the same instant across different DST regimes. The separate recurrence viewer applies common RRULE/EXDATE patterns, is range- and count-limited, and does not promise complete support for every vendor’s modified occurrence structure.

### Recurring-event inspection and expansion

A recurring event is a master `VEVENT` whose DTSTART combines with an RRULE or explicit RDATE values to form a recurrence set. The recurrence viewer groups master events and RECURRENCE-ID overrides by UID, shows a plain-language description and raw rule, then expands only the selected series inside explicit calendar-date bounds.

Recurrence calculation is delegated to `rrule` 2.8.1 (BSD-3-Clause). It was selected because it is browser-compatible, works without network access, has a bounded iterator API, and supports the common RFC 5545 rule parts used here: `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`, `HOURLY`, `MINUTELY`, `SECONDLY`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` including ordinal weekdays, `BYMONTH`, `BYMONTHDAY`, `BYSETPOS`, `BYHOUR`, `BYMINUTE`, `BYSECOND`, `WKST`, `BYYEARDAY`, and `BYWEEKNO`. The application supplies DTSTART semantics, range/occurrence limits, exception matching, overrides, diagnostics, and output normalization around that library.

Time kinds remain explicit during expansion:

- UTC recurrence stays UTC.
- Named-zone recurrence repeats by local wall-clock fields, then resolves each occurrence through browser IANA data. A 09:00 Europe/Lisbon meeting therefore remains 09:00 while its UTC offset changes across DST.
- Floating recurrence remains a floating wall-clock value and is never interpreted as UTC, browser-local time, or a guessed zone.
- All-day recurrence remains date-only. DTEND is shown using RFC-exclusive end-date semantics, so an event from August 8 to August 9 is one all-day day.

EXDATE matching uses absolute instants for resolvable UTC/zoned values and date or wall-clock identity for all-day/floating values. RDATE supports DATE and DATE-TIME values, multiple properties/values, and recognized TZIDs; an RDATE equal to an RRULE occurrence is emitted once. PERIOD-form RDATE remains preserved in ICS serialization but is diagnosed and not expanded.

A matching RECURRENCE-ID override replaces the generated instance and supplies its changed DTSTART, DTEND/DURATION, title, location, and other event data. An override with `STATUS:CANCELLED` is separated from active occurrences and can be revealed with the Cancelled filter. Duplicate overrides, missing masters, mismatched time kinds, and duplicate masters produce structured diagnostics. `RANGE=THISANDFUTURE` is detected but not approximated; expansion stops before that identity.

Expansion defaults to a one-year UI range and is limited to five years, 10,000 occurrences per series, and 25,000 total occurrences. Dense high-frequency rules are estimated before calculation, bounded iteration stops at the cap, only 1,000 rows are rendered at once, and expensive work uses the existing cancellable Web Worker. CSV contains every bounded result without browser-timezone conversion.

Known recurrence limitations include PERIOD RDATE expansion, `THISANDFUTURE`, arbitrary embedded VTIMEZONE transition evaluation, non-standard RRULE parts, and vendor-specific recurrence semantics. A malformed or unsupported rule is diagnosed rather than approximated.

Recurring timezone conversion remains blocked. For example, weekly 09:00 Europe/Lisbon does not map to one stable America/New_York wall time: the US and Portugal enter and leave DST on different dates. Replacing only DTSTART/TZID while retaining the RRULE would preserve neither every original instant nor one consistent target wall time during those mismatch windows. Correct conversion would require materializing or encoding per-instance exceptions, which this fixer intentionally does not do.

Calendar safety limits are centralized in `src/config/calendar.ts`: 25,000 events, 1,000,000 characters per unfolded property, 10,000 attendees per event, a 500,000-byte parsing worker threshold, a five-year recurrence range, 10,000 occurrences per series, 25,000 total occurrences, a recurrence worker estimate of 2,000, 100 preview rows, and 1,000 simultaneously rendered rows. Upload size and file-count limits remain in `src/config/site.ts`. These bounds prevent a single browser tab from attempting unbounded parsing or rendering; diagnostics report records skipped because of a limit.

## Privacy guarantees and limits

The application itself has no upload or persistence path for files, sanitizes displayed values through text-node rendering, and blocks remote connections by CSP. A malicious browser extension, compromised device, modified deployment, sponsor destination after a click, or browser implementation is outside this guarantee. Inspect the deployed source and network behavior when handling especially sensitive data.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Project code is MIT licensed. Runtime dependency licenses remain their respective MPL-2.0 and BSD-3-Clause licenses.
