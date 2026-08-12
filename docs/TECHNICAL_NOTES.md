# Technical notes

## Browser support

The supported baseline is the current and previous major Chrome/Edge, Firefox, and Safari releases, plus current iOS Safari and Android Chrome. The production target is ES2022 and requires JavaScript modules, Web Workers, File/Blob, `Intl`, `URL`, and browser timezone data.

Known platform differences:

- Download presentation and final filename UI are controlled by the browser.
- IANA timezone data can differ slightly between browser releases.
- GitHub Pages cannot send every response header available through Cloudflare Pages; the HTML CSP remains the fallback.
- Inputs near configured limits can be slower on low-memory phones.

Run `npm run test:smoke` after installing Chromium, Firefox, and WebKit with Playwright.

## Performance contract

The homepage must request no domain parser, route controller, or worker code. Feature controllers and workers remain code-split and start only for matching routes or threshold-crossing work. Fonts, sponsor artwork, and application images are served locally.

Investigate a main JavaScript or CSS gzip increase above 10% from the prior release. Confirm that:

- initial resources remain same-origin;
- no processing worker starts before user action;
- sponsor/image dimensions prevent visible layout shifts;
- no eager parser creates an initial long task;
- the document has no horizontal page overflow at 375px;
- reduced-motion preferences remove nonessential transitions.

The production build emits `dist/.vite/manifest.json` for route/chunk ownership. Record measured raw/gzip entry JS, CSS, largest lazy chunk, and loaded font subsets in release notes when a change affects them; localhost timings are regression evidence, not real-user performance claims.
