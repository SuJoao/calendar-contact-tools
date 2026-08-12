import { toolContent } from '../content/toolContent.ts';
import { routePaths } from '../routePaths.ts';
import { toolRoutes } from '../routes.ts';
import { normalizeSiteUrl, siteConfig } from './site.ts';

export interface PageMetadata {
  path: string;
  title: string;
  description: string;
  indexable: boolean;
}

export const homeMeta: PageMetadata = {
  path: '/',
  title: 'Calendar & Contact File Tools — Private ICS & VCF',
  description:
    'View, convert, merge, and clean ICS calendar and VCF contact files directly in your browser. Files stay on your device and no signup is required.',
  indexable: true,
};

export const staticMeta: Record<string, PageMetadata> = {
  [routePaths.privacy]: {
    path: routePaths.privacy,
    title: 'Privacy — Local ICS and VCF File Processing',
    description:
      'Learn how ICS calendars and VCF contacts stay in your browser, what limited settings are stored, and how sponsors, analytics, and external links work.',
    indexable: true,
  },
  [routePaths.about]: {
    path: routePaths.about,
    title: 'About Calendar & Contact Tools',
    description:
      'Why Calendar Contact Tools provides open browser utilities for real-world ICS and VCF files, including supported formats, local processing, and limitations.',
    indexable: true,
  },
  [routePaths.sponsor]: {
    path: routePaths.sponsor,
    title: 'Sponsor Calendar & Contact Tools',
    description:
      'Direct, clearly labeled sponsorship placements for products serving calendar, contact, migration, CRM, productivity, and developer-tool audiences.',
    indexable: true,
  },
};

export const publicPageMetadata: PageMetadata[] = [
  homeMeta,
  ...toolRoutes.map((route) => ({
    path: route.path,
    title: route.seoTitle,
    description: route.metaDescription,
    indexable: true,
  })),
  ...Object.values(staticMeta),
];

export const notFoundMeta: PageMetadata = {
  path: '/404',
  title: `Page not found — ${siteConfig.siteName}`,
  description:
    'The requested page does not exist. Browse the available calendar and contact tools.',
  indexable: false,
};

export function metadataForPath(path: string): PageMetadata | undefined {
  return publicPageMetadata.find((metadata) => metadata.path === path);
}

export function canonicalUrl(path: string, siteUrl: string = siteConfig.siteUrl): string {
  const base = new URL(normalizeSiteUrl(siteUrl));
  return path === '/' ? base.toString() : new URL(path.replace(/^\//, ''), base).toString();
}

export function ogImageUrl(siteUrl: string = siteConfig.siteUrl): string {
  return new URL(
    siteConfig.defaultOgImage.replace(/^\//, ''),
    normalizeSiteUrl(siteUrl),
  ).toString();
}

export function structuredDataForPath(path: string): Record<string, unknown> {
  const metadata = metadataForPath(path) ?? notFoundMeta;
  const graph: Record<string, unknown>[] = [];
  if (path === '/') {
    graph.push({
      '@type': 'WebSite',
      name: siteConfig.siteName,
      url: canonicalUrl('/'),
      description: siteConfig.siteDescription,
    });
  } else if (!metadata.indexable) {
    graph.push({
      '@type': 'WebPage',
      name: metadata.title,
      description: metadata.description,
      isPartOf: { '@type': 'WebSite', name: siteConfig.siteName, url: canonicalUrl('/') },
    });
  } else {
    const route = toolRoutes.find((candidate) => candidate.path === path);
    const breadcrumbName =
      route?.title ??
      ({
        [routePaths.privacy]: 'Privacy',
        [routePaths.about]: 'About',
        [routePaths.sponsor]: 'Sponsor',
      }[path] as string | undefined) ??
      metadata.title;
    graph.push({
      '@type': 'WebPage',
      name: metadata.title,
      url: canonicalUrl(path),
      description: metadata.description,
      isPartOf: { '@type': 'WebSite', name: siteConfig.siteName, url: canonicalUrl('/') },
    });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalUrl('/') },
        { '@type': 'ListItem', position: 2, name: breadcrumbName, item: canonicalUrl(path) },
      ],
    });
  }
  const route = toolRoutes.find((candidate) => candidate.path === path);
  if (route) {
    graph.push({
      '@type': 'SoftwareApplication',
      name: route.title,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any current browser',
      url: canonicalUrl(path),
      description: route.metaDescription,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: siteConfig.sponsorCurrency },
    });
    graph.push({
      '@type': 'FAQPage',
      mainEntity: toolContent[path]!.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function sitemapXml(siteUrl: string = siteConfig.siteUrl): string {
  const urls = publicPageMetadata
    .filter((metadata) => metadata.indexable)
    .map((metadata) => `  <url><loc>${canonicalUrl(metadata.path, siteUrl)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsText(siteUrl: string = siteConfig.siteUrl): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${canonicalUrl('/sitemap.xml', siteUrl)}\n`;
}
