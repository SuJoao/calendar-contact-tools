import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarEventToCsvRow, calendarCsvColumns } from '../features/ics/csv';
import { mergeCalendars } from '../features/ics/merge';
import { parseIcs } from '../features/ics/parser';
import { foldIcsLine, serializeCalendar } from '../features/ics/serializer';
import { shouldUseCalendarWorker } from '../features/ics/workers/client';
import { toCsv } from '../utils/csv';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), 'utf8');
}

describe('ICS serialization', () => {
  it.each(['escaped-text.ics', 'floating-time.ics', 'all-day.ics', 'timezone-lisbon.ics'])(
    'preserves semantic time and identity through %s round trip',
    (name) => {
      const first = parseIcs(fixture(name));
      const serialized = serializeCalendar(first.events, { metadata: first.metadata });
      const second = parseIcs(serialized);
      expect(second.events).toHaveLength(first.events.length);
      expect(second.events[0]).toMatchObject({
        uid: first.events[0]!.uid,
        title: first.events[0]!.title,
        timeKind: first.events[0]!.timeKind,
        timezone: first.events[0]!.timezone,
        startTime: {
          kind: first.events[0]!.startTime.kind,
          raw: first.events[0]!.startTime.raw,
        },
      });
    },
  );

  it('uses CRLF and folds long UTF-8 lines to at most 75 octets', () => {
    const event = parseIcs(fixture('escaped-text.ics')).events[0]!;
    event.description = 'Calendário '.repeat(30);
    const serialized = serializeCalendar([event]);
    expect(serialized).toContain('\r\n ');
    expect(serialized.replaceAll('\r\n', '')).not.toContain('\n');
    for (const line of serialized.trimEnd().split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('escapes text and preserves UID, recurrence metadata, TZID, and X-properties', () => {
    const source = fixture('custom-properties.ics').replace(
      'SUMMARY:Custom metadata',
      'SUMMARY:Comma\\, line\\nvalue\nRRULE:FREQ=DAILY;COUNT=2',
    );
    const event = parseIcs(source).events[0]!;
    const output = serializeCalendar([event]);
    expect(output).toContain('UID:custom@example.test');
    expect(output).toContain('RRULE:FREQ=DAILY;COUNT=2');
    expect(output).toContain('X-FICTIONAL-COLOR:cobalt');
    expect(parseIcs(output).events[0]!.title).toBe('Comma, line\nvalue');
  });

  it('folds an individual multibyte property safely', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'é'.repeat(80)}`);
    expect(folded.length).toBeGreaterThan(1);
    expect(folded.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it('keeps embedded VTIMEZONE definitions accessible across serialization', () => {
    const source = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:Custom/Test',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0000',
      'TZOFFSETTO:+0100',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:custom-zone@example.test',
      'DTSTART;TZID=Custom/Test:20260808T120000',
      'SUMMARY:Custom timezone',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const parsed = parseIcs(source);
    expect(parsed.metadata.vtimezones).toHaveLength(1);
    expect(parsed.events[0]!.startTime).toMatchObject({
      kind: 'zoned',
      tzid: 'Custom/Test',
      value: '2026-08-08T12:00:00',
    });
    const serialized = serializeCalendar(parsed.events, { metadata: parsed.metadata });
    expect(serialized).toContain('BEGIN:VTIMEZONE');
    expect(parseIcs(serialized).metadata.vtimezones).toHaveLength(1);
  });
});

describe('calendar CSV and merge output', () => {
  it('exports commas, quotes, line breaks, Unicode, empty fields, attendees, and categories', () => {
    const event = parseIcs(fixture('escaped-text.ics'), 'Núria calendar.ics').events[0]!;
    event.description = 'Quoted "value"\nnext line';
    const row = calendarEventToCsvRow(event);
    const csv = toCsv([row], [...calendarCsvColumns]);
    expect(csv).toContain('"Quoted ""value""\nnext line"');
    expect(csv).toContain('Núria, Test');
    expect(csv).toContain('Research; Calendars');
    expect(csv).toContain('Núria calendar.ics');
  });

  it('does not browser-shift floating or all-day CSV values', () => {
    const floating = parseIcs(fixture('floating-time.ics')).events[0]!;
    const allDay = parseIcs(fixture('all-day.ics')).events[0]!;
    expect(
      calendarEventToCsvRow(floating, { dateFormat: 'locale', timezoneOutput: 'local' }).start,
    ).toBe('2026-08-08T12:00:00');
    expect(
      calendarEventToCsvRow(allDay, { dateFormat: 'locale', timezoneOutput: 'utc' }).start,
    ).toBe('2026-08-08');
  });

  it('merges normalized events into a parseable calendar and reports duplicates', () => {
    const source = fixture('duplicate-uid.ics');
    const analysis = mergeCalendars([{ name: 'duplicates.ics', text: source }]);
    const merged = mergeCalendars([{ name: 'duplicates.ics', text: source }], new Set([1]));
    expect(analysis.included).toBe(2);
    expect(merged.duplicates).toBe(1);
    expect(merged.included).toBe(1);
    expect(parseIcs(merged.content).events).toHaveLength(1);
  });

  it('uses a worker only above the configured boundary', () => {
    expect(shouldUseCalendarWorker([{ name: 'small.ics', text: 'x'.repeat(100) }], 1_000)).toBe(
      false,
    );
    expect(shouldUseCalendarWorker([{ name: 'large.ics', text: 'x'.repeat(1_200) }], 1_000)).toBe(
      true,
    );
  });
});
