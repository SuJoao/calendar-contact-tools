import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import {
  canonicalUrl,
  homeMeta,
  notFoundMeta,
  ogImageUrl,
  publicPageMetadata,
  robotsText,
  sitemapXml,
  structuredDataForPath,
  type PageMetadata,
} from './src/config/seo.ts';
import { siteConfig } from './src/config/site.ts';
import { contentSecurityPolicy, permissionsPolicy } from './src/config/security.ts';

export function structuredDataHash(path: string): string {
  return `sha256-${createHash('sha256')
    .update(JSON.stringify(structuredDataForPath(path)))
    .digest('base64')}`;
}

export function cloudflareHeaders(): string {
  const hashes = [...publicPageMetadata.map((page) => page.path), '/404'].map((path) =>
    structuredDataHash(path),
  );
  return `/*
  Content-Security-Policy: ${contentSecurityPolicy(hashes, { responseHeader: true })}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: ${permissionsPolicy}
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function setMeta(
  html: string,
  attribute: 'name' | 'property' | 'http-equiv',
  key: string,
  value: string,
): string {
  const tag = `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`;
  const expression = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, 'i');
  return expression.test(html)
    ? html.replace(expression, tag)
    : html.replace('</head>', `    ${tag}\n  </head>`);
}

function renderStaticPage(source: string, metadata: PageMetadata, path: string): string {
  const structured = JSON.stringify(structuredDataForPath(path));
  const hash = structuredDataHash(path);
  let html = source.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeAttribute(metadata.title)}</title>`,
  );
  html = setMeta(html, 'name', 'description', metadata.description);
  html = setMeta(html, 'name', 'robots', metadata.indexable ? 'index,follow' : 'noindex,nofollow');
  html = setMeta(html, 'property', 'og:title', metadata.title);
  html = setMeta(html, 'property', 'og:description', metadata.description);
  html = setMeta(html, 'property', 'og:type', 'website');
  html = setMeta(html, 'property', 'og:site_name', siteConfig.siteName);
  html = setMeta(html, 'property', 'og:url', canonicalUrl(path));
  html = setMeta(html, 'property', 'og:image', ogImageUrl());
  html = setMeta(html, 'property', 'og:image:width', '1200');
  html = setMeta(html, 'property', 'og:image:height', '630');
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', metadata.title);
  html = setMeta(html, 'name', 'twitter:description', metadata.description);
  html = setMeta(html, 'name', 'twitter:image', ogImageUrl());
  html = setMeta(html, 'http-equiv', 'Content-Security-Policy', contentSecurityPolicy([hash]));
  const structuredTag = `<script type="application/ld+json">${structured}</script>`;
  html = /<script type="application\/ld\+json">[\s\S]*?<\/script>/i.test(html)
    ? html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, structuredTag)
    : html.replace('</head>', `    ${structuredTag}\n  </head>`);
  const canonical = `<link rel="canonical" href="${escapeAttribute(canonicalUrl(path))}" />`;
  if (metadata.indexable) {
    html = /<link\s+rel=["']canonical["'][^>]*>/i.test(html)
      ? html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonical)
      : html.replace('</head>', `    ${canonical}\n  </head>`);
  } else {
    html = html.replace(/\s*<link\s+rel=["']canonical["'][^>]*>/i, '');
  }
  return html;
}

function homepageMetadata(): Plugin {
  return {
    name: 'homepage-metadata',
    transformIndexHtml(html) {
      return renderStaticPage(html, homeMeta, '/');
    },
  };
}

function staticRoutePages(): Plugin {
  return {
    name: 'static-route-pages',
    apply: 'build',
    async closeBundle() {
      const output = resolve('dist');
      const source = await readFile(resolve(output, 'index.html'), 'utf8');
      await writeFile(resolve(output, 'index.html'), renderStaticPage(source, homeMeta, '/'));
      for (const metadata of publicPageMetadata.filter((page) => page.path !== '/')) {
        const directory = resolve(output, metadata.path.slice(1));
        await mkdir(directory, { recursive: true });
        await writeFile(
          resolve(directory, 'index.html'),
          renderStaticPage(source, metadata, metadata.path),
        );
      }
      await writeFile(resolve(output, '404.html'), renderStaticPage(source, notFoundMeta, '/404'));
      await writeFile(resolve(output, 'sitemap.xml'), sitemapXml());
      await writeFile(resolve(output, 'robots.txt'), robotsText());
      await writeFile(resolve(output, '_headers'), cloudflareHeaders());
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? '/',
  plugins: [homepageMetadata(), staticRoutePages()],
  build: { target: 'es2022', sourcemap: mode !== 'production', manifest: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'] },
  },
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
}));
