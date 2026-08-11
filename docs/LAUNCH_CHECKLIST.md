# Launch checklist

## Required configuration

- [ ] Replace `siteUrl`, `contactEmail`, and `githubUrl` in `src/config/site.ts`.
- [ ] Configure Ko-fi/GitHub Sponsors only if real; otherwise leave donation prompts hidden.
- [ ] Run `npm run validate:production-config` with no blockers.
- [ ] Confirm sponsor dates, destinations, copy, and locally hosted artwork.

## Release gates

- [ ] `npm ci`, format, lint, typecheck, unit tests, DOM audit, and build pass.
- [ ] Full Chromium/mobile Playwright suite and three-engine smoke suite pass.
- [ ] `npm audit` reports no unresolved vulnerability.
- [ ] Axe representative-page audit and manual keyboard/focus/200% zoom review pass.
- [ ] CSP/header, manifest, canonical, robots, sitemap, OG image, and real 404 checks pass.
- [ ] Threat model, dependency licenses, browser support, and performance report are current.

## Deployment

- [ ] Deploy `dist` to Cloudflare Pages with Node 20+, build `npm run build`, output `dist`, `BASE_PATH=/`.
- [ ] Attach the production custom domain and enforce HTTPS.
- [ ] Mark preview/branch deployments `noindex` with a Cloudflare preview response-header rule.
- [ ] Run `npm run verify:deployment -- https://production.example/`.
- [ ] Test a private fictional ICS and VCF file in production, then clear the tab.
- [ ] Confirm security-reporting and sponsor contact links reach the configured mailbox.

Do not launch while any required configuration uses an example placeholder.
