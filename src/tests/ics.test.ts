import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventDuplicateKey, findEventDuplicates } from '../features/ics/duplicateDetection';
import { parseIcs } from '../features/ics/parser';
import { expandEvent } from '../features/ics/recurrence';
import {
  assignFloatingTimezone,
  convertTimezone,
  inspectTimezones,
  resolveWallTime,
  wallTimeToDate,
} from '../features/ics/timezone';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), 'utf8');
}

describe('ICS parsing and recovery', () => {
  it('parses standard CRLF and LF calendars through the same path', () => {
    const source = fixture('escaped-text.ics');
    expect(parseIcs(source).events).toHaveLength(1);
    expect(parseIcs(source.replaceAll('\n', '\r\n')).events).toHaveLength(1);
  });

  it('unfolds space and tab continuations', () => {
    const event = parseIcs(fixture('folded-lines.ics')).events[0]!;
    expect(event.title).toBe('A folded summary that continuesacross a space');
    expect(event.description).toBe('First partand a tab continuation');
  });

  it('decodes escaped text, quoted parameters, Unicode, colons, and repeated values', () => {
    const event = parseIcs(fixture('escaped-text.ics')).events[0]!;
    expect(event).toMatchObject({
      title: 'Comma, semicolon; colon: preserved',
      description: 'First line\nSecond line',
      location: 'Room, 4; north',
      organizer: 'Example: Coordinator <coordinator@example.test>',
      url: 'https://example.test/path:segment',
    });
    expect(event.attendees).toEqual(['Núria, Test <nuria@example.test>']);
    expect(event.categories).toEqual(['Research', 'Calendars']);
  });

  it('preserves calendar metadata, sequence, timestamps, GEO, and X-properties', () => {
    const result = parseIcs(fixture('custom-properties.ics'));
    expect(result.metadata).toMatchObject({
      prodid: '-//Fictional Calendar//EN',
      method: 'PUBLISH',
      calscale: 'GREGORIAN',
    });
    expect(result.events[0]).toMatchObject({
      sequence: 3,
      status: 'TENTATIVE',
      geo: '38.7223,-9.1393',
    });
    expect(
      result.events[0]!.rawProperties.some((property) => property.name === 'X-FICTIONAL-COLOR'),
    ).toBe(true);
  });

  it('parses multiple events and multiple calendar wrappers', () => {
    const first = fixture('floating-time.ics');
    const second = fixture('all-day.ics');
    const result = parseIcs(`${first}\n${second}`, 'multiple.ics');
    expect(result.events.map((event) => event.uid)).toEqual([
      'floating@example.test',
      'all-day@example.test',
    ]);
  });

  it('recovers valid events around a malformed event with structured diagnostics', () => {
    const result = parseIcs(fixture('malformed-event.ics'), 'partial.ics');
    expect(result.events.map((event) => event.uid)).toEqual([
      'valid-before@example.test',
      'valid-after@example.test',
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'MALFORMED_EVENT',
          sourceFile: 'partial.ics',
        }),
      ]),
    );
  });

  it('recovers a complete event from a truncated calendar wrapper', () => {
    const result = parseIcs(fixture('truncated-calendar.ics'));
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics.some((item) => item.code === 'TRUNCATED_COMPONENT')).toBe(true);
  });

  it('reports missing UID and duplicate properties without inventing values', () => {
    const source = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:20260808T120000Z\nSUMMARY:First\nSUMMARY:Second\nEND:VEVENT\nEND:VCALENDAR`;
    const result = parseIcs(source);
    expect(result.events[0]!.uid).toBe('');
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(['MISSING_UID', 'DUPLICATE_PROPERTY']),
    );
  });

  it('rejects unrelated content and invalid date-only values', () => {
    expect(() => parseIcs('<script>alert(1)</script>')).toThrow(/not an ICS/);
    const invalid = fixture('all-day.ics').replace('20260808', '20260231');
    expect(parseIcs(invalid).events).toHaveLength(0);
  });
});

describe('calendar time semantics', () => {
  it('keeps UTC as an absolute instant', () => {
    const event = parseIcs(fixture('escaped-text.ics')).events[0]!;
    expect(event.startTime).toMatchObject({
      kind: 'utc',
      raw: '20260808T120000Z',
      instant: '2026-08-08T12:00:00.000Z',
    });
  });

  it('keeps named-zone wall time, TZID, and resolved instant', () => {
    const lisbon = parseIcs(fixture('timezone-lisbon.ics')).events[0]!;
    const newYork = parseIcs(fixture('timezone-new-york.ics')).events[0]!;
    expect(lisbon.startTime).toMatchObject({
      kind: 'zoned',
      value: '2026-08-08T12:00:00',
      tzid: 'Europe/Lisbon',
      instant: '2026-08-08T11:00:00.000Z',
    });
    expect(newYork.startTime.instant).toBe('2026-08-08T16:00:00.000Z');
  });

  it('does not assign an instant to floating time', () => {
    const event = parseIcs(fixture('floating-time.ics')).events[0]!;
    expect(event.startTime).toEqual({
      kind: 'floating',
      raw: '20260808T120000',
      value: '2026-08-08T12:00:00',
    });
    expect(event.timezone).toBe('Floating');
  });

  it('keeps all-day values date-only', () => {
    const event = parseIcs(fixture('all-day.ics')).events[0]!;
    expect(event.startTime).toEqual({ kind: 'date', raw: '20260808', value: '2026-08-08' });
    expect(event.allDay).toBe(true);
  });

  it.each([
    ['Europe/Lisbon', '20260329T013000', 'nonexistent'],
    ['Europe/Lisbon', '20261025T013000', 'ambiguous'],
    ['America/New_York', '20260308T023000', 'nonexistent'],
    ['America/New_York', '20261101T013000', 'ambiguous'],
  ] as const)('detects %s DST wall time %s as %s', (zone, value, status) => {
    expect(resolveWallTime(value, zone).status).toBe(status);
  });

  it.each([
    ['Europe/London', '20260808T120000'],
    ['America/Los_Angeles', '20260808T120000'],
    ['Asia/Tokyo', '20260808T120000'],
    ['Australia/Sydney', '20260808T120000'],
  ])('resolves ordinary wall times in %s', (zone, value) => {
    expect(resolveWallTime(value, zone).status).toBe('valid');
  });

  it('refuses to guess ambiguous or nonexistent local instants', () => {
    expect(() => wallTimeToDate('20261101T013000', 'America/New_York')).toThrow(/ambiguous/);
    expect(() => wallTimeToDate('20260308T023000', 'America/New_York')).toThrow(/does not exist/);
  });

  it('reports unknown zones and assigns floating TZID without moving wall time', () => {
    const unknown = `DTSTART;TZID=Mars/Olympus:20260808T120000`;
    expect(inspectTimezones(unknown).issues[0]?.kind).toBe('unknown');
    expect(assignFloatingTimezone('DTSTART:20260808T120000', 'Europe/Lisbon')).toBe(
      'DTSTART;TZID=Europe/Lisbon:20260808T120000',
    );
  });

  it('converts valid wall time while preserving its instant', () => {
    const converted = convertTimezone(
      'DTSTART;TZID=Europe/Lisbon:20260115T100000',
      'Europe/Lisbon',
      'America/New_York',
    );
    expect(converted).toContain('DTSTART;TZID=America/New_York:20260115T050000');
    expect(
      convertTimezone(
        'DTSTART;VALUE=DATE-TIME;TZID=Europe/Lisbon:20260115T100000',
        'Europe/Lisbon',
        'UTC',
      ),
    ).toBe('DTSTART;VALUE=DATE-TIME:20260115T100000Z');
  });
});

describe('calendar recurrence and duplicates', () => {
  it('detects duplicate UID and heuristic keys', () => {
    const events = parseIcs(fixture('duplicate-uid.ics')).events;
    expect(eventDuplicateKey(events[0]!)).toBe('uid:duplicate@example.test|master');
    expect(findEventDuplicates(events)).toEqual(new Set([1]));
    const noUid = { ...events[0]!, uid: '' };
    expect(findEventDuplicates([noUid, { ...noUid }])).toEqual(new Set([1]));
  });

  it('expands recurrence within bounds and preserves time-kind metadata', () => {
    const source = fixture('floating-time.ics').replace(
      'SUMMARY:Floating lunch',
      'SUMMARY:Floating lunch\nRRULE:FREQ=DAILY;COUNT=5',
    );
    const event = parseIcs(source).events[0]!;
    const occurrences = expandEvent(event, new Date('2026-08-01'), new Date('2026-08-20'), 10);
    expect(occurrences).toHaveLength(5);
    expect(occurrences[0]).toMatchObject({ time_kind: 'floating', timezone: 'Floating' });
    expect(() => expandEvent(event, new Date('2026-08-01'), new Date('2026-08-20'), 2)).toThrow(
      /safe limit/,
    );
  });
});
