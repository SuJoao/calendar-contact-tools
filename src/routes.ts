import type { RouteDefinition } from './types.ts';
import { routePaths } from './routePaths.ts';

export const toolRoutes: RouteDefinition[] = [
  {
    path: routePaths.icsViewer,
    title: 'ICS Viewer',
    description: 'Inspect events, dates, timezones, and recurrence fields in an ICS file.',
    seoTitle: 'ICS Viewer — Open Calendar Files Privately',
    metaDescription:
      'Open and inspect ICS calendar files directly in your browser. Review events, dates, timezones, and recurrence details without an upload or signup.',
    primaryIntent: 'ICS viewer',
    group: 'ics',
    sample: 'samples/calendar-basic.ics',
    extensions: ['ics'],
    multiple: true,
  },
  {
    path: routePaths.icsToCsv,
    title: 'ICS to CSV Converter',
    description: 'Choose calendar fields, preview rows, and download spreadsheet-ready CSV.',
    seoTitle: 'ICS to CSV — Convert Calendar Files Privately',
    metaDescription:
      'Convert ICS calendar files to UTF-8 CSV in your browser. Choose fields, preview rows, and download spreadsheet-ready data without uploading or signing up.',
    primaryIntent: 'ICS to CSV',
    group: 'ics',
    sample: 'samples/calendar-basic.ics',
    extensions: ['ics'],
    multiple: true,
  },
  {
    path: routePaths.icsMerge,
    title: 'Merge ICS Calendars',
    description: 'Combine calendars, review duplicate events, and download one ICS file.',
    seoTitle: 'Merge ICS Files — Private Calendar Combiner',
    metaDescription:
      'Merge several ICS calendar files in your browser. Review duplicate candidates and download one valid calendar without uploading schedules or creating an account.',
    primaryIntent: 'merge ICS files',
    group: 'ics',
    sample: 'samples/calendar-basic.ics',
    extensions: ['ics'],
    multiple: true,
  },
  {
    path: routePaths.icsTimezoneFixer,
    title: 'ICS Timezone Fixer',
    description: 'Inspect floating and zoned times, then assign or convert a timezone.',
    seoTitle: 'ICS Timezone Fixer — Review Calendar Times',
    metaDescription:
      'Inspect and correct common ICS timezone problems locally. Assign floating times or convert supported zones with DST safeguards and no file upload.',
    primaryIntent: 'ICS timezone fixer',
    group: 'ics',
    sample: 'samples/calendar-timezones.ics',
    extensions: ['ics'],
    multiple: false,
  },
  {
    path: routePaths.icsRecurringEventsViewer,
    title: 'Recurring Events Viewer',
    description: 'Read recurrence rules and expand bounded occurrences, exceptions, and changes.',
    seoTitle: 'ICS Recurring Events Viewer — Expand RRULEs',
    metaDescription:
      'View ICS recurring events and expand RRULE, RDATE, EXDATE, and modified occurrences within a date range. Processing stays local with no signup.',
    primaryIntent: 'ICS recurring events viewer',
    group: 'ics',
    sample: 'samples/calendar-recurring.ics',
    extensions: ['ics'],
    multiple: true,
  },
  {
    path: routePaths.vcfViewer,
    title: 'VCF Viewer',
    description:
      'Open VCF files, inspect contact fields, and search records without importing them.',
    seoTitle: 'VCF Viewer — Open vCard Contact Files Privately',
    metaDescription:
      'Open and inspect VCF or vCard contact files in your browser. Search names, email, phone, and address fields without importing contacts or uploading data.',
    primaryIntent: 'VCF viewer',
    group: 'vcf',
    sample: 'samples/contacts-basic.vcf',
    extensions: ['vcf', 'vcard'],
    multiple: true,
  },
  {
    path: routePaths.vcfToCsv,
    title: 'VCF to CSV Converter',
    description: 'Choose contact fields and download combined or expanded CSV rows.',
    seoTitle: 'VCF to CSV — Convert Contacts for Spreadsheets',
    metaDescription:
      'Convert VCF and vCard contacts to UTF-8 CSV locally. Preview columns, handle repeated fields, and protect spreadsheet cells without uploading contacts.',
    primaryIntent: 'VCF to CSV',
    group: 'vcf',
    sample: 'samples/contacts-basic.vcf',
    extensions: ['vcf', 'vcard'],
    multiple: true,
  },
  {
    path: routePaths.vcfMerge,
    title: 'Merge VCF Contact Files',
    description: 'Combine VCF files, preserve readable contacts, and optionally review duplicates.',
    seoTitle: 'Merge VCF Files — Combine Contact Files Privately',
    metaDescription:
      'Merge multiple VCF or vCard files in your browser. Preserve readable contacts, report malformed cards, and optionally review duplicates without an upload.',
    primaryIntent: 'merge VCF files',
    group: 'vcf',
    sample: 'samples/contacts-basic.vcf',
    extensions: ['vcf', 'vcard'],
    multiple: true,
  },
  {
    path: routePaths.vcfDuplicateRemover,
    title: 'VCF Duplicate Remover',
    description:
      'Find duplicate contacts, compare fields, and make reversible keep or merge choices.',
    seoTitle: 'Remove Duplicate VCF Contacts — Private Review',
    metaDescription:
      'Find and review duplicate contacts in VCF files locally. Compare match reasons, merge fields, undo decisions, and export without uploading your address book.',
    primaryIntent: 'remove duplicate contacts VCF',
    group: 'vcf',
    sample: 'samples/contacts-duplicates.vcf',
    extensions: ['vcf', 'vcard'],
    multiple: true,
  },
];

export function routeByPath(path: string): RouteDefinition | undefined {
  const clean = `/${path.replace(import.meta.env.BASE_URL, '').replace(/^\/+|\/+$/g, '')}`;
  return toolRoutes.find((route) => route.path === clean);
}
