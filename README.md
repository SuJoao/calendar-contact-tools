# Calendar Contact Tools

Static browser tools for viewing, converting, merging, and cleaning ICS calendar and VCF contact files.

**Live site:** [sujoao.github.io/calendar-contact-tools](https://sujoao.github.io/calendar-contact-tools/)

Files are processed in the browser. The project has no file-upload endpoint, account system, or database.

## Tools

| Calendar                | Contacts          |
| ----------------------- | ----------------- |
| ICS Viewer              | VCF Viewer        |
| ICS to CSV              | VCF to CSV        |
| Merge ICS               | Merge VCF         |
| Timezone Fixer          | Duplicate Remover |
| Recurring Events Viewer |                   |

Calendar tools handle common iCalendar 2.0 files. Contact tools handle common vCard 2.1, 3.0, and 4.0 files. Each tool reports malformed or unsupported input instead of silently guessing.

## Privacy and security

Selected files stay in browser memory and may be passed to a same-origin Web Worker for bounded processing. File contents, filenames, contact fields, and calendar fields are not sent to analytics or stored in Web Storage. Only the selected light/dark theme may be saved locally.

The site uses local fonts and assets, a restrictive Content Security Policy, inert rendering for file-derived values, and safe external-link attributes. Remote vCard images are never loaded. See [SECURITY.md](SECURITY.md) and the [threat model](docs/THREAT_MODEL.md) for boundaries and reporting instructions.

## Development

Requirements:

- Node.js 20.19 or newer
- npm

Install and run:

```bash
npm ci
npm run dev
```

Vite prints the local address, normally `http://localhost:5173`. To exercise production output:

```bash
npm run build
npm run preview
```

Install browser binaries before the first Playwright run:

```bash
npx playwright install --with-deps chromium firefox webkit
```

### Main commands

| Command                            | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `npm run format:check`             | Check Prettier formatting                                |
| `npm run lint`                     | Run ESLint                                               |
| `npm run typecheck`                | Run strict TypeScript checks                             |
| `npm test`                         | Run Vitest unit and DOM tests                            |
| `npm run audit:dom`                | Audit reviewed HTML sinks                                |
| `npm run validate:sponsors`        | Validate sponsor records and assets                      |
| `npm run validate:site`            | Validate routes, SEO, and public configuration           |
| `npm run build`                    | Build and validate the static site                       |
| `npm run test:e2e`                 | Run desktop and mobile Chromium workflows, including axe |
| `npm run test:smoke`               | Run the cross-browser smoke matrix                       |
| `npm run verify:deployment -- URL` | Verify a deployed origin                                 |

## Architecture

The project is framework-free TypeScript rendered by small route and component functions:

- `src/components/` contains shared layout, uploader, table, error, icon, privacy, and sponsor UI.
- `src/controllers/` connects page controls to calendar/contact features.
- `src/features/ics/` and `src/features/vcf/` contain parsing, normalization, matching, recurrence, timezone, CSV, merge, and serialization logic.
- `src/content/` contains concise visible guidance used by tool pages and FAQ structured data.
- `src/config/` centralizes site, security, calendar/contact limits, and SEO configuration.
- `scripts/` validates generated pages, CSP hashes, sponsor data, DOM sinks, and deployments.

Feature controllers and workers are loaded only on matching tool routes. The homepage does not eagerly load parser or worker code. See [docs/TECHNICAL_NOTES.md](docs/TECHNICAL_NOTES.md) for browser support and performance budgets.

## Configuration

Public settings live in `src/config/site.ts`. Before deploying a fork, replace:

- `siteUrl`
- `contactEmail`
- `githubUrl`
- optional Ko-fi or GitHub Sponsors URLs
- sponsor price, currency, capacity, and measured visitor count when applicable

`npm run validate:production-config` blocks production deployment if required values are missing or still use examples. Optional donation controls stay hidden while their URLs are placeholders.

Sponsor records are stored in `src/data/sponsors.json`; reviewed artwork is served locally from `public/sponsors/`. Operational guidance is in [docs/SPONSORING.md](docs/SPONSORING.md).

## Deployment

### GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. A push to `main` runs lint, type checking, tests, configuration validation, and the production build, then deploys `dist` with the repository subpath as Vite's base path.

In the repository settings, select **Settings → Pages → Source → GitHub Actions**. Successful deployments are published at `https://USERNAME.github.io/REPOSITORY/`.

### Cloudflare Pages

Use:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 20.19 or newer
- `BASE_PATH=/` for a root domain

The build emits `_headers` with response security headers. Apply `X-Robots-Tag: noindex, nofollow` to preview deployments and run the deployment verifier against the final HTTPS URL.

## Contributing

Issues and focused pull requests are welcome. Use fictional ICS/VCF fixtures only, keep all processing local, and run the quality commands before submitting a change. Read [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md), and [docs/DEPENDENCY_LICENSES.md](docs/DEPENDENCY_LICENSES.md) before adding UI patterns or runtime code.

Report security issues privately using the address in [SECURITY.md](SECURITY.md). Do not attach real calendar or contact files.

## License

Calendar Contact Tools is available under the [MIT License](LICENSE). Bundled third-party notices are retained in [LICENSES](LICENSES/).
