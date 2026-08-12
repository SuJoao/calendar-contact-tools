import { routePaths } from '../routePaths.ts';

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolContent {
  steps: string[];
  notes: string[];
  faqs: ToolFaq[];
  related: string[];
}

export const toolContent: Record<string, ToolContent> = {
  [routePaths.icsViewer]: {
    steps: [
      'Choose one or more ICS files, or use the fictional sample.',
      'Process the files, then search or filter the event table.',
      'Review event details or download the displayed rows as CSV.',
    ],
    notes: [
      'UTC, named-zone, floating, and all-day values remain distinct; the viewer does not guess a timezone.',
      'A recurring master describes a series. Use the recurring events viewer to expand occurrences.',
      'Partly malformed calendars can return readable events with warnings for skipped data.',
    ],
    faqs: [
      {
        question: 'Can I open an ICS file without Outlook?',
        answer: 'Yes. The ICS viewer reads the file without importing it into a calendar account.',
      },
      {
        question: 'What is a floating calendar time?',
        answer: 'It is a wall-clock date and time with no UTC marker or named timezone.',
      },
    ],
    related: [routePaths.icsToCsv, routePaths.icsMerge, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsToCsv]: {
    steps: [
      'Choose ICS files and select the calendar columns you need.',
      'Process the files and inspect the preview.',
      'Download the UTF-8 CSV.',
    ],
    notes: [
      'Floating times stay floating, named-zone values keep their TZID, and all-day events stay date-only.',
      'Formula-like text is made inert for spreadsheets. CSV quoting preserves commas, quotes, and line breaks.',
      'Recurring rules remain source rows unless you first expand them with the recurring events viewer.',
    ],
    faqs: [
      {
        question: 'Can I convert several calendars at once?',
        answer: 'Yes. The source filename is available so converted rows remain traceable.',
      },
      {
        question: 'Will the CSV open in Excel or LibreOffice?',
        answer: 'Yes. Downloads use UTF-8, a byte-order mark, and standard CSV quoting.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsMerge],
  },
  [routePaths.icsMerge]: {
    steps: [
      'Choose the ICS files to combine.',
      'Process them and review warnings or duplicate candidates.',
      'Keep or exclude reviewed events, then download the merged calendar.',
    ],
    notes: [
      'All readable events remain included until you explicitly resolve a duplicate candidate.',
      'Conflicting VTIMEZONE definitions are reported; the first definition for that TZID is retained.',
      'Existing event UIDs and recurrence identities are preserved where they are readable.',
    ],
    faqs: [
      {
        question: 'Can I combine Google Calendar and Outlook exports?',
        answer:
          'Usually. Standards-based events are combined, while vendor or timezone conflicts are reported.',
      },
      {
        question: 'Are duplicate events removed automatically?',
        answer: 'No. Duplicate matches are advisory and require an explicit review choice.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsToCsv, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsTimezoneFixer]: {
    steps: [
      'Choose an ICS file and inspect its time kinds.',
      'Choose Convert timezone or Assign timezone and set the eligible scope.',
      'Review every proposed change before downloading the corrected ICS.',
    ],
    notes: [
      'Convert preserves a known instant; Assign keeps a floating wall time and gives it a named zone.',
      'All-day dates remain unchanged. Ambiguous or nonexistent DST wall times are blocked.',
      'Recurring conversions and unrecognized custom TZIDs are not rewritten automatically.',
    ],
    faqs: [
      {
        question: 'Why is my ICS event in the wrong timezone?',
        answer:
          'It may be UTC, named-zone, or floating. Check the reported time kind before choosing a fix.',
      },
      {
        question: 'Why is a DST time blocked?',
        answer:
          'Some local times occur twice or not at all, so choosing an instant automatically would be unsafe.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsRecurringEventsViewer],
  },
  [routePaths.icsRecurringEventsViewer]: {
    steps: [
      'Choose an ICS file that contains recurring events.',
      'Select a series and a bounded date range.',
      'Expand and review occurrences, then download CSV if needed.',
    ],
    notes: [
      'RRULE generates a schedule, RDATE adds dates, EXDATE removes dates, and RECURRENCE-ID can modify one instance.',
      'Expansion keeps UTC, named-zone, floating, and all-day semantics separate.',
      'Date-range and occurrence limits prevent malformed or very dense rules from locking the tab.',
      'RANGE=THISANDFUTURE and PERIOD-form RDATE values are reported but not approximated.',
    ],
    faqs: [
      {
        question: 'What is an RRULE?',
        answer:
          'It is the iCalendar property describing recurrence frequency, interval, end, and constraints.',
      },
      {
        question: 'How are cancelled occurrences shown?',
        answer:
          'Cancelled RECURRENCE-ID overrides are separated and can be included with the Cancelled filter.',
      },
      {
        question: 'Why is recurrence expansion limited?',
        answer: 'A bounded range and occurrence cap keep browser processing responsive.',
      },
    ],
    related: [routePaths.icsViewer, routePaths.icsTimezoneFixer, routePaths.icsToCsv],
  },
  [routePaths.vcfViewer]: {
    steps: [
      'Choose one or more VCF files, or use the fictional sample.',
      'Process the files, then search and filter contacts.',
      'Review structured fields or download selected contacts as CSV.',
    ],
    notes: [
      'Common vCard 2.1, 3.0, and 4.0 fields are supported.',
      'Remote and embedded PHOTO or LOGO values are shown only as inert metadata.',
      'Partly malformed files can return readable contacts with diagnostics for skipped cards.',
    ],
    faqs: [
      {
        question: 'Can I open a VCF without importing contacts?',
        answer: 'Yes. The VCF viewer does not add records to your browser or device address book.',
      },
      {
        question: 'Can one VCF contain multiple contacts?',
        answer: 'Yes. Each complete vCard record is displayed as a separate contact.',
      },
    ],
    related: [routePaths.vcfToCsv, routePaths.vcfMerge, routePaths.vcfDuplicateRemover],
  },
  [routePaths.vcfToCsv]: {
    steps: [
      'Choose VCF files and select the columns you need.',
      'Choose combined contacts or expanded repeated-field rows.',
      'Process, review the preview, and download UTF-8 CSV.',
    ],
    notes: [
      'Combined mode keeps one contact per row; expanded mode emits each repeated email, phone, address, or URL separately.',
      'Risky formula-like cells are prefixed for spreadsheet safety, while international phone prefixes remain intact.',
      'CSV cannot retain every vCard parameter or vendor property with full fidelity.',
    ],
    faqs: [
      {
        question: 'Can I convert a multi-contact VCF?',
        answer: 'Yes. Every readable vCard becomes a combined row or a set of expanded rows.',
      },
      {
        question: 'Why do some CSV values start with an apostrophe?',
        answer: 'It prevents spreadsheet software from interpreting untrusted text as a formula.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfMerge, routePaths.vcfDuplicateRemover],
  },
  [routePaths.vcfMerge]: {
    steps: [
      'Choose the VCF files to combine.',
      'Download all readable original cards or open duplicate review.',
      'Apply reviewed field choices only if you want normalized vCard 4.0 output.',
    ],
    notes: [
      'The direct merge preserves readable source records and removes no duplicate automatically.',
      'Reviewed output can combine compatible repeated fields and asks about singular conflicts.',
      'PHOTO and LOGO content is omitted from normalized merged contacts and reported before download.',
    ],
    faqs: [
      {
        question: 'Does VCF merge remove duplicates?',
        answer: 'Not by default. Duplicate resolution is an optional review workflow.',
      },
      {
        question: 'Can I merge different vCard versions?',
        answer:
          'Yes. Direct output preserves source versions; reviewed merged contacts use vCard 4.0.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfDuplicateRemover, routePaths.vcfToCsv],
  },
  [routePaths.vcfDuplicateRemover]: {
    steps: [
      'Choose VCF files and process them for duplicate candidates.',
      'Review match reasons and compare exact, likely, or possible groups.',
      'Keep, exclude, or merge records, then download the reviewed VCF.',
    ],
    notes: [
      'Email, phone, UID, name, address, organization, and birthday signals are explainable and conservatively scored.',
      'A shared name, address, or workplace alone is not enough to remove a contact.',
      'Decisions remain reversible until download; the original selected records are not mutated.',
      'Large repetitive match buckets are capped and reported instead of producing silent partial results.',
    ],
    faqs: [
      {
        question: 'Are possible duplicates deleted automatically?',
        answer: 'No. Every group requires an explicit keep, exclude, or merge decision.',
      },
      {
        question: 'Can I undo a duplicate decision?',
        answer: 'Yes. Undo and Reset rebuild the output from the original contacts.',
      },
      {
        question: 'How are duplicate contacts matched?',
        answer:
          'Bounded indexes create candidate pairs, which are scored from visible identity and supporting fields.',
      },
    ],
    related: [routePaths.vcfViewer, routePaths.vcfMerge],
  },
};
