import ICAL from 'ical.js';
import { RRule } from 'rrule';
import type {
  CalendarDiagnostic,
  CalendarEvent,
  CalendarRawProperty,
  CalendarTimeValue,
} from './model';
import {
  basicDateText,
  basicDateTimeText,
  basicUtcToDate,
  isSupportedTimezone,
  resolveWallTime,
} from './timezone';

export function normalizeEventComponent(
  component: ICAL.Component,
  sourceFile: string,
  line: number,
  maxAttendees: number,
): CalendarEvent {
  const rawProperties = component.getAllProperties().map(toRawProperty);
  const uid = propertyText(component.getFirstProperty('uid'));
  const title = propertyText(component.getFirstProperty('summary')) || '(Untitled event)';
  const diagnostics: CalendarDiagnostic[] = [];
  const context: Pick<CalendarDiagnostic, 'sourceFile' | 'line' | 'eventUid' | 'eventTitle'> = {
    sourceFile,
    line,
    eventTitle: title,
    ...(uid ? { eventUid: uid } : {}),
  };

  for (const propertyName of [
    'uid',
    'summary',
    'dtstart',
    'dtend',
    'duration',
    'status',
    'sequence',
    'recurrence-id',
  ]) {
    if (component.getAllProperties(propertyName).length > 1)
      diagnostics.push({
        severity: 'warning',
        code: 'DUPLICATE_PROPERTY',
        message: `Duplicate ${propertyName.toUpperCase()} properties were found; the first value is used.`,
        property: propertyName.toUpperCase(),
        ...context,
      });
  }
  if (!uid)
    diagnostics.push({
      severity: 'warning',
      code: 'MISSING_UID',
      message: 'The event has no UID.',
      property: 'UID',
      ...context,
    });

  const startProperty = component.getFirstProperty('dtstart');
  if (!startProperty) throw new Error('An event without DTSTART was skipped.');
  const startTime = normalizeTime(startProperty, 'DTSTART', diagnostics, context);
  const endProperty = component.getFirstProperty('dtend');
  const endTime = endProperty
    ? normalizeTime(endProperty, 'DTEND', diagnostics, context)
    : undefined;
  const attendees = component.getAllProperties('attendee').map(propertyText).filter(Boolean);
  if (attendees.length > maxAttendees)
    throw new Error(
      `An event exceeds the ${maxAttendees.toLocaleString()} attendee safety limit and was skipped.`,
    );
  const rruleProperty = component.getFirstProperty('rrule');
  const rrule = rruleProperty ? rawValue(rruleProperty) : '';
  if (rrule) {
    try {
      RRule.fromString(rrule);
    } catch {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_RRULE',
        message: 'The recurrence rule is invalid and cannot be expanded.',
        property: 'RRULE',
        ...context,
      });
    }
  }

  const sequenceText = propertyText(component.getFirstProperty('sequence'));
  const sequence = sequenceText === '' ? undefined : Number(sequenceText);
  const recurrenceIdProperty = component.getFirstProperty('recurrence-id');
  const recurrenceRangeValue = recurrenceIdProperty?.getParameter('range');
  const recurrenceRange =
    typeof recurrenceRangeValue === 'string' ? recurrenceRangeValue.toUpperCase() : '';
  const createdProperty = component.getFirstProperty('created');
  const modifiedProperty = component.getFirstProperty('last-modified');
  const stampProperty = component.getFirstProperty('dtstamp');
  const exdates = component
    .getAllProperties('exdate')
    .flatMap((property) => normalizeTimeList(property, 'EXDATE', diagnostics, context));
  const rdates = component
    .getAllProperties('rdate')
    .flatMap((property) => normalizeTimeList(property, 'RDATE', diagnostics, context));
  const categories = component
    .getAllProperties('categories')
    .flatMap((property) => property.getValues().map((value) => String(value)))
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    uid,
    title,
    description: propertyText(component.getFirstProperty('description')),
    location: propertyText(component.getFirstProperty('location')),
    start: startTime.instant ?? startTime.value,
    end: endTime?.instant ?? endTime?.value ?? '',
    startTime,
    ...(endTime ? { endTime } : {}),
    duration: propertyText(component.getFirstProperty('duration')),
    allDay: startTime.kind === 'date',
    timezone:
      startTime.kind === 'zoned'
        ? startTime.tzid!
        : startTime.kind === 'utc'
          ? 'UTC'
          : startTime.kind === 'date'
            ? 'All-day'
            : 'Floating',
    timeKind: startTime.kind,
    organizer: propertyText(component.getFirstProperty('organizer')),
    attendees,
    status: propertyText(component.getFirstProperty('status')),
    rrule,
    rdates,
    exdates,
    ...(recurrenceIdProperty
      ? {
          recurrenceId: normalizeTime(recurrenceIdProperty, 'RECURRENCE-ID', diagnostics, context),
        }
      : {}),
    ...(recurrenceRange ? { recurrenceRange } : {}),
    ...(sequence !== undefined && Number.isFinite(sequence) ? { sequence } : {}),
    ...(createdProperty
      ? { created: normalizeTime(createdProperty, 'CREATED', diagnostics, context) }
      : {}),
    ...(modifiedProperty
      ? {
          lastModified: normalizeTime(modifiedProperty, 'LAST-MODIFIED', diagnostics, context),
        }
      : {}),
    ...(stampProperty
      ? { dtstamp: normalizeTime(stampProperty, 'DTSTAMP', diagnostics, context) }
      : {}),
    categories,
    url: propertyText(component.getFirstProperty('url')),
    geo: propertyText(component.getFirstProperty('geo')),
    sourceFile,
    rawProperties,
    diagnostics,
    raw: component.toString(),
  };
}

function normalizeTime(
  property: ICAL.Property,
  propertyName: string,
  diagnostics: CalendarDiagnostic[],
  context: Pick<CalendarDiagnostic, 'sourceFile' | 'line' | 'eventUid' | 'eventTitle'>,
): CalendarTimeValue {
  const raw = rawValue(property);
  const tzidValue = property.getParameter('tzid');
  const tzid = typeof tzidValue === 'string' ? tzidValue : undefined;
  const valueKind = String(property.getParameter('value') ?? '').toUpperCase();
  if (valueKind === 'DATE' || /^\d{8}$/.test(raw)) {
    const value = basicDateText(raw);
    if (!isValidDateOnly(raw)) {
      invalidDate(diagnostics, propertyName, context);
      throw new Error(`${propertyName} contains an invalid calendar date.`);
    }
    return { kind: 'date', raw, value };
  }
  if (!/^\d{8}T\d{6}Z?$/.test(raw)) {
    invalidDate(diagnostics, propertyName, context);
    throw new Error(`${propertyName} is not a supported RFC 5545 date-time.`);
  }
  const basic = raw.replace(/Z$/, '');
  const value = basicDateTimeText(basic);
  if (value === basic) {
    invalidDate(diagnostics, propertyName, context);
    throw new Error(`${propertyName} contains an invalid calendar date-time.`);
  }
  if (raw.endsWith('Z')) {
    const instant = basicUtcToDate(basic).toISOString();
    return { kind: 'utc', raw, value, instant };
  }
  if (tzid) {
    if (!isSupportedTimezone(tzid)) {
      diagnostics.push({
        severity: 'warning',
        code: 'UNKNOWN_TIMEZONE',
        message: `The timezone “${tzid}” is not recognized by this browser; wall-clock time is preserved.`,
        property: propertyName,
        ...context,
      });
      return { kind: 'zoned', raw, value, tzid };
    }
    const resolution = resolveWallTime(basic, tzid);
    if (resolution.status === 'ambiguous') {
      diagnostics.push({
        severity: 'warning',
        code: 'AMBIGUOUS_LOCAL_TIME',
        message: `The local time occurs twice in ${tzid}; no instant was assumed.`,
        property: propertyName,
        ...context,
      });
      return { kind: 'zoned', raw, value, tzid };
    }
    if (resolution.status === 'nonexistent') {
      invalidDate(
        diagnostics,
        propertyName,
        context,
        `The local time does not exist in ${tzid} because of a clock change.`,
      );
      return { kind: 'zoned', raw, value, tzid };
    }
    return {
      kind: 'zoned',
      raw,
      value,
      tzid,
      instant: resolution.instants[0]!.toISOString(),
    };
  }
  return { kind: 'floating', raw, value };
}

function normalizeTimeList(
  property: ICAL.Property,
  propertyName: string,
  diagnostics: CalendarDiagnostic[],
  context: Pick<CalendarDiagnostic, 'sourceFile' | 'line' | 'eventUid' | 'eventTitle'>,
): CalendarTimeValue[] {
  const line = property.toICALString();
  const valueKind = String(property.getParameter('value') ?? '').toUpperCase();
  if (propertyName === 'RDATE' && (valueKind === 'PERIOD' || rawValue(property).includes('/'))) {
    diagnostics.push({
      severity: 'warning',
      code: 'UNSUPPORTED_RDATE_PERIOD',
      message: `${propertyName} PERIOD values are preserved in raw data but are not expanded.`,
      property: propertyName,
      ...context,
    });
    return [];
  }
  return rawValue(property)
    .split(',')
    .flatMap((value) => {
      try {
        const synthetic = new ICAL.Property(
          ICAL.parse.property(`${line.slice(0, line.indexOf(':'))}:${value}`),
        );
        return [normalizeTime(synthetic, propertyName, diagnostics, context)];
      } catch {
        return [];
      }
    });
}

function invalidDate(
  diagnostics: CalendarDiagnostic[],
  property: string,
  context: Pick<CalendarDiagnostic, 'sourceFile' | 'line' | 'eventUid' | 'eventTitle'>,
  message = `${property} contains an invalid calendar value.`,
): void {
  diagnostics.push({ severity: 'error', code: 'INVALID_DATE', message, property, ...context });
}

function propertyText(property: ICAL.Property | null): string {
  if (!property) return '';
  const value = String(property.getFirstValue() ?? '');
  const cn = property.getParameter('cn');
  return cn ? `${String(cn)} <${value.replace(/^mailto:/i, '')}>` : value.replace(/^mailto:/i, '');
}

function toRawProperty(property: ICAL.Property): CalendarRawProperty {
  const json = property.toJSON() as unknown[];
  return {
    name: property.name.toUpperCase(),
    value: rawValue(property),
    parameters: (json[1] ?? {}) as Record<string, string | string[]>,
    raw: property.toICALString(),
  };
}

function rawValue(property: ICAL.Property): string {
  const line = property.toICALString();
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ':' && !quoted) return line.slice(index + 1).replace(/\r?\n[ \t]/g, '');
  }
  return '';
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
