# Threat model

Last reviewed: 2026-08-09.

## Assets and trust boundaries

The sensitive assets are selected ICS/VCF contents, generated exports, configuration credentials held by the hosting account, and sponsor records. File bytes cross only the browser file-picker boundary into the page and optional same-origin module workers. They are not sent to a server, placed in Web Storage, included in URLs, or passed to analytics.

The deployment origin, browser, dependencies, and repository build pipeline are trusted. Uploaded files, filenames, calendar/contact fields, sponsor records, and external destinations are untrusted. Browser extensions, a compromised device or hosting account, and third-party sites after a deliberate link click are outside the application boundary.

## Primary threats and controls

| Threat                              | Control                                                                                                                                | Residual risk                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Markup/script injection from files  | Text-node rendering; reviewed static `innerHTML` allowlist; automated sink audit; hostile browser tests; CSP hashes                    | A future unreviewed sink or browser flaw                                         |
| Resource exhaustion                 | Upload/file-count limits; parser property/record caps; bounded recurrence and duplicate work; paginated rendering; cancellable workers | Inputs near every limit can still make a low-memory device slow                  |
| Network disclosure                  | `connect-src 'self'`; local assets/fonts; no upload endpoint; request-monitor tests; remote PHOTO/URL values remain text               | Extensions, service workers installed by another deployment, or modified hosting |
| Persistence disclosure              | File contents stay in memory; only theme preference may use localStorage; no cookies or IndexedDB                                      | Browser crash dumps and OS-level memory are outside scope                        |
| Malicious sponsor data              | Schema/date/image validation; HTTPS destinations; locally hosted creative; safe external-link attributes                               | Destination can change after review                                              |
| Clickjacking/cross-origin confusion | `frame-ancestors 'none'`, X-Frame-Options, COOP and CORP on Cloudflare                                                                 | GitHub Pages cannot deliver all response headers                                 |
| Supply-chain compromise             | Lockfile, minimal runtime dependencies, audit/license review, Dependabot, CI gates                                                     | Registry/account compromise remains possible                                     |

## Security regression process

Any new DOM sink, remote endpoint, storage mechanism, worker, dependency, sponsor field, or CSP source requires review here. Run `npm run audit:dom`, unit tests, Playwright tests, `npm audit`, and the production build before release. Report vulnerabilities using the current configured contact channel in `SECURITY.md`; never attach real calendar or contact data.
