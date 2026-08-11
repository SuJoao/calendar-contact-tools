# Run 8 launch report

Recorded: 2026-08-09. Status: **READY AFTER CONFIG**.

## 1. Launch readiness

The application hardening gates pass in Chromium and Firefox and no Critical/High product issue is known. Launch is blocked by required owner configuration, not by an unresolved application defect. WebKit execution on this workstation is blocked by host libraries and is recorded below.

## 2. Production configuration

Required and missing: real HTTPS `siteUrl`, public `contactEmail`, and HTTPS `githubUrl`. Optional and missing: Ko-fi and GitHub Sponsors URLs; their UI stays hidden. `monthlyVisitors` correctly remains unpublished (`null`).

## 3. Security

The DOM sink inventory is enforced by `audit:dom`; fixed templates carry review notes and hostile values use text nodes. External activation is limited to HTTPS/mailto helpers; uploaded URL/PHOTO values remain inert. CSP has explicit script hashes, worker/manifest/connect/font/image policies, and response-only frame/upgrade controls. Cloudflare output adds referrer, nosniff, XFO, Permissions Policy, COOP, and CORP. Generated malformed/oversized inputs, hostile DOM values, external-request monitoring, route worker termination, and object-URL revocation are tested. `npm audit` found zero vulnerabilities. No unresolved Critical, High, or Medium security finding is known.

## 4. Accessibility

Axe found no serious or critical violations on six representative empty/static pages and processed ICS/VCF result states in desktop Chromium and mobile Chromium. Upload, remove/reset, theme, filtering, disclosure, review, and download controls have keyboard coverage; removal now moves focus to a remaining control. Errors/statuses are announced, tables have captions/scoped headers/scroll regions, and labels are explicit. Light/dark visual reviews and 200%-equivalent narrow viewport checks showed no page overflow. This is engineering evidence, not WCAG certification or a substitute for a user screen-reader study.

## 5. Performance

The entry is 66.56 kB raw / 22.37 kB gzip and CSS 22.28 kB / 5.52 kB gzip. Run 7 initially loaded 275.60 kB raw / 86.42 kB gzip of entry plus shared JavaScript; lazy VCF controllers reduce that by roughly 76% raw / 74% gzip. The homepage now requests no domain parser/worker code. Largest lazy assets are ICS shared (157.55 kB / 47.75 kB gzip) and calendar worker (150.88 kB raw). Only the matching Latin self-hosted font subset loaded. Local CLS was 0.022; sponsor/image dimensions and lazy loading limit movement. Large work remains bounded and worker-backed.

## 6. Browser support

Chromium: full desktop/mobile suite passes after final rerun. Firefox: four smoke workflows pass, including ICS/VCF downloads. WebKit binary installed, but launch is blocked on this workstation by missing GTK/GStreamer/WebKit libraries; installing them requires administrator access. The maintained policy is current/previous Chrome/Edge, Firefox, Safari, iOS Safari, and Android Chrome, documented in `BROWSER_SUPPORT.md`.

## 7. Privacy verification

Files remain browser-local; remote PHOTO/LOGO/URL values do not load; analytics is disabled and dispatched no request; cookies and uploaded-content persistence were absent; only a deliberate theme choice writes localStorage; sponsor artwork and fonts are local. CSP and request monitors provide defense-in-depth evidence.

## 8. Production SEO verification

Build validation checks 13 canonical/indexable routes plus noindex 404, sitemap route count, robots sitemap reference, parseable per-route JSON-LD, exact JSON-LD CSP hashes, OG/Twitter metadata, manifest, icons, and OG image. They agree with the central site configuration; the production origin will remain intentionally wrong until the owner sets it.

## 9. Deployment

Recommended target: Cloudflare Pages, Node 20+, `npm run build`, output `dist`, `BASE_PATH=/`, then attach a custom HTTPS domain. Generated `_headers` supplies the full policy; preview deployments should receive `X-Robots-Tag: noindex, nofollow` through a preview-only Cloudflare rule. `verify:deployment` exists, but no actual deployment URL was available and none was claimed as verified.

## 10. Quality metrics

Unit: 223 passing. Standard Playwright desktop/mobile: 108 passing. Accessibility: eight representative axe workflows per Chromium profile. Cross-browser smoke: four Chromium and four Firefox workflows pass; eight WebKit/mobile-WebKit executions are environment-blocked. Build and static output validation pass. `validate:launch` correctly blocks on production placeholders.

## 11. Dependency audit

Production vulnerabilities: 0. Development vulnerabilities: 0. Unresolved dependency findings: none from `npm audit`. Runtime dependencies are `ical.js` (MPL-2.0), `rrule` (BSD-3-Clause), and self-hosted Source Sans 3 (OFL-1.1); their purpose and network behavior are documented.

## 12. Launch blockers

Must fix before launch: supply the three required production configuration values and deploy/verify the resulting origin. Nice to fix later: execute the prepared WebKit smoke suite on a host/CI image with Playwright system dependencies; add real-user performance observations only after traffic exists.

## 13. Exact owner actions

1. Choose the final HTTPS domain and set `siteUrl`.
2. Set a monitored public `contactEmail`.
3. Set the public source repository `githubUrl`.
4. Optionally set real Ko-fi and/or GitHub Sponsors URLs; otherwise leave them hidden.
5. Deploy to Cloudflare, apply preview noindex policy, and run `npm run verify:deployment -- https://your-domain/`.

## 14. Run 9 recommendation

Run 9 should be real-domain deployment, Cloudflare configuration, Search Console/Bing launch, and production verification. Another general hardening pass is not indicated by the current evidence.
