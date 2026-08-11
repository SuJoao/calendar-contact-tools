import type {
  CalendarDiagnosticCode,
  CalendarEvent,
  CalendarMetadata,
  CalendarTimeKind,
  CalendarTimeValue,
} from './model';
import { serializeCalendar } from './serializer';
import {
  basicDateTimeText,
  dateToBasicInZone,
  isSupportedTimezone,
  resolveWallTime,
} from './timezone';

export interface TimezoneAnalysis {
  total: number;
  utc: number;
  zoned: number;
  floating: number;
  allDay: number;
  unknown: number;
  ambiguous: number;
  nonexistent: number;
  vtimezones: number;
  identifiers: Record<string, number>;
}

export type TimezoneOperation = 'inspect' | 'convert' | 'assign';
export type TimezoneResultStatus = 'changed' | 'unchanged' | 'warning' | 'blocked';

export interface TimezoneTransformRequest {
  operation: TimezoneOperation;
  sourceTimezone?: string;
  targetTimezone?: string;
  selectedIndexes?: ReadonlySet<number>;
}

export interface TimezonePreviewRow {
  eventIndex: number;
  event: string;
  originalStart: string;
  originalZone: string;
  newStart: string;
  newZone: string;
  result: TimezoneResultStatus;
  message: string;
  diagnosticCode?: CalendarDiagnosticCode;
}

export interface TimezoneTransformResult {
  sourceEvents: readonly CalendarEvent[];
  events: CalendarEvent[];
  rows: TimezonePreviewRow[];
  changed: number;
  blocked: number;
  warnings: number;
  content: string;
}

export function analyzeEventTimezones(
  events: readonly CalendarEvent[],
  metadata?: Pick<CalendarMetadata, 'vtimezones'>,
): TimezoneAnalysis {
  const analysis: TimezoneAnalysis = {
    total: events.length,
    utc: 0,
    zoned: 0,
    floating: 0,
    allDay: 0,
    unknown: 0,
    ambiguous: 0,
    nonexistent: 0,
    vtimezones: metadata?.vtimezones.length ?? 0,
    identifiers: {},
  };
  for (const event of events) {
    analysis[kindCount(event.startTime.kind)] += 1;
    const identifier = zoneLabel(event.startTime);
    analysis.identifiers[identifier] = (analysis.identifiers[identifier] ?? 0) + 1;
    for (const value of eventTimes(event)) {
      if (value.kind !== 'zoned' || !value.tzid) continue;
      if (!isSupportedTimezone(value.tzid)) {
        analysis.unknown += 1;
        continue;
      }
      const resolution = resolveWallTime(value.raw, value.tzid);
      if (resolution.status === 'ambiguous') analysis.ambiguous += 1;
      if (resolution.status === 'nonexistent') analysis.nonexistent += 1;
    }
  }
  return analysis;
}

export function previewTimezoneTransform(
  sourceEvents: readonly CalendarEvent[],
  metadata: CalendarMetadata,
  request: TimezoneTransformRequest,
): TimezoneTransformResult {
  const events = sourceEvents.map(cloneEvent);
  const rows: TimezonePreviewRow[] = [];
  for (const [index, original] of sourceEvents.entries()) {
    const selected = !request.selectedIndexes || request.selectedIndexes.has(index);
    const outcome = !selected
      ? unchanged(original, index, 'Not selected.')
      : transformEvent(original, index, request);
    events[index] = outcome.event;
    rows.push(outcome.row);
  }
  return {
    sourceEvents,
    events,
    rows,
    changed: rows.filter((row) => row.result === 'changed').length,
    blocked: rows.filter((row) => row.result === 'blocked').length,
    warnings: rows.filter((row) => row.result === 'warning').length,
    content: serializeCalendar(events, { metadata }),
  };
}

function transformEvent(
  event: CalendarEvent,
  index: number,
  request: TimezoneTransformRequest,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  if (request.operation === 'inspect') return unchanged(event, index, 'Inspection only.');
  if (event.startTime.kind === 'date')
    return unchanged(event, index, 'All-day dates are protected and never shifted.');
  const target = request.targetTimezone?.trim() ?? '';
  if (!target || (target !== 'UTC' && !isSupportedTimezone(target)))
    return blocked(
      event,
      index,
      `Target timezone “${target || '(empty)'}” is not recognized.`,
      'UNKNOWN_TIMEZONE',
    );

  if (request.operation === 'assign') return assignEvent(event, index, target);
  return convertEvent(event, index, request.sourceTimezone?.trim() ?? '', target);
}

function assignEvent(
  event: CalendarEvent,
  index: number,
  target: string,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  if (event.startTime.kind !== 'floating')
    return unchanged(event, index, 'Only floating date-times can be assigned a timezone.');
  const values = eventTimes(event).filter((value) => value.kind === 'floating');
  for (const value of values) {
    const resolution =
      target === 'UTC' ? { status: 'valid' as const } : resolveWallTime(value.raw, target);
    if (resolution.status === 'ambiguous')
      return blocked(
        event,
        index,
        `The wall time occurs twice in ${target}; no instant was chosen.`,
        'AMBIGUOUS_LOCAL_TIME',
      );
    if (resolution.status === 'nonexistent')
      return blocked(
        event,
        index,
        `The wall time does not exist in ${target}; it was not adjusted.`,
        'NONEXISTENT_LOCAL_TIME',
      );
  }
  const transformed = mapEventTimes(event, (value) =>
    value.kind === 'floating' ? assignValue(value, target) : value,
  );
  return changed(event, transformed, index, 'Wall-clock time preserved; timezone assigned.');
}

function convertEvent(
  event: CalendarEvent,
  index: number,
  source: string,
  target: string,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  if (event.startTime.kind === 'floating')
    return {
      ...unchanged(event, index, 'Floating time was not interpreted automatically.'),
      row: {
        ...rowBase(event, index),
        result: 'warning',
        message: 'Floating time was not interpreted automatically. Use Assign timezone instead.',
        diagnosticCode: 'TIMEZONE_CONVERSION_UNSAFE',
      },
    };
  const eventZone = zoneLabel(event.startTime);
  if (source && source !== eventZone)
    return unchanged(event, index, `Source timezone is ${eventZone}, not ${source}.`);
  if (!event.startTime.instant)
    return blocked(
      event,
      index,
      'The source instant is unknown, so conversion would require guessing.',
      event.startTime.tzid && !isSupportedTimezone(event.startTime.tzid)
        ? 'UNKNOWN_TIMEZONE'
        : 'TIMEZONE_CONVERSION_UNSAFE',
    );
  if (event.rrule)
    return blocked(
      event,
      index,
      'Recurring timezone conversion may change future instances across DST and is not applied.',
      'RECURRENCE_TIMEZONE_WARNING',
    );
  const temporalValues = [event.startTime, ...(event.endTime ? [event.endTime] : [])];
  if (temporalValues.some((value) => value.kind !== 'date' && !value.instant))
    return blocked(
      event,
      index,
      'At least one event boundary has no safe instant; the event is unchanged.',
      'TIMEZONE_CONVERSION_UNSAFE',
    );
  const transformed = mapEventTimes(event, (value) => {
    if (value.kind === 'date' || value.kind === 'floating' || !value.instant) return value;
    return convertValue(value, target);
  });
  return changed(
    event,
    transformed,
    index,
    'Absolute instant preserved; wall-clock time converted.',
  );
}

function mapEventTimes(
  event: CalendarEvent,
  map: (value: CalendarTimeValue) => CalendarTimeValue,
): CalendarEvent {
  const startTime = map(event.startTime);
  const endTime = event.endTime ? map(event.endTime) : undefined;
  const transformed: CalendarEvent = {
    ...cloneEvent(event),
    startTime,
    ...(endTime ? { endTime } : {}),
    start: startTime.instant ?? startTime.value,
    end: endTime?.instant ?? endTime?.value ?? '',
    timeKind: startTime.kind,
    timezone: zoneLabel(startTime),
    rdates: event.rdates.map(map),
    exdates: event.exdates.map(map),
    ...(event.recurrenceId ? { recurrenceId: map(event.recurrenceId) } : {}),
  };
  return transformed;
}

function assignValue(value: CalendarTimeValue, target: string): CalendarTimeValue {
  if (target === 'UTC') {
    const instant = new Date(`${basicDateTimeText(value.raw)}Z`).toISOString();
    return { kind: 'utc', raw: `${value.raw}Z`, value: value.value, instant };
  }
  const resolution = resolveWallTime(value.raw, target);
  return {
    kind: 'zoned',
    raw: value.raw,
    value: value.value,
    tzid: target,
    instant: resolution.instants[0]!.toISOString(),
  };
}

function convertValue(value: CalendarTimeValue, target: string): CalendarTimeValue {
  const instant = new Date(value.instant!);
  const preservedInstant = value.instant!;
  const raw = dateToBasicInZone(instant, target);
  if (target === 'UTC')
    return {
      kind: 'utc',
      raw: `${raw}Z`,
      value: basicDateTimeText(raw),
      instant: preservedInstant,
    };
  return {
    kind: 'zoned',
    raw,
    value: basicDateTimeText(raw),
    tzid: target,
    instant: preservedInstant,
  };
}

function changed(
  original: CalendarEvent,
  transformed: CalendarEvent,
  index: number,
  message: string,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  return {
    event: transformed,
    row: {
      ...rowBase(original, index),
      newStart: transformed.startTime.value,
      newZone: zoneLabel(transformed.startTime),
      result: 'changed',
      message,
    },
  };
}

function unchanged(
  event: CalendarEvent,
  index: number,
  message: string,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  return {
    event: cloneEvent(event),
    row: { ...rowBase(event, index), result: 'unchanged', message },
  };
}

function blocked(
  event: CalendarEvent,
  index: number,
  message: string,
  diagnosticCode: CalendarDiagnosticCode,
): { event: CalendarEvent; row: TimezonePreviewRow } {
  return {
    event: cloneEvent(event),
    row: { ...rowBase(event, index), result: 'blocked', message, diagnosticCode },
  };
}

function rowBase(
  event: CalendarEvent,
  index: number,
): Omit<TimezonePreviewRow, 'result' | 'message'> {
  return {
    eventIndex: index,
    event: event.title,
    originalStart: event.startTime.value,
    originalZone: zoneLabel(event.startTime),
    newStart: event.startTime.value,
    newZone: zoneLabel(event.startTime),
  };
}

function eventTimes(event: CalendarEvent): CalendarTimeValue[] {
  return [
    event.startTime,
    ...(event.endTime ? [event.endTime] : []),
    ...event.rdates,
    ...event.exdates,
    ...(event.recurrenceId ? [event.recurrenceId] : []),
  ];
}

function kindCount(kind: CalendarTimeKind): 'utc' | 'zoned' | 'floating' | 'allDay' {
  return kind === 'date' ? 'allDay' : kind;
}

function zoneLabel(value: CalendarTimeValue): string {
  if (value.kind === 'date') return 'All-day';
  if (value.kind === 'floating') return 'Floating';
  if (value.kind === 'utc') return 'UTC';
  return value.tzid ?? 'Unknown';
}

function cloneEvent(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    startTime: { ...event.startTime },
    ...(event.endTime ? { endTime: { ...event.endTime } } : {}),
    rdates: event.rdates.map((value) => ({ ...value })),
    exdates: event.exdates.map((value) => ({ ...value })),
    ...(event.recurrenceId ? { recurrenceId: { ...event.recurrenceId } } : {}),
    attendees: [...event.attendees],
    categories: [...event.categories],
    rawProperties: event.rawProperties.map((property) => ({ ...property })),
    diagnostics: [...event.diagnostics],
  };
}
