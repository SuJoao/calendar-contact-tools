# Growth baseline

Baseline recorded: 2026-08-08.

## Current state

- Public routes: 13 indexable pages (home, nine tools, privacy, about, sponsor).
- Tool coverage: five ICS utilities and four VCF utilities.
- Sponsorship model: direct monthly placements, configured at €25 per placement by default.
- Active paid sponsors: 0.
- Monthly visitors: not yet published; no reliable baseline is configured.
- Analytics: disabled. The application loads no analytics bundle and makes no analytics request.
- Donations: secondary to sponsorship and hidden until real URLs are configured.

## Privacy-safe measurements available if enabled later

The allowlist supports tool page views, sample use, success/error with a broad input-count bucket, completed downloads, sponsor page views, sponsor contact clicks, sponsor placement clicks, and donation-provider clicks. It excludes filenames, file contents, free text, contact fields, calendar fields, query strings, persistent identifiers, and fingerprints.

## First measurement period

After a real domain is configured and an approved zero-cookie provider is deliberately connected, record a full calendar month before publishing traffic. Report the period, measurement method, whether bots are filtered, page-view or visitor definition, and rounded value. Do not present an estimate as observed traffic.

Useful aggregate questions:

- Which tool categories receive meaningful visits?
- Do visitors successfully complete processing after opening a tool?
- Are sponsor placements clicked without obstructing tool use?
- Does the sponsor page generate qualified contact clicks?

Do not optimize for collecting more personal data. If a question cannot be answered with the coarse allowlist, leave it unanswered.

## Honest revenue scenarios

The default direct-placement price is €25 per month and configured capacity is two homepage, two ICS-tool, and two VCF-tool placements. These are scenarios, not forecasts:

| Occupancy                | Active placements | Gross monthly revenue |
| ------------------------ | ----------------: | --------------------: |
| Initial validation       |                 1 |                   €25 |
| Half capacity            |                 3 |                   €75 |
| Current-price scenario   |                 4 |                  €100 |
| Full configured capacity |                 6 |                  €150 |
| Future-price scenario    |          2 at €50 |                  €100 |

Fees, taxes, refunds, creative work, and maintenance time are excluded. Donations are unpredictable and should be reported separately. Do not publish RPM, conversion, or visitor-value claims until both revenue and a consistently defined measured audience exist.
