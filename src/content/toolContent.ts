import { routePaths } from '../routePaths.ts';

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolContent {
  steps: string[];
  overviewHeading: string;
  overview: string[];
  details: string[];
  problemsHeading: string;
  problems: string[];
  faqs: ToolFaq[];
  related: string[];
}

export const toolContent: Record<string, ToolContent> = {
  [routePaths.icsViewer]: {
    steps: [
      'Choose one or more ICS files, or load the fictional sample.',
      'Search events and filter by timezone or all-day status.',
      'Open the details you need, then export the displayed rows if useful.',
    ],
    overviewHeading: 'What the ICS viewer shows',
    overview: [
      'An ICS file is an iCalendar document used by calendar applications to exchange events. The viewer presents summaries, starts and ends, locations, descriptions, organizers, attendees, recurrence fields, and source files in a searchable table.',
      'UTC, named-zone, floating, and date-only values stay distinct. Floating times are shown as written instead of being silently converted through the browser timezone.',
    ],
    details: ['event fields', 'time kind and timezone', 'recurrence metadata', 'source warnings'],
    problemsHeading: 'Common ICS viewing questions',
    problems: [
      'A recurring master may describe many future events even when only one source row exists.',
      'An all-day DTEND is exclusive, so its displayed range may end on the following date.',
      'Unknown timezone definitions are preserved but cannot always be converted by the browser.',
    ],
    faqs: [
      {
        question: 'Can I open an ICS file without Outlook?',
        answer:
          'Yes. The viewer reads common iCalendar files directly and does not import them into a calendar account.',
      },
      {
        question: 'Are calendar files uploaded?',
        answer:
          'No. Parsing and filtering run in this browser tab, and the application has no upload endpoint.',
      },
      {
        question: 'What is a floating calendar time?',
        answer:
          'It is a wall-clock date and time without UTC or a named timezone. The viewer labels it rather than guessing a zone.',
      },
    ],
    related: [routePaths.icsToCsv, routePaths.icsMerge, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsToCsv]: {
    steps: [
      'Choose one or more ICS files and select the calendar fields to export.',
      'Process the files and inspect the CSV preview for dates and text values.',
      'Download the UTF-8 CSV for a spreadsheet or data-cleaning workflow.',
    ],
    overviewHeading: 'Calendar fields in the CSV',
    overview: [
      'The converter exports selected event fields such as title, start, end, timezone, location, description, UID, recurrence data, organizer, and source file. CSV quoting preserves commas, quotes, and line breaks.',
      'Time values keep their source semantics: floating values are not treated as UTC, named-zone values keep their TZID, and all-day events stay date-only.',
    ],
    details: ['selectable columns', 'UTF-8 output', 'spreadsheet-safe text', 'timezone labels'],
    problemsHeading: 'Before opening calendar CSV in a spreadsheet',
    problems: [
      'Spreadsheet applications may apply their own date formatting after import.',
      'A recurrence rule remains one source event unless occurrences are expanded with the recurrence viewer.',
      'Formula-like text is neutralized in CSV output while legitimate calendar values remain unchanged in memory.',
    ],
    faqs: [
      {
        question: 'Can I convert several calendars at once?',
        answer:
          'Yes. Each readable event includes its source filename so rows remain traceable after conversion.',
      },
      {
        question: 'Does CSV conversion change event timezones?',
        answer:
          'No. The export records the normalized source representation and its time kind; it does not perform a timezone correction.',
      },
      {
        question: 'Will the CSV open in Excel or LibreOffice?',
        answer:
          'The download is UTF-8 CSV with a byte-order mark and standard quoting for broad spreadsheet compatibility.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsMerge],
  },
  [routePaths.icsMerge]: {
    steps: [
      'Choose the ICS files that should become one calendar.',
      'Review diagnostics and any duplicate-event candidates.',
      'Keep or exclude reviewed events, then download the merged ICS file.',
    ],
    overviewHeading: 'How calendar merging works',
    overview: [
      'Readable VEVENT records are combined into one valid VCALENDAR. Event UIDs, recurrence rules, exceptions, attendees, and supported metadata are preserved where they remain unambiguous.',
      'Duplicate detection is advisory. Matching UID and recurrence identity are strong evidence, while similar title, time, and location combinations remain reviewable rather than automatically removed.',
    ],
    details: [
      'all readable events kept initially',
      'review-only duplicate detection',
      'VTIMEZONE conflict warnings',
      'valid ICS download',
    ],
    problemsHeading: 'Merge boundaries',
    problems: [
      'Conflicting VTIMEZONE definitions with the same TZID are reported and the first definition is retained.',
      'Invitation METHOD values such as REQUEST or REPLY are not carried into a neutral combined calendar.',
      'A recurring master and one of its RECURRENCE-ID overrides are not treated as the same event.',
    ],
    faqs: [
      {
        question: 'Can I combine Google Calendar and Outlook exports?',
        answer:
          'Common standards-based exports can be combined, but vendor extensions and conflicting timezone definitions may produce warnings.',
      },
      {
        question: 'Are duplicate events removed automatically?',
        answer:
          'No. Every event remains included until you explicitly resolve a duplicate candidate.',
      },
      {
        question: 'Are event IDs preserved?',
        answer:
          'Existing UIDs are preserved. The merger does not invent replacement identities for readable events.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsToCsv, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsTimezoneFixer]: {
    steps: [
      'Choose an ICS file and inspect its UTC, named-zone, floating, and all-day values.',
      'Select Convert timezone or Assign timezone and review which events are eligible.',
      'Preview the exact changes before downloading a corrected calendar.',
    ],
    overviewHeading: 'Convert timezone versus assign timezone',
    overview: [
      'Convert timezone preserves a known instant and changes its wall-clock representation. Assign timezone keeps a floating wall-clock value and gives it a named zone, which creates an instant.',
      'The tool does not guess a source country or timezone. Date-only values remain unchanged, and ambiguous or nonexistent DST wall times are blocked rather than adjusted silently.',
    ],
    details: [
      'explicit operation choice',
      'DST gap and fold checks',
      'floating-time assignment',
      'change preview',
    ],
    problemsHeading: 'Timezone limitations',
    problems: [
      'Custom TZIDs must be recognized by the browser before they can be converted.',
      'Recurring timezone conversion is blocked because one DTSTART rewrite cannot preserve every future instant across DST rules.',
      'Embedded timezone definitions are preserved but their arbitrary transition rules are not executed.',
    ],
    faqs: [
      {
        question: 'Why is my ICS event in the wrong timezone?',
        answer:
          'The source may be UTC, use a named TZID, or contain a floating wall time. Inspect the reported time kind before choosing a correction.',
      },
      {
        question: 'What does Assign timezone do?',
        answer:
          'It attaches a named zone to a floating wall time without first shifting the displayed clock fields.',
      },
      {
        question: 'Why is a DST time blocked?',
        answer:
          'Some local times occur twice or not at all. Choosing an instant automatically would risk changing the intended event.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsRecurringEventsViewer]: {
    steps: [
      'Choose an ICS file containing recurring events.',
      'Select a series and set a bounded calendar-date range.',
      'Review generated, added, modified, and cancelled occurrences or export them to CSV.',
    ],
    overviewHeading: 'Reading RRULE and recurrence exceptions',
    overview: [
      'RRULE describes a repeating schedule. RDATE adds explicit occurrences, EXDATE removes identities, and RECURRENCE-ID records can replace or cancel individual generated instances.',
      'Expansion respects UTC, named-zone, floating, and all-day semantics. Limits on date range and occurrence counts keep dense or malformed rules from locking the browser tab.',
    ],
    details: [
      'plain-language rule explanation',
      'bounded occurrence expansion',
      'EXDATE and RDATE handling',
      'modified occurrence replacement',
    ],
    problemsHeading: 'Recurrence cases that need care',
    problems: [
      'RANGE=THISANDFUTURE is detected but not approximated because later instances may require vendor-specific changes.',
      'PERIOD-form RDATE values are preserved in ICS but are not expanded into viewer rows.',
      'Unknown embedded timezone transitions cannot be evaluated like full calendar server software.',
    ],
    faqs: [
      {
        question: 'What is an RRULE?',
        answer:
          'It is the iCalendar property that describes frequency, interval, count, end date, weekdays, and other recurrence constraints.',
      },
      {
        question: 'How are cancelled occurrences shown?',
        answer:
          'A cancelled RECURRENCE-ID override is separated from active results and can be included with the Cancelled filter.',
      },
      {
        question: 'Why is expansion limited?',
        answer:
          'A bounded range and occurrence cap keep second-by-second or malformed recurrences responsive in a browser.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsTimezoneFixer, routePaths.icsToCsv],
  },
  [routePaths.vcfViewer]: {
    steps: [
      'Choose one or more VCF or vCard files without importing them into an address book.',
      'Search contacts and filter by field, source file, or vCard version.',
      'Open structured details or export the currently displayed contacts to CSV.',
    ],
    overviewHeading: 'What a VCF contact can contain',
    overview: [
      'A VCF file can contain one or many vCards with structured names, email addresses, phone numbers, postal addresses, organizations, titles, dates, notes, URLs, and vendor properties.',
      'The viewer supports common vCard 2.1, 3.0, and 4.0 records. Remote or embedded PHOTO and LOGO values are shown only as metadata and are never loaded into the page.',
    ],
    details: [
      'structured contact fields',
      'multiple-contact files',
      'source and version filters',
      'inert media metadata',
    ],
    problemsHeading: 'VCF compatibility notes',
    problems: [
      'Older vCard files may use legacy quoted-printable text or uncommon character sets.',
      'Vendor properties are retained for inspection but their private semantics are not interpreted.',
      'Partially malformed files may yield readable contacts alongside diagnostics for skipped cards.',
    ],
    faqs: [
      {
        question: 'Can I open a VCF without importing contacts?',
        answer:
          'Yes. The viewer reads the file in this tab and does not add anything to your browser or device address book.',
      },
      {
        question: 'Can one VCF contain multiple contacts?',
        answer: 'Yes. Each BEGIN:VCARD and END:VCARD record is parsed as a separate contact.',
      },
      {
        question: 'Which vCard versions are supported?',
        answer:
          'Common vCard 2.1, 3.0, and 4.0 fields are supported, with explicit diagnostics for unsupported or malformed values.',
      },
    ],
    related: [routePaths.vcfToCsv, routePaths.vcfMerge, routePaths.vcfDuplicateRemover],
  },
  [routePaths.vcfToCsv]: {
    steps: [
      'Choose one or more VCF files and select the columns you need.',
      'Choose one contact per row or expanded repeated-field rows.',
      'Inspect the preview, then download UTF-8 CSV for your spreadsheet.',
    ],
    overviewHeading: 'Combined and expanded contact CSV',
    overview: [
      'Combined mode keeps one contact per row and joins repeated email, phone, address, and website values. Expanded mode emits one repeated value per row for easier filtering or database import.',
      'The converter adds spreadsheet formula protection to risky CSV cells while preserving legitimate international plus signs in phone fields. Canonical VCF values are not changed.',
    ],
    details: [
      'selectable columns',
      'combined row format',
      'expanded repeated fields',
      'CSV formula protection',
    ],
    problemsHeading: 'Choosing a CSV layout',
    problems: [
      'Combined rows are compact but require splitting repeated values for some database imports.',
      'Expanded rows repeat the contact columns so each email, phone, address, or URL can stand alone.',
      'CSV cannot retain every arbitrary vCard parameter or vendor property with full fidelity.',
    ],
    faqs: [
      {
        question: 'Can I convert a multi-contact VCF?',
        answer:
          'Yes. Every readable vCard record becomes one combined row or several expanded repeated-field rows.',
      },
      {
        question: 'Why are some CSV values prefixed with an apostrophe?',
        answer:
          'Spreadsheet applications can execute cells beginning with formula characters. The prefix keeps those text values inert.',
      },
      {
        question: 'Are phone numbers changed?',
        answer:
          'No. International plus prefixes are retained in phone columns and expanded phone values.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfMerge, routePaths.vcfDuplicateRemover],
  },
  [routePaths.vcfMerge]: {
    steps: [
      'Choose the VCF files that should be combined.',
      'Download every readable original vCard immediately or inspect the optional duplicate groups.',
      'Apply reviewed field choices only if you want a normalized deduplicated export.',
    ],
    overviewHeading: 'Combine first, deduplicate only by choice',
    overview: [
      'The direct merge download preserves every readable original contact and its source vCard version. Malformed cards are reported, and no duplicate is removed automatically.',
      'Optional duplicate review compares provenance, match reasons, repeated values, singular conflicts, notes, organization hierarchy, and UID choices before producing normalized vCard 4.0 output.',
    ],
    details: [
      'original records preserved',
      'malformed-card diagnostics',
      'optional indexed matching',
      'field-level merge preview',
    ],
    problemsHeading: 'Choosing the right VCF merge output',
    problems: [
      'Use the direct combined download when source syntax and versions matter more than deduplication.',
      'Use reviewed output when you have inspected conflicts and accept vCard 4.0 normalization.',
      'PHOTO and LOGO content is omitted from normalized merged contacts and reported before download.',
    ],
    faqs: [
      {
        question: 'Does VCF merge remove duplicates?',
        answer:
          'Not by default. The first download combines every readable card; duplicate resolution is a separate optional workflow.',
      },
      {
        question: 'Can I merge vCard 2.1, 3.0, and 4.0 files?',
        answer:
          'Yes. The direct download preserves source versions, while reviewed merged contacts use predictable vCard 4.0 output.',
      },
      {
        question: 'What happens to malformed contacts?',
        answer:
          'Readable cards continue processing, while cards rejected by the parser are omitted and listed in diagnostics.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfDuplicateRemover, routePaths.vcfToCsv],
  },
  [routePaths.vcfDuplicateRemover]: {
    steps: [
      'Choose a VCF file and let the browser build bounded duplicate indexes.',
      'Review exact, likely, and possible groups with their match reasons and source fields.',
      'Keep, exclude, or merge selected records, then download the derived VCF when satisfied.',
    ],
    overviewHeading: 'Conservative duplicate contact review',
    overview: [
      'Candidate indexes consider exact contact data, UID, email, phone, name, address, organization, and birthday. Confidence labels explain uncertainty; same name or workplace alone is not enough to remove a contact.',
      'Every likely or possible decision is controlled by you. Merge plans show provenance, union compatible repeated values, ask about singular conflicts, and remain reversible with undo or reset until download.',
    ],
    details: [
      'explainable match reasons',
      'false-positive safeguards',
      'source-aware field comparison',
      'derived undoable decisions',
    ],
    problemsHeading: 'Why duplicate review is not automatic',
    problems: [
      'Family members can share an address, and coworkers can share a company phone or generic mailbox.',
      'Phone comparison preserves country codes and extensions instead of guessing regional formats.',
      'Large repetitive buckets are capped for browser safety and produce diagnostics rather than incomplete silent results.',
    ],
    faqs: [
      {
        question: 'How does VCF duplicate detection work?',
        answer:
          'Bounded indexes generate candidate pairs, which are scored from visible identity and supporting signals and grouped for review.',
      },
      {
        question: 'Are possible duplicates deleted automatically?',
        answer:
          'No. Exact batches need confirmation, and every likely or possible group requires an explicit keep, exclude, or merge choice.',
      },
      {
        question: 'Can I undo a duplicate decision?',
        answer:
          'Yes. Undo and Reset all derive the export again from the original contacts instead of mutating uploaded records.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfMerge],
  },
};
