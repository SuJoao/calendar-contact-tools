# Contributing

Thank you for improving Calendar Contact Tools.

1. Open an issue before a large behavior or dependency change.
2. Keep all file processing local and do not add remote parser services, trackers, or uploaded-content persistence.
3. Use fictional fixtures only. Never commit real calendar or contact data.
4. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run audit:dom`, `npm run test:e2e`, `npm run test:smoke`, and `npm run build`.
5. Document standards limitations instead of silently guessing.

Keep changes focused, accessible by keyboard and at 200% zoom, mobile-friendly, and covered by meaningful tests. A new HTML sink requires an adjacent `SECURITY:` review note and a hostile-value test. New runtime dependencies need a browser-compatibility, network-behavior, maintenance, bundle-size, and license review recorded in `docs/DEPENDENCY_LICENSES.md`. Never relax CSP or add storage/network behavior without updating the threat model and privacy tests.
