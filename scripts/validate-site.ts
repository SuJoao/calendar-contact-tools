import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalUrl,
  publicPageMetadata,
  robotsText,
  sitemapXml,
  structuredDataForPath,
} from '../src/config/seo';
import {
  isConfiguredValue,
  isProductionPlaceholder,
  normalizeSiteUrl,
  productionConfigurationIssues,
  siteConfig,
} from '../src/config/site';
import { toolContent } from '../src/content/toolContent';
import { plannedRoutePaths } from '../src/routePaths';

const production = process.argv.includes('--production');
const errors: string[] = [];
const warnings: string[] = [];
const expectedPaths = ['/', ...plannedRoutePaths];
const actualPaths = publicPageMetadata.map((page) => page.path);

if (new Set(actualPaths).size !== actualPaths.length)
  errors.push('Metadata contains duplicate paths.');
for (const path of expectedPaths) {
  if (!actualPaths.includes(path)) errors.push(`Missing public metadata for ${path}.`);
}
for (const metadata of publicPageMetadata) {
  if (metadata.title.length < 20 || metadata.title.length > 70)
    errors.push(`${metadata.path}: title length is outside 20–70 characters.`);
  if (metadata.description.length < 110 || metadata.description.length > 170)
    errors.push(`${metadata.path}: description length is outside 110–170 characters.`);
  try {
    JSON.parse(JSON.stringify(structuredDataForPath(metadata.path)));
    new URL(canonicalUrl(metadata.path));
  } catch {
    errors.push(`${metadata.path}: canonical URL or JSON-LD is invalid.`);
  }
}

for (const [path, content] of Object.entries(toolContent)) {
  if (!actualPaths.includes(path)) errors.push(`${path}: content exists without public metadata.`);
  for (const related of content.related) {
    if (!plannedRoutePaths.includes(related as (typeof plannedRoutePaths)[number]))
      errors.push(`${path}: related route ${related} does not exist.`);
    if (related === path) errors.push(`${path}: related links include the current page.`);
  }
  if (content.faqs.length < 2 || content.faqs.length > 3)
    errors.push(`${path}: two or three visible FAQs are required.`);
}

const sitemap = sitemapXml();
for (const path of expectedPaths) {
  if (!sitemap.includes(`<loc>${canonicalUrl(path)}</loc>`)) errors.push(`Sitemap omits ${path}.`);
}
if (sitemap.includes('/404')) errors.push('Sitemap must not include the 404 page.');
if (!robotsText().includes(canonicalUrl('/sitemap.xml')))
  errors.push('robots.txt sitemap is wrong.');

await access(resolve('public', siteConfig.defaultOgImage.replace(/^\//, ''))).catch(() =>
  errors.push(`Default social image is missing: ${siteConfig.defaultOgImage}.`),
);

const placeholders = [
  ['siteUrl', siteConfig.siteUrl],
  ['contactEmail', siteConfig.contactEmail],
  ['githubUrl', siteConfig.githubUrl],
  ['koFiUrl', siteConfig.koFiUrl],
  ['githubSponsorsUrl', siteConfig.githubSponsorsUrl],
] as const;
try {
  normalizeSiteUrl(siteConfig.siteUrl);
} catch (error) {
  errors.push(error instanceof Error ? error.message : 'siteUrl is invalid.');
}
if (siteConfig.analyticsEnabled && siteConfig.analyticsProvider === 'none')
  errors.push('analyticsEnabled cannot be true while analyticsProvider is "none".');
for (const [key, value] of placeholders) {
  if (!isProductionPlaceholder(value)) continue;
  const message = `${key} still contains a development placeholder.`;
  warnings.push(message);
}

for (const [key, value] of [
  ['koFiUrl', siteConfig.koFiUrl],
  ['githubSponsorsUrl', siteConfig.githubSponsorsUrl],
] as const) {
  if (!isConfiguredValue(value)) continue;
  try {
    if (new URL(value).protocol !== 'https:') errors.push(`${key} must use HTTPS when configured.`);
  } catch {
    errors.push(`${key} is not a valid URL.`);
  }
}

const productionIssues = production ? productionConfigurationIssues() : [];
if (productionIssues.length) {
  process.stderr.write('Production configuration incomplete:\n\n');
  productionIssues.forEach((issue) => {
    process.stderr.write(
      `${issue.key}\n  Current: ${issue.current}\n  Required: ${issue.required}\n\n`,
    );
  });
}

warnings.forEach((warning) => process.stderr.write(`Warning: ${warning}\n`));
if (errors.length) {
  process.stderr.write(`Site validation failed:\n\n${errors.join('\n')}\n`);
  process.exitCode = 1;
} else if (productionIssues.length) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated ${publicPageMetadata.length} public pages and site configuration.\n`,
  );
}
