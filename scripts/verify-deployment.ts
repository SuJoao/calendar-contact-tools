import { normalizeSiteUrl } from '../src/config/site';

const supplied = process.argv[2];
if (!supplied) {
  process.stderr.write('Usage: npm run verify:deployment -- https://your-production.example\n');
  process.exit(1);
}

const origin = normalizeSiteUrl(supplied);
const failures: string[] = [];
const routes = ['/', '/ics-viewer', '/vcf-viewer', '/privacy', '/sponsor'];

for (const path of routes) {
  const response = await fetch(new URL(path.replace(/^\//, ''), origin), { redirect: 'follow' });
  const html = await response.text();
  if (!response.ok) failures.push(`${path}: returned HTTP ${response.status}`);
  if (!html.includes('<meta http-equiv="Content-Security-Policy"'))
    failures.push(`${path}: missing HTML CSP fallback`);
  const canonical = new URL(path === '/' ? '' : path.slice(1), origin).toString();
  if (!html.includes(`rel="canonical" href="${canonical}"`))
    failures.push(`${path}: canonical does not use the supplied origin`);
  checkHeaders(path, response.headers);
}

for (const asset of [
  '/robots.txt',
  '/sitemap.xml',
  '/site.webmanifest',
  '/favicon.svg',
  '/og-image.png',
]) {
  const response = await fetch(new URL(asset.slice(1), origin));
  if (!response.ok) failures.push(`${asset}: returned HTTP ${response.status}`);
  if (asset === '/robots.txt' || asset === '/sitemap.xml') {
    const body = await response.text();
    if (!body.includes(origin)) failures.push(`${asset}: does not reference the supplied origin`);
  }
}

const missing = await fetch(new URL(`deployment-check-${Date.now()}`, origin), {
  redirect: 'manual',
});
if (missing.status !== 404)
  failures.push(`/unknown-route: expected a real 404 response, received ${missing.status}`);

if (failures.length) {
  process.stderr.write(
    `Deployment verification failed:\n${failures.map((item) => `- ${item}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Deployment verification passed for ${origin}\n`);
}

function checkHeaders(path: string, headers: Headers): void {
  const required: Record<string, string> = {
    'content-security-policy': "worker-src 'self'",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
  };
  for (const [name, fragment] of Object.entries(required)) {
    if (!headers.get(name)?.includes(fragment))
      failures.push(`${path}: ${name} is missing or wrong`);
  }
}
