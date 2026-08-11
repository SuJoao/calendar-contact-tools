# Security policy

## Reporting a vulnerability

The reporting address is the `contactEmail` value in `src/config/site.ts`. It is intentionally not published while that value is a placeholder; `npm run validate:production-config` blocks launch until a real address is configured. Include reproduction steps and impact, but never include real ICS or VCF data—use a minimal fictional fixture.

## Security model

The site is static and processes selected files in browser memory. It does not provide an upload endpoint. File-derived values are inserted as text, external sponsor links use isolation attributes, remote contact images are not loaded, and a restrictive CSP is included. The detailed trust boundaries, threats, controls, and residual risks are in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

Supported releases receive security fixes on the `main` branch. Browser extensions, compromised hosting credentials, and sponsor websites after a deliberate click are outside the application boundary.
