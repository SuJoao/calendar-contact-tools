import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalUrl, notFoundMeta, publicPageMetadata } from '../src/config/seo';
import { contentSecurityPolicy, permissionsPolicy } from '../src/config/security';

const errors: string[] = [];

for (const metadata of [...publicPageMetadata, notFoundMeta]) {
  const filename =
    metadata.path === '/'
      ? resolve('dist/index.html')
      : metadata.path === '/404'
        ? resolve('dist/404.html')
        : resolve('dist', metadata.path.slice(1), 'index.html');
  const html = await readFile(filename, 'utf8');
  if (!html.includes(`<title>${escapeHtml(metadata.title)}</title>`))
    errors.push(`${metadata.path}: static title is missing.`);
  if (!html.includes(`content="${escapeHtml(metadata.description)}"`))
    errors.push(`${metadata.path}: static description is missing.`);
  if (metadata.indexable && !html.includes(`href="${canonicalUrl(metadata.path)}"`))
    errors.push(`${metadata.path}: canonical is missing.`);
  if (!metadata.indexable && /rel="canonical"/.test(html))
    errors.push(`${metadata.path}: non-indexable page has a canonical.`);
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  try {
    if (!jsonLd) throw new Error();
    JSON.parse(jsonLd);
  } catch {
    errors.push(`${metadata.path}: JSON-LD is missing or invalid.`);
  }
  if (jsonLd) {
    const hash = `sha256-${createHash('sha256').update(jsonLd).digest('base64')}`;
    const csp = html.match(
      /<meta http-equiv="Content-Security-Policy" content="([^"]+)"\s*\/>/,
    )?.[1];
    if (!csp?.includes(`&#039;${hash}&#039;`) && !csp?.includes(`'${hash}'`))
      errors.push(`${metadata.path}: inline JSON-LD is not authorized by its CSP hash.`);
    const expectedPolicy = escapeHtml(contentSecurityPolicy([hash]));
    if (csp !== expectedPolicy)
      errors.push(`${metadata.path}: HTML CSP differs from the generated security policy.`);
  }
}

const sitemap = await readFile(resolve('dist/sitemap.xml'), 'utf8');
if ((sitemap.match(/<url>/g) ?? []).length !== publicPageMetadata.length)
  errors.push('Built sitemap has the wrong route count.');
const robots = await readFile(resolve('dist/robots.txt'), 'utf8');
if (!robots.includes(canonicalUrl('/sitemap.xml')))
  errors.push('Built robots sitemap URL is wrong.');
const manifest = JSON.parse(await readFile(resolve('dist/site.webmanifest'), 'utf8')) as Record<
  string,
  unknown
>;
if (manifest['name'] !== 'Calendar Contact Tools') errors.push('Web manifest name is wrong.');
if (manifest['start_url'] !== './') errors.push('Web manifest start_url must be subpath-safe.');
const manifestIcons = Array.isArray(manifest['icons']) ? manifest['icons'] : [];
for (const expected of ['favicon.svg', 'icon-192.png', 'icon-512.png']) {
  if (!manifestIcons.some((icon) => (icon as Record<string, unknown>)['src'] === expected))
    errors.push(`Web manifest is missing ${expected}.`);
  await readFile(resolve('dist', expected));
}
await readFile(resolve('dist/apple-touch-icon.png'));
await readFile(resolve('dist/og-image.png'));
const viteManifest = JSON.parse(
  await readFile(resolve('dist/.vite/manifest.json'), 'utf8'),
) as Record<string, unknown>;
if (!viteManifest['index.html']) errors.push('Vite manifest is missing its application entry.');
const headers = await readFile(resolve('dist/_headers'), 'utf8');
for (const path of [...publicPageMetadata.map((page) => page.path), '/404']) {
  const filename =
    path === '/'
      ? resolve('dist/index.html')
      : path === '/404'
        ? resolve('dist/404.html')
        : resolve('dist', path.slice(1), 'index.html');
  const html = await readFile(filename, 'utf8');
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (jsonLd) {
    const hash = `sha256-${createHash('sha256').update(jsonLd).digest('base64')}`;
    if (!headers.includes(`'${hash}'`))
      errors.push(`Cloudflare CSP omits the ${path} JSON-LD hash.`);
  }
}
for (const expected of [
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  `Permissions-Policy: ${permissionsPolicy}`,
  'Cross-Origin-Opener-Policy: same-origin',
  'Cross-Origin-Resource-Policy: same-origin',
]) {
  if (!headers.includes(expected)) errors.push(`Built _headers is missing: ${expected}`);
}

if (errors.length) throw new Error(errors.join('\n'));
process.stdout.write(`Validated ${publicPageMetadata.length} built public pages plus 404.\n`);

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
