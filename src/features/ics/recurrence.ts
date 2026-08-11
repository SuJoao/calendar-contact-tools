import { RRule, type Options } from 'rrule';
import { calendarLimits } from '../../config/calendar';
import type {
  CalendarDiagnostic,
  CalendarEvent,
  CalendarTimeKind,
  CalendarTimeValue,
} from './model';
import { basicDateText, basicDateTimeText, dateToBasicInZone, resolveWallTime } from './timezone';

export type OccurrenceSource = 'master' | 'rrule' | 'rdate' | 'override';

export interface RecurrenceOverride {
  recurrenceId: CalendarTimeValue;
  event: CalendarEvent;
  cancelled: boolean;
}

export interface RecurrenceDefinition {
  rrule?: string;
  rdates: CalendarTimeValue[];
  exdates: CalendarTimeValue[];
  overrides: RecurrenceOverride[];
}

export interface RecurrenceSeries {
  id: string;
  uid: string;
  master: CalendarEvent;
  definition: RecurrenceDefinition;
  diagnostics: CalendarDiagnostic[];
  description: string;
  supported: boolean;
  futureRangeCutoff?: CalendarTimeValue;
}

export interface RecurrenceAnalysis {
  series: RecurrenceSeries[];
  diagnostics: CalendarDiagnostic[];
  recurringSeries: number;
  seriesWithExclusions: number;
  seriesWithAdditions: number;
  seriesWithOverrides: number;
  unsupportedSeries: number;
}

export interface ExpandedOccurrence extends Record<string, unknown> {
  title: string;
  occurrence_start: string;
  occurrence_end: string;
  timezone: string;
  time_kind: CalendarTimeKind;
  all_day: boolean;
  location: string;
  uid: string;
  recurrence_id: string;
  occurrence_source: OccurrenceSource;
  modified: boolean;
  status: string;
  source_file: string;
  cancelled: boolean;
  startTime: CalendarTimeValue;
  endTime?: CalendarTimeValue;
  event: CalendarEvent;
  diagnostics: CalendarDiagnostic[];
}

export interface RecurrenceExpansionLimits {
  maxOccurrencesPerSeries: number;
  maxTotalOccurrences: number;
  maxRangeDays: number;
}

export interface ExpandRecurrenceRequest {
  events: readonly CalendarEvent[];
  rangeStart: string;
  rangeEnd: string;
  seriesIds?: readonly string[];
  limits?: Partial<RecurrenceExpansionLimits>;
}

export interface RecurrenceExpansionResult {
  analysis: RecurrenceAnalysis;
  occurrences: ExpandedOccurrence[];
  cancelledOccurrences: ExpandedOccurrence[];
  diagnostics: CalendarDiagnostic[];
  truncated: boolean;
  estimatedWork: number;
}

interface SeriesExpansion {
  occurrences: ExpandedOccurrence[];
  cancelledOccurrences: ExpandedOccurrence[];
  diagnostics: CalendarDiagnostic[];
  truncated: boolean;
}

const supportedRuleParts = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTH',
  'BYMONTHDAY',
  'BYSETPOS',
  'BYHOUR',
  'BYMINUTE',
  'BYSECOND',
  'WKST',
  'BYYEARDAY',
  'BYWEEKNO',
]);

export const recurrenceCsvColumns = [
  'title',
  'occurrence_start',
  'occurrence_end',
  'timezone',
  'time_kind',
  'all_day',
  'location',
  'uid',
  'recurrence_id',
  'occurrence_source',
  'modified',
  'status',
  'source_file',
] as const;

export function analyzeRecurrence(events: readonly CalendarEvent[]): RecurrenceAnalysis {
  const diagnostics: CalendarDiagnostic[] = [];
  const groups = new Map<string, { events: CalendarEvent[]; firstIndex: number }>();
  events.forEach((event, index) => {
    const key = event.uid.trim() || `missing-uid-${index}`;
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { events: [event], firstIndex: index });
  });
  const series: RecurrenceSeries[] = [];

  for (const [groupKey, group] of groups) {
    const overrides = group.events.filter((event) => event.recurrenceId);
    const masters = group.events.filter(
      (event) => !event.recurrenceId && (event.rrule || event.rdates.length || overrides.length),
    );
    if (!masters.length && overrides.length) {
      overrides.forEach((override) =>
        diagnostics.push(
          recurrenceDiagnostic(
            'MISSING_RECURRENCE_MASTER',
            'A RECURRENCE-ID override has no readable master event and was not expanded.',
            override,
          ),
        ),
      );
      continue;
    }
    if (masters.length > 1) {
      masters.forEach((master) =>
        diagnostics.push(
          recurrenceDiagnostic(
            'DUPLICATE_RECURRENCE_MASTER',
            'Multiple master events share this UID; each readable master is shown as a separate series.',
            master,
          ),
        ),
      );
    }

    masters.forEach((master, masterIndex) => {
      const seriesDiagnostics = recurrenceDiagnostics(master);
      const usableOverrides =
        masterIndex === 0 ? collectOverrides(master, overrides, seriesDiagnostics) : [];
      const futureOverride = usableOverrides.find(
        (override) => override.event.recurrenceRange === 'THISANDFUTURE',
      );
      if (futureOverride) {
        seriesDiagnostics.push(
          recurrenceDiagnostic(
            'UNSUPPORTED_THISANDFUTURE',
            'RANGE=THISANDFUTURE is not expanded; generated results stop before that recurrence identity.',
            futureOverride.event,
          ),
        );
      }
      const supported = !seriesDiagnostics.some((diagnostic) =>
        ['INVALID_RRULE', 'UNSUPPORTED_RRULE_PART'].includes(diagnostic.code),
      );
      const item: RecurrenceSeries = {
        id: `${groupKey}::${group.firstIndex + masterIndex}`,
        uid: master.uid,
        master,
        definition: {
          ...(master.rrule ? { rrule: master.rrule } : {}),
          rdates: master.rdates,
          exdates: master.exdates,
          overrides: usableOverrides,
        },
        diagnostics: dedupeDiagnostics(seriesDiagnostics),
        description: supported ? recurrenceText(master.rrule) : 'Complex recurrence rule',
        supported,
        ...(futureOverride ? { futureRangeCutoff: futureOverride.recurrenceId } : {}),
      };
      series.push(item);
      diagnostics.push(...item.diagnostics);
    });
  }

  return {
    series,
    diagnostics: dedupeDiagnostics(diagnostics),
    recurringSeries: series.length,
    seriesWithExclusions: series.filter((item) => item.definition.exdates.length).length,
    seriesWithAdditions: series.filter((item) => item.definition.rdates.length).length,
    seriesWithOverrides: series.filter((item) => item.definition.overrides.length).length,
    unsupportedSeries: series.filter((item) => !item.supported || item.futureRangeCutoff).length,
  };
}

export function recurrenceText(rule: string): string {
  if (!rule) return 'Additional dates without an RRULE';
  try {
    const parsed = RRule.fromString(rule);
    return parsed.isFullyConvertibleToText()
      ? capitalize(parsed.toText())
      : 'Complex recurrence rule';
  } catch {
    return 'Complex recurrence rule';
  }
}

export function estimateRecurrenceWork(
  series: readonly RecurrenceSeries[],
  rangeStart: string,
  rangeEnd: string,
): number {
  const rangeSeconds = Math.max(1, rangeDays(rangeStart, rangeEnd) * 86_400);
  return series.reduce((total, item) => {
    if (!item.definition.rrule) return total + item.definition.rdates.length + 1;
    const parts = ruleParts(item.definition.rrule);
    const interval = Math.max(1, Number(parts.get('INTERVAL') ?? 1));
    const frequency = parts.get('FREQ') ?? '';
    const base =
      frequency === 'SECONDLY'
        ? rangeSeconds / interval
        : frequency === 'MINUTELY'
          ? rangeSeconds / 60 / interval
          : frequency === 'HOURLY'
            ? rangeSeconds / 3_600 / interval
            : frequency === 'DAILY'
              ? rangeSeconds / 86_400 / interval
              : frequency === 'WEEKLY'
                ? rangeSeconds / (7 * 86_400) / interval
                : frequency === 'MONTHLY'
                  ? (rangeSeconds / (30 * 86_400) / interval) * 5
                  : (rangeSeconds / (365 * 86_400) / interval) * 366;
    const timeMultiplier =
      Math.max(1, valueCount(parts.get('BYHOUR'))) *
      Math.max(1, valueCount(parts.get('BYMINUTE'))) *
      Math.max(1, valueCount(parts.get('BYSECOND')));
    const count = Number(parts.get('COUNT') ?? Number.POSITIVE_INFINITY);
    return (
      total + Math.min(count, Math.ceil(base * timeMultiplier)) + item.definition.rdates.length
    );
  }, 0);
}

export function expandRecurrences(request: ExpandRecurrenceRequest): RecurrenceExpansionResult {
  const limits: RecurrenceExpansionLimits = {
    maxOccurrencesPerSeries:
      request.limits?.maxOccurrencesPerSeries ?? calendarLimits.maxOccurrencesPerSeries,
    maxTotalOccurrences: request.limits?.maxTotalOccurrences ?? calendarLimits.maxTotalOccurrences,
    maxRangeDays: request.limits?.maxRangeDays ?? calendarLimits.maxExpansionRangeDays,
  };
  validateRange(request.rangeStart, request.rangeEnd, limits.maxRangeDays);
  const analysis = analyzeRecurrence(request.events);
  const selected = request.seriesIds?.length
    ? analysis.series.filter((series) => request.seriesIds!.includes(series.id))
    : analysis.series;
  const estimatedWork = estimateRecurrenceWork(selected, request.rangeStart, request.rangeEnd);
  const occurrences: ExpandedOccurrence[] = [];
  const cancelledOccurrences: ExpandedOccurrence[] = [];
  const diagnostics = [...analysis.diagnostics];
  let truncated = false;

  for (const series of selected) {
    const remaining = limits.maxTotalOccurrences - occurrences.length - cancelledOccurrences.length;
    if (remaining <= 0) {
      diagnostics.push(
        recurrenceDiagnostic(
          'RECURRENCE_LIMIT_REACHED',
          `Expansion stopped after ${limits.maxTotalOccurrences.toLocaleString()} total occurrences. Choose fewer series or a smaller range.`,
          series.master,
        ),
      );
      truncated = true;
      break;
    }
    const expansion = expandSeries(
      series,
      request.rangeStart,
      request.rangeEnd,
      Math.min(limits.maxOccurrencesPerSeries, remaining),
    );
    occurrences.push(...expansion.occurrences);
    cancelledOccurrences.push(...expansion.cancelledOccurrences);
    diagnostics.push(...expansion.diagnostics);
    truncated ||= expansion.truncated;
  }

  occurrences.sort(compareOccurrences);
  cancelledOccurrences.sort(compareOccurrences);
  return {
    analysis,
    occurrences,
    cancelledOccurrences,
    diagnostics: dedupeDiagnostics(diagnostics),
    truncated,
    estimatedWork,
  };
}

function expandSeries(
  series: RecurrenceSeries,
  rangeStart: string,
  rangeEnd: string,
  limit: number,
): SeriesExpansion {
  const diagnostics = [...series.diagnostics];
  const candidates = new Map<
    string,
    { start: CalendarTimeValue; source: OccurrenceSource; recurrenceId: CalendarTimeValue }
  >();
  const excluded = new Set(series.definition.exdates.map(semanticTimeKey));
  const addCandidate = (
    start: CalendarTimeValue,
    source: OccurrenceSource,
    recurrenceId: CalendarTimeValue = start,
  ): void => {
    if (!inDateRange(start, rangeStart, rangeEnd)) return;
    if (
      series.futureRangeCutoff &&
      compareTimeIdentity(recurrenceId, series.futureRangeCutoff) >= 0
    )
      return;
    const key = semanticTimeKey(recurrenceId);
    if (excluded.has(key) || candidates.has(key)) return;
    candidates.set(key, { start, source, recurrenceId });
  };
  addCandidate(series.master.startTime, 'master');

  let truncated = false;
  let limitReached = false;
  if (series.definition.rrule && series.supported) {
    const estimate = estimateRecurrenceWork([series], rangeStart, rangeEnd);
    if (estimate > limit * 4) {
      diagnostics.push(
        recurrenceDiagnostic(
          'RECURRENCE_LIMIT_REACHED',
          `The rule could generate approximately ${Math.ceil(estimate).toLocaleString()} occurrences in this range. Expansion stopped before calculation; choose a smaller range.`,
          series.master,
        ),
      );
      truncated = true;
    } else {
      try {
        const rule = recurrenceRule(series.master, series.definition.rrule);
        const transportStart = dateRangeTransport(rangeStart, false);
        const transportEnd = dateRangeTransport(rangeEnd, true);
        const dates = rule.between(
          transportStart,
          transportEnd,
          true,
          (_date, length) => length <= limit,
        );
        if (dates.length > limit) {
          dates.length = limit;
          truncated = true;
          limitReached = true;
        }
        for (const date of dates) {
          const value = timeFromTransport(
            date,
            series.master.startTime,
            diagnostics,
            series.master,
          );
          if (value)
            addCandidate(
              value,
              semanticTimeKey(value) === semanticTimeKey(series.master.startTime)
                ? 'master'
                : 'rrule',
            );
        }
      } catch {
        diagnostics.push(
          recurrenceDiagnostic(
            'INVALID_RRULE',
            'The recurrence rule could not be expanded safely.',
            series.master,
          ),
        );
      }
    }
  }

  for (const rdate of series.definition.rdates) {
    if (rdate.kind !== series.master.startTime.kind) {
      diagnostics.push(
        recurrenceDiagnostic(
          'RECURRENCE_TIME_KIND_MISMATCH',
          'An RDATE has a different time kind from DTSTART and was not expanded.',
          series.master,
        ),
      );
      continue;
    }
    addCandidate(rdate, 'rdate');
  }

  const overrides = new Map(
    series.definition.overrides.map((override) => [
      semanticTimeKey(override.recurrenceId),
      override,
    ]),
  );
  const occurrences: ExpandedOccurrence[] = [];
  const cancelledOccurrences: ExpandedOccurrence[] = [];
  for (const [key, candidate] of candidates) {
    const override = overrides.get(key);
    if (override) {
      overrides.delete(key);
      const occurrence = occurrenceFromEvent(
        override.event,
        override.recurrenceId,
        'override',
        true,
        diagnostics,
      );
      if (override.cancelled) cancelledOccurrences.push(occurrence);
      else if (inDateRange(override.event.startTime, rangeStart, rangeEnd))
        occurrences.push(occurrence);
      continue;
    }
    const occurrence = occurrenceFromGenerated(series.master, candidate, diagnostics);
    occurrences.push(occurrence);
  }

  for (const override of overrides.values()) {
    if (override.event.recurrenceRange === 'THISANDFUTURE') continue;
    if (!inDateRange(override.event.startTime, rangeStart, rangeEnd)) continue;
    diagnostics.push(
      recurrenceDiagnostic(
        'RECURRENCE_OVERRIDE_MISMATCH',
        'An override does not match a generated recurrence identity; it is shown independently for review.',
        override.event,
      ),
    );
    const occurrence = occurrenceFromEvent(
      override.event,
      override.recurrenceId,
      'override',
      true,
      diagnostics,
    );
    if (override.cancelled) cancelledOccurrences.push(occurrence);
    else occurrences.push(occurrence);
  }

  if (occurrences.length + cancelledOccurrences.length > limit) {
    truncated = true;
    limitReached = true;
  }

  if (limitReached)
    diagnostics.push(
      recurrenceDiagnostic(
        'RECURRENCE_LIMIT_REACHED',
        `Expansion stopped at the safe limit of ${limit.toLocaleString()} occurrences for this series.`,
        series.master,
      ),
    );
  return {
    occurrences: occurrences.slice(0, limit),
    cancelledOccurrences: cancelledOccurrences.slice(0, Math.max(0, limit - occurrences.length)),
    diagnostics: dedupeDiagnostics(diagnostics),
    truncated,
  };
}

function occurrenceFromGenerated(
  master: CalendarEvent,
  candidate: {
    start: CalendarTimeValue;
    source: OccurrenceSource;
    recurrenceId: CalendarTimeValue;
  },
  diagnostics: CalendarDiagnostic[],
): ExpandedOccurrence {
  const endTime = generatedEnd(master, candidate.start, diagnostics);
  return occurrenceRecord(
    master,
    candidate.start,
    endTime,
    candidate.recurrenceId,
    candidate.source,
    false,
  );
}

function occurrenceFromEvent(
  event: CalendarEvent,
  recurrenceId: CalendarTimeValue,
  source: OccurrenceSource,
  modified: boolean,
  diagnostics: CalendarDiagnostic[],
): ExpandedOccurrence {
  const endTime = event.endTime ?? generatedEnd(event, event.startTime, diagnostics);
  return occurrenceRecord(event, event.startTime, endTime, recurrenceId, source, modified);
}

function occurrenceRecord(
  event: CalendarEvent,
  startTime: CalendarTimeValue,
  endTime: CalendarTimeValue | undefined,
  recurrenceId: CalendarTimeValue,
  source: OccurrenceSource,
  modified: boolean,
): ExpandedOccurrence {
  const cancelled = event.status.toUpperCase() === 'CANCELLED';
  return {
    title: event.title,
    occurrence_start: occurrenceDisplay(startTime),
    occurrence_end: endTime ? occurrenceDisplay(endTime) : '',
    timezone: zoneLabel(startTime),
    time_kind: startTime.kind,
    all_day: startTime.kind === 'date',
    location: event.location,
    uid: event.uid,
    recurrence_id: occurrenceDisplay(recurrenceId),
    occurrence_source: source,
    modified,
    status: cancelled
      ? 'Cancelled'
      : modified
        ? 'Modified occurrence'
        : source === 'rdate'
          ? 'RDATE'
          : 'Recurring',
    source_file: event.sourceFile,
    cancelled,
    startTime,
    ...(endTime ? { endTime } : {}),
    event,
    diagnostics: event.diagnostics,
  };
}

function generatedEnd(
  event: CalendarEvent,
  occurrenceStart: CalendarTimeValue,
  diagnostics: CalendarDiagnostic[],
): CalendarTimeValue | undefined {
  const milliseconds = eventDurationMilliseconds(event);
  if (milliseconds === undefined) return undefined;
  const endTransport = new Date(timeToTransport(occurrenceStart).getTime() + milliseconds);
  return timeFromTransport(endTransport, event.endTime ?? event.startTime, diagnostics, event);
}

function eventDurationMilliseconds(event: CalendarEvent): number | undefined {
  if (event.endTime)
    return Math.max(
      0,
      timeToTransport(event.endTime).getTime() - timeToTransport(event.startTime).getTime(),
    );
  if (!event.duration) return undefined;
  return parseDurationMilliseconds(event.duration);
}

function parseDurationMilliseconds(value: string): number | undefined {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    value,
  );
  if (!match) return undefined;
  const direction = match[1] === '-' ? -1 : 1;
  const seconds =
    Number(match[2] ?? 0) * 7 * 86_400 +
    Number(match[3] ?? 0) * 86_400 +
    Number(match[4] ?? 0) * 3_600 +
    Number(match[5] ?? 0) * 60 +
    Number(match[6] ?? 0);
  return Math.max(0, direction * seconds * 1_000);
}

function recurrenceRule(event: CalendarEvent, rawRule: string): RRule {
  const options = RRule.parseString(rawRule) as Partial<Options>;
  options.dtstart = timeToTransport(event.startTime);
  const until = ruleParts(rawRule).get('UNTIL');
  if (until) options.until = untilTransport(until, event.startTime);
  return new RRule(options, true);
}

function untilTransport(raw: string, start: CalendarTimeValue): Date {
  if (/^\d{8}$/.test(raw)) return basicToTransport(`${raw}T235959`);
  const basic = raw.replace(/Z$/, '');
  if (raw.endsWith('Z') && start.kind === 'zoned' && start.tzid)
    return basicToTransport(dateToBasicInZone(basicToTransport(basic), start.tzid));
  return basicToTransport(basic);
}

function recurrenceDiagnostics(event: CalendarEvent): CalendarDiagnostic[] {
  const diagnostics = event.diagnostics.filter((item) =>
    ['INVALID_RRULE', 'UNSUPPORTED_RDATE_PERIOD'].includes(item.code),
  );
  if (!event.rrule) return diagnostics;
  const unsupported = [...ruleParts(event.rrule).keys()].filter(
    (part) => !supportedRuleParts.has(part),
  );
  if (unsupported.length)
    diagnostics.push(
      recurrenceDiagnostic(
        'UNSUPPORTED_RRULE_PART',
        `Unsupported RRULE part${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}. The rule was not approximated.`,
        event,
      ),
    );
  return diagnostics;
}

function collectOverrides(
  master: CalendarEvent,
  overrides: CalendarEvent[],
  diagnostics: CalendarDiagnostic[],
): RecurrenceOverride[] {
  const seen = new Set<string>();
  const output: RecurrenceOverride[] = [];
  for (const event of overrides) {
    const recurrenceId = event.recurrenceId!;
    if (recurrenceId.kind !== master.startTime.kind) {
      diagnostics.push(
        recurrenceDiagnostic(
          'RECURRENCE_TIME_KIND_MISMATCH',
          'RECURRENCE-ID has a different time kind from the master DTSTART and was not applied.',
          event,
        ),
      );
      continue;
    }
    const key = semanticTimeKey(recurrenceId);
    if (seen.has(key)) {
      diagnostics.push(
        recurrenceDiagnostic(
          'DUPLICATE_RECURRENCE_OVERRIDE',
          'Multiple overrides target the same recurrence identity; the first readable override is used.',
          event,
        ),
      );
      continue;
    }
    seen.add(key);
    output.push({
      recurrenceId,
      event,
      cancelled: event.status.toUpperCase() === 'CANCELLED',
    });
  }
  return output;
}

function timeFromTransport(
  date: Date,
  template: CalendarTimeValue,
  diagnostics: CalendarDiagnostic[],
  event: CalendarEvent,
): CalendarTimeValue | undefined {
  if (template.kind === 'date') {
    const raw = transportBasic(date).slice(0, 8);
    return { kind: 'date', raw, value: basicDateText(raw) };
  }
  const basic = transportBasic(date);
  if (template.kind === 'floating')
    return { kind: 'floating', raw: basic, value: basicDateTimeText(basic) };
  if (template.kind === 'utc')
    return {
      kind: 'utc',
      raw: `${basic}Z`,
      value: basicDateTimeText(basic),
      instant: date.toISOString(),
    };
  const tzid = template.tzid!;
  const resolution = resolveWallTime(basic, tzid);
  if (resolution.status !== 'valid') {
    diagnostics.push(
      recurrenceDiagnostic(
        resolution.status === 'ambiguous' ? 'AMBIGUOUS_LOCAL_TIME' : 'NONEXISTENT_LOCAL_TIME',
        `A generated local recurrence is ${resolution.status} in ${tzid} and was not assigned an instant.`,
        event,
      ),
    );
    return { kind: 'zoned', raw: basic, value: basicDateTimeText(basic), tzid };
  }
  return {
    kind: 'zoned',
    raw: basic,
    value: basicDateTimeText(basic),
    tzid,
    instant: resolution.instants[0]!.toISOString(),
  };
}

function timeToTransport(value: CalendarTimeValue): Date {
  return basicToTransport(
    value.kind === 'date' ? `${value.raw}T000000` : value.raw.replace(/Z$/, ''),
  );
}

function basicToTransport(value: string): Date {
  return new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(9, 11) || 0),
      Number(value.slice(11, 13) || 0),
      Number(value.slice(13, 15) || 0),
    ),
  );
}

function transportBasic(date: Date): string {
  return `${date.getUTCFullYear().toString().padStart(4, '0')}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function semanticTimeKey(value: CalendarTimeValue): string {
  if ((value.kind === 'utc' || value.kind === 'zoned') && value.instant)
    return `instant:${value.instant}`;
  if (value.kind === 'zoned') return `zoned:${value.tzid ?? ''}:${value.raw}`;
  return `${value.kind}:${value.raw}`;
}

function compareTimeIdentity(first: CalendarTimeValue, second: CalendarTimeValue): number {
  return timeComparable(first).localeCompare(timeComparable(second));
}

function timeComparable(value: CalendarTimeValue): string {
  return value.instant ?? value.raw;
}

function inDateRange(value: CalendarTimeValue, start: string, end: string): boolean {
  const day = value.value.slice(0, 10);
  return day >= start && day <= end;
}

function validateRange(start: string, end: string, maxDays: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    throw new Error('Choose valid start and end dates.');
  const days = rangeDays(start, end);
  if (days < 0) throw new Error('The end of the expansion range must be on or after the start.');
  if (days > maxDays)
    throw new Error(`The expansion range cannot exceed ${maxDays.toLocaleString()} days.`);
}

function rangeDays(start: string, end: string): number {
  return Math.floor(
    (dateRangeTransport(end, false).getTime() - dateRangeTransport(start, false).getTime()) /
      86_400_000,
  );
}

function dateRangeTransport(value: string, endOfDay: boolean): Date {
  return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
}

function ruleParts(rule: string): Map<string, string> {
  return new Map(
    rule.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      return separator > 0
        ? [[part.slice(0, separator).trim().toUpperCase(), part.slice(separator + 1).trim()]]
        : [];
    }),
  );
}

function valueCount(value: string | undefined): number {
  return value ? value.split(',').length : 0;
}

function zoneLabel(value: CalendarTimeValue): string {
  if (value.kind === 'date') return 'All-day';
  if (value.kind === 'floating') return 'Floating';
  if (value.kind === 'utc') return 'UTC';
  return value.tzid ?? 'Unknown';
}

function occurrenceDisplay(value: CalendarTimeValue): string {
  return value.kind === 'utc' ? (value.instant ?? value.raw) : value.value;
}

function compareOccurrences(first: ExpandedOccurrence, second: ExpandedOccurrence): number {
  return timeComparable(first.startTime).localeCompare(timeComparable(second.startTime));
}

function recurrenceDiagnostic(
  code: CalendarDiagnostic['code'],
  message: string,
  event: CalendarEvent,
): CalendarDiagnostic {
  return {
    severity: 'warning',
    code,
    message,
    ...(event.uid ? { eventUid: event.uid } : {}),
    eventTitle: event.title,
    sourceFile: event.sourceFile,
  };
}

function dedupeDiagnostics(diagnostics: CalendarDiagnostic[]): CalendarDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}|${diagnostic.eventUid ?? ''}|${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Compatibility wrapper retained for callers from Runs 1–3. */
export interface Occurrence extends Record<string, unknown> {
  title: string;
  start: string;
  end: string;
  timezone: string;
  time_kind: string;
  uid: string;
  source_file: string;
}

export function expandEvent(
  event: CalendarEvent,
  from: Date,
  to: Date,
  limit: number,
): Occurrence[] {
  const result = expandRecurrences({
    events: [event],
    rangeStart: from.toISOString().slice(0, 10),
    rangeEnd: to.toISOString().slice(0, 10),
    limits: { maxOccurrencesPerSeries: limit, maxTotalOccurrences: limit },
  });
  if (result.truncated)
    throw new Error(
      `“${event.title}” generates more than the safe limit of ${limit} occurrences in this range.`,
    );
  return result.occurrences.map((occurrence) => ({
    title: occurrence.title,
    start: occurrence.occurrence_start,
    end: occurrence.occurrence_end,
    timezone: occurrence.timezone,
    time_kind: occurrence.time_kind,
    uid: occurrence.uid,
    source_file: occurrence.source_file,
  }));
}
