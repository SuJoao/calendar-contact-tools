import { siteConfig } from '../config/site';
import { toolRoutePaths } from '../routePaths';

export type InputCountBucket = '1' | '2-5' | '6+';

export interface AnalyticsEventMap {
  tool_page_view: { tool: string };
  sample_file_used: { tool: string };
  processing_completed: {
    tool: string;
    result: 'success' | 'error';
    input_count_bucket: InputCountBucket;
  };
  tool_download_completed: { tool: string };
  sponsor_page_view: undefined;
  sponsor_contact_clicked: undefined;
  sponsor_clicked: { placement: string };
  donation_clicked: { provider: 'ko-fi' | 'github-sponsors' };
}

export type AnalyticsEvent = keyof AnalyticsEventMap;

interface AnalyticsConfiguration {
  analyticsEnabled: boolean;
  analyticsProvider: string;
}

export interface AnalyticsAdapter {
  readonly enabled: boolean;
  track<K extends AnalyticsEvent>(
    event: K,
    ...args: AnalyticsEventMap[K] extends undefined ? [] : [AnalyticsEventMap[K]]
  ): void;
}

const allowedKeys: { [K in AnalyticsEvent]: readonly (keyof NonNullable<AnalyticsEventMap[K]>)[] } =
  {
    tool_page_view: ['tool'],
    sample_file_used: ['tool'],
    processing_completed: ['tool', 'result', 'input_count_bucket'],
    tool_download_completed: ['tool'],
    sponsor_page_view: [],
    sponsor_contact_clicked: [],
    sponsor_clicked: ['placement'],
    donation_clicked: ['provider'],
  };

const sensitiveKeys = new Set([
  'filename',
  'name',
  'email',
  'phone',
  'uid',
  'description',
  'title',
  'query',
  'search',
  'fileContent',
]);
const toolSlugs = new Set<string>(toolRoutePaths.map((path) => path.slice(1)));

export function createAnalyticsAdapter(configuration: AnalyticsConfiguration): AnalyticsAdapter {
  const enabled = configuration.analyticsEnabled && configuration.analyticsProvider !== 'none';
  return {
    enabled,
    track(event, ...args) {
      if (!enabled) return;
      const properties = args[0] as Record<string, unknown> | undefined;
      if (!isAllowedPayload(event, properties)) return;
      window.dispatchEvent(
        new CustomEvent('privacy-analytics', {
          detail: properties ? { event, properties } : { event },
        }),
      );
    },
  };
}

function isAllowedPayload(
  event: AnalyticsEvent,
  properties: Record<string, unknown> | undefined,
): boolean {
  const expected = allowedKeys[event] as readonly string[];
  if (!expected.length) return properties === undefined;
  const keys = properties ? Object.keys(properties) : [];
  if (
    !properties ||
    keys.some((key) => sensitiveKeys.has(key) || !expected.includes(key)) ||
    keys.length !== expected.length
  )
    return false;
  const stringsAreBounded = expected.every((key) => {
    const value = properties[key];
    return typeof value === 'string' && value.length > 0 && value.length <= 80;
  });
  if (!stringsAreBounded) return false;
  if ('tool' in properties && !toolSlugs.has(String(properties['tool']))) return false;
  if (
    'result' in properties &&
    properties['result'] !== 'success' &&
    properties['result'] !== 'error'
  )
    return false;
  if (
    'input_count_bucket' in properties &&
    !['1', '2-5', '6+'].includes(String(properties['input_count_bucket']))
  )
    return false;
  if (
    'placement' in properties &&
    !['homepage', 'ics-tools', 'vcf-tools', 'all-tools', 'footer'].includes(
      String(properties['placement']),
    )
  )
    return false;
  if (
    'provider' in properties &&
    properties['provider'] !== 'ko-fi' &&
    properties['provider'] !== 'github-sponsors'
  )
    return false;
  return true;
}

export function inputCountBucket(count: number): InputCountBucket {
  if (count <= 1) return '1';
  return count <= 5 ? '2-5' : '6+';
}

export function currentToolSlug(): string | undefined {
  const path = location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '');
  const slug = path.replace(/^\/+|\/+$/g, '');
  return slug && !['about', 'privacy', 'sponsor'].includes(slug) ? slug : undefined;
}

export const analytics = createAnalyticsAdapter(siteConfig);
