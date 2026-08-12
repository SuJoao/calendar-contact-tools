// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { sponsorCardMarkup } from '../components/SponsorPlacement';
import {
  canonicalUrl,
  publicPageMetadata,
  robotsText,
  sitemapXml,
  structuredDataForPath,
} from '../config/seo';
import { siteConfig } from '../config/site';
import { toolContent } from '../content/toolContent';
import { staticPage, formatTraffic, sponsorContactMarkup } from '../pages/static';
import { routePaths } from '../routePaths';
import { toolRoutes } from '../routes';
import type { Sponsor } from '../types';
import { createAnalyticsAdapter, inputCountBucket } from '../utils/analytics';
import {
  calculateSponsorInventory,
  isSponsorActive,
  sponsorDatasetErrors,
  sponsorRecordErrors,
  sponsorsForPlacement,
} from '../utils/sponsors';

const sponsor = (overrides: Partial<Sponsor> = {}): Sponsor => ({
  id: 'safe-sponsor',
  name: 'Safe product',
  description: 'A factual product description.',
  image: '/sponsors/safe.png',
  url: 'https://sponsor.example/product',
  placement: ['homepage'],
  startDate: '2026-08-01',
  endDate: '2026-09-01',
  label: 'Sponsor',
  isActive: true,
  ...overrides,
});

describe('SEO and content architecture', () => {
  it('defines unique, useful metadata for all 13 indexable routes', () => {
    expect(publicPageMetadata).toHaveLength(13);
    expect(new Set(publicPageMetadata.map((page) => page.title)).size).toBe(13);
    expect(new Set(publicPageMetadata.map((page) => page.description)).size).toBe(13);
    for (const page of publicPageMetadata) {
      expect(page.title.length).toBeGreaterThanOrEqual(20);
      expect(page.description.length).toBeGreaterThanOrEqual(110);
      expect(page.indexable).toBe(true);
    }
  });

  it('builds canonical URLs correctly for domains and configured subpaths', () => {
    expect(canonicalUrl('/ics-viewer', 'https://tools.example/')).toBe(
      'https://tools.example/ics-viewer',
    );
    expect(canonicalUrl('/ics-viewer', 'https://example.github.io/project/')).toBe(
      'https://example.github.io/project/ics-viewer',
    );
  });

  it('generates the exact sitemap, robots reference, and no 404 URL', () => {
    const sitemap = sitemapXml();
    expect(sitemap.match(/<url>/g)).toHaveLength(13);
    for (const page of publicPageMetadata) expect(sitemap).toContain(canonicalUrl(page.path));
    expect(sitemap).not.toContain('/404');
    expect(robotsText()).toContain(canonicalUrl('/sitemap.xml'));
  });

  it('keeps tool JSON-LD aligned with visible FAQ content', () => {
    for (const route of toolRoutes) {
      const data = structuredDataForPath(route.path);
      const graph = data['@graph'] as Record<string, unknown>[];
      const faq = graph.find((item) => item['@type'] === 'FAQPage');
      expect(faq).toBeDefined();
      expect(JSON.stringify(faq)).toContain(toolContent[route.path]!.faqs[0]!.question);
      expect(graph.some((item) => item['@type'] === 'SoftwareApplication')).toBe(true);
    }
  });

  it('gives every tool distinct instructions, limitations, FAQs, and valid related links', () => {
    for (const route of toolRoutes) {
      const content = toolContent[route.path]!;
      expect(content.steps).toHaveLength(3);
      expect(content.faqs.length).toBeGreaterThanOrEqual(2);
      expect(content.notes.length).toBeGreaterThanOrEqual(3);
      expect(content.related).not.toContain(route.path);
      for (const related of content.related)
        expect(toolRoutes.some((candidate) => candidate.path === related)).toBe(true);
    }
  });
});

describe('sponsor operations', () => {
  it('uses an exclusive end date and filters future, inactive, and expired records', () => {
    const current = sponsor();
    expect(isSponsorActive(current, '2026-08-01')).toBe(true);
    expect(isSponsorActive(current, '2026-09-01')).toBe(false);
    expect(sponsorsForPlacement([current], 'homepage', new Date('2026-08-15T12:00:00Z'))).toEqual([
      current,
    ]);
    expect(
      sponsorsForPlacement(
        [sponsor({ startDate: '2026-09-02' }), sponsor({ isActive: false })],
        'homepage',
        new Date('2026-08-15T12:00:00Z'),
      ),
    ).toEqual([]);
  });

  it('validates dates, HTTPS URLs, placements, duplicate IDs, and missing images', () => {
    expect(sponsorRecordErrors(sponsor({ url: 'http://unsafe.example' })).join(' ')).toContain(
      'HTTPS',
    );
    expect(sponsorRecordErrors(sponsor({ endDate: '2026-08-01' })).join(' ')).toContain(
      'date range',
    );
    expect(sponsorRecordErrors({ ...sponsor(), placement: ['not-real'] }).join(' ')).toContain(
      'placement',
    );
    const errors = sponsorDatasetErrors([sponsor(), sponsor()], new Set(['/sponsors/other.png']));
    expect(errors.join(' ')).toContain('duplicate id');
    expect(errors.join(' ')).toContain('does not exist');
  });

  it('limits all-tools targeting to actual tool groups and calculates inventory', () => {
    const allTools = sponsor({ placement: ['all-tools'] });
    expect(sponsorsForPlacement([allTools], 'ics-tools', new Date('2026-08-15'))).toHaveLength(1);
    expect(sponsorsForPlacement([allTools], 'homepage', new Date('2026-08-15'))).toHaveLength(0);
    const inventory = calculateSponsorInventory([allTools], new Date('2026-08-15'));
    expect(inventory.find((item) => item.placement === 'ics-tools')).toMatchObject({
      active: 1,
      available: siteConfig.sponsorPlacementCapacity['ics-tools'] - 1,
    });
  });

  it('escapes sponsor text and uses a safe sponsored link relationship', () => {
    const markup = sponsorCardMarkup(
      sponsor({ name: '<img src=x>', description: '<script>alert(1)</script>' }),
      'homepage',
    );
    expect(markup).toContain('&lt;img src=x&gt;');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).toContain('rel="sponsored noopener noreferrer"');
    document.body.innerHTML = markup;
    expect(document.querySelector('script, .sponsor-card img[src="x"]')).toBeNull();
  });

  it('shows honest traffic and a clear unconfigured contact warning', () => {
    expect(formatTraffic(null)).toMatch(/once a reliable baseline/i);
    expect(formatTraffic(12_345)).toContain('12,345');
    expect(sponsorContactMarkup('hello@example.com')).toContain('setup required');
    expect(sponsorContactMarkup('sponsor@real-domain.test')).toContain('mailto:');
    expect(staticPage(routePaths.sponsor)).not.toMatch(/null monthly|undefined|fake traffic/i);
  });
});

describe('privacy-safe analytics', () => {
  it('does nothing, including no network call, when disabled', () => {
    const fetchSpy = vi.spyOn(window, 'fetch');
    const listener = vi.fn();
    window.addEventListener('privacy-analytics', listener);
    createAnalyticsAdapter({ analyticsEnabled: false, analyticsProvider: 'none' }).track(
      'tool_page_view',
      { tool: 'ics-viewer' },
    );
    expect(listener).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('emits only allowlisted coarse properties when explicitly enabled', () => {
    const events: unknown[] = [];
    window.addEventListener('privacy-analytics', (event) =>
      events.push((event as CustomEvent).detail),
    );
    const adapter = createAnalyticsAdapter({
      analyticsEnabled: true,
      analyticsProvider: 'local-event-adapter',
    });
    adapter.track('processing_completed', {
      tool: 'vcf-merge',
      result: 'success',
      input_count_bucket: '2-5',
    });
    (adapter.track as (event: string, properties: object) => void)('tool_page_view', {
      tool: 'ics-viewer',
      filename: 'private.ics',
    });
    (adapter.track as (event: string, properties: object) => void)('tool_page_view', {
      tool: 'private-filename.ics',
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('filename');
    expect(inputCountBucket(1)).toBe('1');
    expect(inputCountBucket(4)).toBe('2-5');
    expect(inputCountBucket(12)).toBe('6+');
  });
});
