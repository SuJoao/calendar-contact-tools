import { diagnosticMessages } from './diagnostics';
import { findDuplicateCandidates, type DuplicateCandidate } from './duplicateDetection';
import type {
  CalendarDiagnostic,
  CalendarEvent,
  CalendarInput,
  CalendarMetadata,
  IcsParseResult,
} from './model';
import { parseIcs } from './parser';
import { serializeCalendar } from './serializer';

export interface IcsMergeAnalysis {
  events: CalendarEvent[];
  candidates: DuplicateCandidate[];
  metadata: CalendarMetadata;
  diagnostics: CalendarDiagnostic[];
  malformed: number;
  sourceCount: number;
  timezoneDefinitions: number;
}

export interface IcsMergeResult extends IcsMergeAnalysis {
  content: string;
  total: number;
  duplicates: number;
  included: number;
  warnings: string[];
}

export function analyzeCalendarMerge(inputs: CalendarInput[]): IcsMergeAnalysis {
  return analyzeParsedCalendars(inputs.map(({ name, text }) => parseIcs(text, name)));
}

export function analyzeParsedCalendars(parsed: IcsParseResult[]): IcsMergeAnalysis {
  const events = parsed.flatMap((result) => result.events);
  const diagnostics = parsed.flatMap((result) => result.diagnostics);
  const candidates = findDuplicateCandidates(events);
  candidates.forEach((candidate) => {
    const event = events[candidate.eventB]!;
    diagnostics.push({
      severity: 'warning',
      code: candidate.confidence === 'certain' ? 'DUPLICATE_UID' : 'DUPLICATE_CANDIDATE',
      message: `${capitalize(candidate.confidence)} duplicate candidate: ${candidate.reasons.join(', ').toLowerCase()}.`,
      ...(event.uid ? { eventUid: event.uid } : {}),
      eventTitle: event.title,
      sourceFile: event.sourceFile,
    });
  });
  const metadata = mergeMetadata(parsed, diagnostics);
  return {
    events,
    candidates,
    metadata,
    diagnostics,
    malformed: diagnostics.filter(
      (item) =>
        item.severity === 'error' &&
        ['MALFORMED_EVENT', 'TRUNCATED_COMPONENT', 'INVALID_DATE'].includes(item.code),
    ).length,
    sourceCount: parsed.length,
    timezoneDefinitions: metadata.vtimezones.length,
  };
}

export function serializeMerge(
  analysis: IcsMergeAnalysis,
  excluded: ReadonlySet<number> = new Set(),
): string {
  return serializeCalendar(
    analysis.events.filter((_event, index) => !excluded.has(index)),
    { metadata: analysis.metadata },
  );
}

/** Merge keeps everything unless the caller explicitly supplies excluded indexes. */
export function mergeCalendars(
  inputs: CalendarInput[],
  excluded: ReadonlySet<number> = new Set(),
): IcsMergeResult {
  const analysis = analyzeCalendarMerge(inputs);
  return {
    ...analysis,
    content: serializeMerge(analysis, excluded),
    total: analysis.events.length,
    duplicates: analysis.candidates.length,
    included: analysis.events.length - excluded.size,
    warnings: diagnosticMessages(analysis.diagnostics),
  };
}

function mergeMetadata(
  parsed: IcsParseResult[],
  diagnostics: CalendarDiagnostic[],
): CalendarMetadata {
  const metadata = parsed.map((result) => result.metadata);
  const vtimezones = mergeVtimezones(metadata, diagnostics, parsed);
  const calscales = distinct(metadata.map((item) => item.calscale).filter(Boolean));
  if (calscales.some((value) => value.toUpperCase() !== 'GREGORIAN'))
    metadataWarning(diagnostics, 'Calendar scale values disagree; output uses GREGORIAN.');
  const methods = distinct(metadata.map((item) => item.method).filter(Boolean));
  const invitationMethods = methods.filter((value) =>
    /^(REQUEST|REPLY|CANCEL|ADD|REFRESH|COUNTER|DECLINECOUNTER)$/i.test(value),
  );
  if (methods.length > 1 || invitationMethods.length)
    metadataWarning(
      diagnostics,
      'Invitation METHOD state was not propagated into the combined calendar.',
    );

  return {
    version: '2.0',
    prodid: '-//Calendar Contact Tools//ICS Merge//EN',
    calscale: 'GREGORIAN',
    method: methods.length === 1 && !invitationMethods.length ? methods[0]! : '',
    name: selectMetadataValue(metadata, 'name', 'calendar name', diagnostics) || 'Merged calendar',
    description: selectMetadataValue(metadata, 'description', 'calendar description', diagnostics),
    timezone: selectMetadataValue(metadata, 'timezone', 'calendar timezone hint', diagnostics),
    refreshInterval: selectMetadataValue(
      metadata,
      'refreshInterval',
      'refresh interval',
      diagnostics,
    ),
    color: selectMetadataValue(metadata, 'color', 'calendar color', diagnostics),
    source: selectMetadataValue(metadata, 'source', 'calendar source URL', diagnostics),
    vendorProperties: sharedVendorProperties(metadata),
    vtimezones,
  };
}

function mergeVtimezones(
  metadata: CalendarMetadata[],
  diagnostics: CalendarDiagnostic[],
  parsed: IcsParseResult[],
): string[] {
  const byTzid = new Map<string, { canonical: string; block: string; source: string }>();
  for (const [sourceIndex, item] of metadata.entries()) {
    for (const block of item.vtimezones) {
      const tzid = /^TZID(?:;[^:]*)?:(.*)$/im.exec(block)?.[1]?.trim() || '(missing TZID)';
      const canonical = block
        .replace(/\r?\n[ \t]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const prior = byTzid.get(tzid.toLocaleLowerCase());
      if (!prior) {
        byTzid.set(tzid.toLocaleLowerCase(), {
          canonical,
          block,
          source: parsed[sourceIndex]?.sourceFile ?? 'calendar.ics',
        });
      } else if (prior.canonical !== canonical) {
        diagnostics.push({
          severity: 'warning',
          code: 'CONFLICTING_VTIMEZONE',
          message: `Conflicting VTIMEZONE definitions use TZID “${tzid}”; the first definition is preserved without rewriting event TZIDs.`,
          ...(parsed[sourceIndex]?.sourceFile
            ? { sourceFile: parsed[sourceIndex].sourceFile }
            : {}),
        });
      }
    }
  }
  return [...byTzid.values()].map((entry) => entry.block);
}

function selectMetadataValue(
  metadata: CalendarMetadata[],
  key: keyof Pick<
    CalendarMetadata,
    'name' | 'description' | 'timezone' | 'refreshInterval' | 'color' | 'source'
  >,
  label: string,
  diagnostics: CalendarDiagnostic[],
): string {
  const valuesFound = distinct(metadata.map((item) => item[key]).filter(Boolean));
  if (valuesFound.length > 1)
    metadataWarning(
      diagnostics,
      `Source ${label} values disagree; the combined calendar does not inherit one arbitrarily.`,
    );
  return valuesFound.length === 1 ? valuesFound[0]! : '';
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

function sharedVendorProperties(metadata: CalendarMetadata[]): string[] {
  if (!metadata.length) return [];
  const first = metadata[0]!.vendorProperties;
  return first.filter((line) => metadata.every((item) => item.vendorProperties.includes(line)));
}

function metadataWarning(diagnostics: CalendarDiagnostic[], message: string): void {
  diagnostics.push({ severity: 'warning', code: 'MIXED_CALENDAR_METADATA', message });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
