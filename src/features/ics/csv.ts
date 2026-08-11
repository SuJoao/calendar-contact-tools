import type { CalendarEvent, CalendarTimeValue } from './model';

export const calendarCsvColumns = [
  'title',
  'start',
  'end',
  'timezone',
  'time_kind',
  'all_day',
  'location',
  'description',
  'organizer',
  'attendees',
  'categories',
  'recurrence_rule',
  'status',
  'uid',
  'source_file',
] as const;

export type CalendarCsvColumn = (typeof calendarCsvColumns)[number];

export interface CalendarCsvOptions {
  dateFormat: 'iso' | 'locale';
  timezoneOutput: 'original' | 'utc' | 'local';
}

export function calendarEventToCsvRow(
  event: CalendarEvent,
  options: CalendarCsvOptions = { dateFormat: 'iso', timezoneOutput: 'original' },
): Record<CalendarCsvColumn, string | boolean> {
  return {
    title: event.title,
    start: formatCalendarTime(event.startTime, options),
    end: event.endTime ? formatCalendarTime(event.endTime, options) : '',
    timezone: event.timezone,
    time_kind: event.timeKind,
    all_day: event.allDay,
    location: event.location,
    description: event.description,
    organizer: event.organizer,
    attendees: event.attendees.join('; '),
    categories: event.categories.join('; '),
    recurrence_rule: event.rrule,
    status: event.status,
    uid: event.uid,
    source_file: event.sourceFile,
  };
}

function formatCalendarTime(value: CalendarTimeValue, options: CalendarCsvOptions): string {
  // Date-only and floating values are not instants and must never be browser-shifted.
  if (value.kind === 'date' || value.kind === 'floating' || !value.instant) return value.value;
  if (options.timezoneOutput === 'original') return value.value;
  const date = new Date(value.instant);
  if (options.dateFormat === 'locale') {
    return date.toLocaleString(undefined, {
      ...(options.timezoneOutput === 'utc' ? { timeZone: 'UTC' } : {}),
    });
  }
  return options.timezoneOutput === 'utc' ? date.toISOString() : localIso(date);
}

function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (value: number): string => String(Math.abs(value)).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}
