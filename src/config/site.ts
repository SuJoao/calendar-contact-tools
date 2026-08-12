export const siteConfig = {
  siteName: 'Calendar Contact Tools',
  siteDescription: 'Private browser-based tools for ICS calendars and VCF contacts.',
  siteUrl: 'https://sujoao.github.io/calendar-contact-tools/',
  contactEmail: 'hello@example.com',
  githubUrl: 'https://github.com/SuJoao/calendar-contact-tools',
  koFiUrl: 'https://ko-fi.com/example',
  githubSponsorsUrl: 'https://github.com/sponsors/example',
  sponsorPrice: 25,
  sponsorCurrency: 'EUR',
  monthlyVisitors: null as number | null,
  analyticsProvider: 'none' as const,
  analyticsEnabled: false,
  defaultOgImage: '/og-image.png',
  sponsorPlacementCapacity: {
    homepage: 2,
    'ics-tools': 2,
    'vcf-tools': 2,
  },
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFiles: 20,
  maxRecurrenceOccurrences: 10_000,
} as const;

export type SiteConfig = typeof siteConfig;

export interface ProductionConfigurationField {
  key: 'siteUrl' | 'contactEmail' | 'githubUrl';
  current: string;
  required: string;
}

export function isProductionPlaceholder(value: string): boolean {
  return /(?:example\.com|\/example(?:\/|$)|hello@example|your[_-]?domain|replace[_-]?me)/i.test(
    value,
  );
}

export function isConfiguredValue(value: string): boolean {
  return Boolean(value.trim()) && !isProductionPlaceholder(value);
}

export function normalizeSiteUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('siteUrl must use HTTPS.');
  if (url.username || url.password) throw new Error('siteUrl must not contain credentials.');
  if (url.search || url.hash) throw new Error('siteUrl must not contain a query or fragment.');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

export function isValidContactEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function productionConfigurationIssues(): ProductionConfigurationField[] {
  const required: ProductionConfigurationField[] = [
    {
      key: 'siteUrl',
      current: siteConfig.siteUrl,
      required: 'public HTTPS production origin',
    },
    {
      key: 'contactEmail',
      current: siteConfig.contactEmail,
      required: 'public contact email',
    },
    {
      key: 'githubUrl',
      current: siteConfig.githubUrl,
      required: 'public HTTPS source repository URL',
    },
  ];
  return required.filter((field) => {
    if (!isConfiguredValue(field.current)) return true;
    if (field.key === 'contactEmail') return !isValidContactEmail(field.current);
    try {
      return new URL(field.current).protocol !== 'https:';
    } catch {
      return true;
    }
  });
}
