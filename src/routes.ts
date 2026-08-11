import type { RouteDefinition } from './types.ts';
import { routePaths } from './routePaths.ts';

export const toolRoutes: RouteDefinition[] = [
  {
    path: routePaths.icsViewer,
    title: 'ICS Viewer',
    description:
      'Open an ICS calendar and inspect events, dates, timezones, and recurrence details without uploading the file.',
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
    description:
      'Convert ICS calendar events to spreadsheet-ready CSV with a local preview and no file upload.',
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
    description:
      'Combine several ICS files, review likely duplicate events, and download one calendar without uploading your schedules.',
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
    description:
      'Inspect floating and zoned calendar times, then explicitly assign or convert a timezone without uploading the ICS file.',
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
    description:
      'Read ICS recurrence rules and expand bounded occurrences, exceptions, and modified events directly in your browser.',
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
      'Open VCF or vCard files, inspect contact fields, and search records without importing or uploading your address book.',
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
    description:
      'Convert VCF contacts to spreadsheet-ready CSV with combined or expanded repeated fields and no address-book upload.',
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
    description:
      'Combine several VCF files while preserving readable contacts, with optional duplicate review and no contact upload.',
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
      'Find possible duplicate VCF contacts, compare their fields, and make reversible choices without uploading your address book.',
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
