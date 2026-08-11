import type { CalendarEvent, CalendarMetadata, CalendarTimeValue } from './model';

export interface SerializeCalendarOptions {
  metadata?: Partial<CalendarMetadata>;
  calendarName?: string;
}

export function serializeCalendar(
  events: readonly CalendarEvent[],
  options: SerializeCalendarOptions = {},
): string {
  const metadata = options.metadata ?? {};
  const lines = [
    'BEGIN:VCALENDAR',
    `VERSION:${safeScalar(metadata.version || '2.0')}`,
    `PRODID:${safeScalar(metadata.prodid || '-//Calendar Contact Tools//EN')}`,
    ...(metadata.calscale ? [`CALSCALE:${safeScalar(metadata.calscale)}`] : []),
    ...(metadata.method ? [`METHOD:${safeScalar(metadata.method)}`] : []),
    ...(options.calendarName || metadata.name
      ? [`X-WR-CALNAME:${escapeText(options.calendarName || metadata.name || '')}`]
      : []),
    ...(metadata.description ? [`X-WR-CALDESC:${escapeText(metadata.description)}`] : []),
    ...(metadata.timezone ? [`X-WR-TIMEZONE:${safeScalar(metadata.timezone)}`] : []),
    ...(metadata.refreshInterval
      ? [`REFRESH-INTERVAL:${safeScalar(metadata.refreshInterval)}`]
      : []),
    ...(metadata.color ? [`COLOR:${safeScalar(metadata.color)}`] : []),
    ...(metadata.source ? [`SOURCE:${safeScalar(metadata.source)}`] : []),
    ...(metadata.vendorProperties ?? []).map((line) => unfoldLines(line)),
    ...(metadata.vtimezones ?? []).flatMap((block) => unfoldLines(block).split('\r\n')),
    ...events.flatMap(serializeEventLines),
    'END:VCALENDAR',
  ];
  return `${lines.flatMap(foldLine).join('\r\n')}\r\n`;
}

export function serializeEvent(event: CalendarEvent): string {
  return serializeEventLines(event).flatMap(foldLine).join('\r\n');
}

export function escapeIcsText(value: string): string {
  return escapeText(value);
}

export function foldIcsLine(line: string): string[] {
  return foldLine(line);
}

function serializeEventLines(event: CalendarEvent): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    ...(event.dtstamp ? [serializeTime('DTSTAMP', event.dtstamp)] : []),
    serializeTime('DTSTART', event.startTime),
    ...(event.endTime ? [serializeTime('DTEND', event.endTime)] : []),
    ...(!event.endTime && event.duration ? [`DURATION:${safeScalar(event.duration)}`] : []),
    `SUMMARY:${escapeText(event.title === '(Untitled event)' ? '' : event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...preservedParticipantLines(event, 'ORGANIZER', event.organizer),
    ...preservedAttendeeLines(event),
    ...(event.status ? [`STATUS:${safeScalar(event.status)}`] : []),
    ...(event.sequence !== undefined ? [`SEQUENCE:${event.sequence}`] : []),
    ...(event.rrule ? [`RRULE:${safeScalar(event.rrule)}`] : []),
    ...event.rdates.map((value) => serializeTime('RDATE', value)),
    ...event.rawProperties
      .filter((property) => property.name === 'RDATE' && property.value.includes('/'))
      .map((property) => unfoldLines(property.raw)),
    ...event.exdates.map((value) => serializeTime('EXDATE', value)),
    ...(event.recurrenceId
      ? [
          serializeTime(
            'RECURRENCE-ID',
            event.recurrenceId,
            event.recurrenceRange ? `;RANGE=${safeScalar(event.recurrenceRange)}` : '',
          ),
        ]
      : []),
    ...(event.created ? [serializeTime('CREATED', event.created)] : []),
    ...(event.lastModified ? [serializeTime('LAST-MODIFIED', event.lastModified)] : []),
    ...(event.categories.length
      ? [`CATEGORIES:${event.categories.map(escapeText).join(',')}`]
      : []),
    ...preservedSingleLines(event, 'URL', event.url ? `URL:${safeScalar(event.url)}` : ''),
    ...preservedSingleLines(event, 'GEO', event.geo ? `GEO:${safeScalar(event.geo)}` : ''),
    ...event.rawProperties
      .filter((property) => property.name.startsWith('X-'))
      .map((property) => unfoldLines(property.raw)),
    'END:VEVENT',
  ];
  return lines;
}

function preservedParticipantLines(
  event: CalendarEvent,
  name: 'ORGANIZER',
  fallback: string,
): string[] {
  const preserved = event.rawProperties
    .filter((property) => property.name === name)
    .map((property) => unfoldLines(property.raw));
  if (preserved.length || !fallback) return preserved;
  return [`${name}:mailto:${safeScalar(fallback)}`];
}

function preservedAttendeeLines(event: CalendarEvent): string[] {
  const preserved = event.rawProperties
    .filter((property) => property.name === 'ATTENDEE')
    .map((property) => unfoldLines(property.raw));
  if (preserved.length) return preserved;
  return event.attendees.map((attendee) => `ATTENDEE:mailto:${safeScalar(attendee)}`);
}

function preservedSingleLines(event: CalendarEvent, name: string, fallback: string): string[] {
  const preserved = event.rawProperties.find((property) => property.name === name);
  if (preserved) return [unfoldLines(preserved.raw)];
  return fallback ? [fallback] : [];
}

function serializeTime(name: string, time: CalendarTimeValue, extraParameters = ''): string {
  if (time.kind === 'date') return `${name};VALUE=DATE${extraParameters}:${time.raw}`;
  if (time.kind === 'zoned')
    return `${name};TZID=${quoteParameter(time.tzid ?? '')}${extraParameters}:${time.raw}`;
  return `${name}${extraParameters}:${time.raw}`;
}

function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;');
}

function safeScalar(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

function quoteParameter(value: string): string {
  const safe = safeScalar(value).replaceAll('"', "'");
  return /[:;,]/.test(safe) ? `"${safe}"` : safe;
}

function unfoldLines(value: string): string {
  return value.replace(/\r\n?|\n/g, '\r\n').replace(/\r\n[ \t]/g, '');
}

function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const output: string[] = [];
  let current = '';
  let limit = 75;
  for (const character of line) {
    if (encoder.encode(current + character).length > limit && current) {
      output.push(current);
      current = ` ${character}`;
      limit = 75;
    } else {
      current += character;
    }
  }
  output.push(current);
  return output;
}
