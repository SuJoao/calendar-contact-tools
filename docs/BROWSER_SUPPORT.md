# Browser support

The supported baseline is the current and previous major releases of Chrome/Edge, Firefox, and Safari, plus current iOS Safari and Android Chrome. JavaScript modules, Web Workers, File/Blob, `Intl`, `URL`, and browser timezone data are required. The production target is ES2022.

Representative smoke tests run against Playwright Chromium, Firefox, WebKit, and a mobile WebKit profile with direct-route loading, local ICS/VCF processing, downloads, recurrence, duplicate review, theme switching, and 404 behavior. A browser outside this policy may still work but is not claimed as supported.

Known platform differences:

- Download filenames and the download shelf UI are controlled by the browser.
- Browser IANA timezone data can differ slightly by release.
- GitHub Pages cannot set the full Cloudflare response-header policy; the HTML CSP fallback still applies.
- Very large files are bounded but can be slower on low-memory phones.

Run `npm run test:smoke` after installing Playwright browsers with `npx playwright install chromium firefox webkit`.
