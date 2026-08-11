export const routePaths = {
  icsViewer: '/ics-viewer',
  icsToCsv: '/ics-to-csv',
  icsMerge: '/ics-merge',
  icsTimezoneFixer: '/ics-timezone-fixer',
  icsRecurringEventsViewer: '/ics-recurring-events-viewer',
  vcfViewer: '/vcf-viewer',
  vcfToCsv: '/vcf-to-csv',
  vcfMerge: '/vcf-merge',
  vcfDuplicateRemover: '/vcf-duplicate-remover',
  privacy: '/privacy',
  about: '/about',
  sponsor: '/sponsor',
} as const;

export const toolRoutePaths = [
  routePaths.icsViewer,
  routePaths.icsToCsv,
  routePaths.icsMerge,
  routePaths.icsTimezoneFixer,
  routePaths.icsRecurringEventsViewer,
  routePaths.vcfViewer,
  routePaths.vcfToCsv,
  routePaths.vcfMerge,
  routePaths.vcfDuplicateRemover,
] as const;

export const staticRoutePaths = [routePaths.privacy, routePaths.about, routePaths.sponsor] as const;

export const plannedRoutePaths = [...toolRoutePaths, ...staticRoutePaths] as const;
