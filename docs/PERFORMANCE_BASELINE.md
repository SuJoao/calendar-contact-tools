# Performance baseline

Baseline environment: local production preview, desktop Chromium, 2026-08-09. The site ships no remote font, analytics, ad, or parser request. Route controllers and processing workers are code-split; the homepage does not parse file formats.

Record after every release:

| Measure                        | Launch rule                                                 |
| ------------------------------ | ----------------------------------------------------------- |
| Homepage transferred resources | Same-origin only; no feature worker before user action      |
| Main JS/CSS gzip               | Investigate any increase over 10% from the prior baseline   |
| Largest route/worker chunk     | Document the owning feature and keep it lazy                |
| CLS                            | No visible movement from sponsor media or late font loading |
| LCP/interaction                | No long task caused by eager parser initialization          |

Vite emits `dist/.vite/manifest.json` for auditable route/chunk ownership. Images reserve dimensions, sponsor creative is locally served and lazy-loaded, Source Sans 3 is self-hosted with its package-defined `font-display`, and motion respects `prefers-reduced-motion`. The final measured asset sizes and browser observations belong in `docs/LAUNCH_REPORT.md` after the production build.

## Run 8 measurements

On the local production preview, the homepage requested only the 66.56 kB entry (22.37 kB gzip), 22.28 kB CSS (5.52 kB gzip), and the 28.74 kB Latin font file. It requested no parser, route-controller, or worker chunk. In the Run 7 baseline, the entry and eagerly shared code totaled 275.60 kB raw / 86.42 kB gzip; after lazy-loading VCF controllers, the initial JavaScript is 66.56 kB raw / 22.37 kB gzip—a 76% raw and 74% gzip reduction.

The largest lazy chunk is the ICS shared parser/recurrence code at 157.55 kB raw / 47.75 kB gzip; the calendar worker is 150.88 kB raw and starts only for threshold-crossing work. The contact worker is 19.37 kB. A local desktop Chromium observation reported DCL 114 ms, LCP 160 ms, CLS 0.022, 71 ms aggregate long-task time, and no horizontal overflow. These localhost values are regression evidence, not a claim about real-user production performance.
