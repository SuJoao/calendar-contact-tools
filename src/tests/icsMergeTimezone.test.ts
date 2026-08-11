import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDuplicateCandidates } from '../features/ics/duplicateDetection';
import { analyzeCalendarMerge, mergeCalendars, serializeMerge } from '../features/ics/merge';
import { parseIcs } from '../features/ics/parser';
import { analyzeEventTimezones, previewTimezoneTransform } from '../features/ics/timezoneFixer';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/ics/${name}`, import.meta.url), 'utf8');
}

function calendar(events: string, metadata = ''): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${metadata}${events}\r\nEND:VCALENDAR\r\n`;
}

function event(uid: string, title: string, start = '20260808T120000Z', extra = ''): string {
  return `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${start}\r\nDTEND:${start.replace('120000', '130000')}\r\nSUMMARY:${title}\r\nLOCATION:Room 1\r\n${extra}END:VEVENT`;
}

describe('review-driven calendar merge', () => {
  it('keeps all events by default and removes only explicit indexes', () => {
    const source = fixture('duplicate-uid.ics');
    const analysis = analyzeCalendarMerge([{ name: 'one.ics', text: source }]);
    expect(parseIcs(serializeMerge(analysis)).events).toHaveLength(2);
    expect(parseIcs(serializeMerge(analysis, new Set([1]))).events).toHaveLength(1);
  });

  it('merges five calendars into a parseable output', () => {
    const inputs = Array.from({ length: 5 }, (_, index) => ({
      name: `${index}.ics`,
      text: calendar(event(`event-${index}@example.test`, `Event ${index}`)),
    }));
    const merged = mergeCalendars(inputs);
    expect(merged.sourceCount).toBe(5);
    expect(parseIcs(merged.content).events).toHaveLength(5);
  });

  it('classifies same UID as certain but master and override as distinct', () => {
    const duplicate = parseIcs(fixture('duplicate-uid.ics')).events;
    expect(findDuplicateCandidates(duplicate)[0]?.confidence).toBe('certain');
    const recurring = calendar(
      `${event('series@example.test', 'Series', '20260808T120000Z', 'RRULE:FREQ=DAILY;COUNT=3\r\n')}\r\n${event('series@example.test', 'Override', '20260809T120000Z', 'RECURRENCE-ID:20260809T120000Z\r\n')}`,
    );
    expect(findDuplicateCandidates(parseIcs(recurring).events)).toHaveLength(0);
  });

  it('classifies matching event details with different UIDs as likely', () => {
    const events = parseIcs(
      calendar(
        `${event('one@example.test', ' Shared  Meeting ')}\r\n${event('two@example.test', 'shared meeting')}`,
      ),
    ).events;
    expect(findDuplicateCandidates(events)[0]).toMatchObject({
      confidence: 'likely',
      reasons: expect.arrayContaining(['Matching title', 'Matching start and end']),
    });
  });

  it('does not match the same title at different times', () => {
    const events = parseIcs(
      calendar(
        `${event('one@example.test', 'Shared')}\r\n${event('two@example.test', 'Shared', '20260809T120000Z')}`,
      ),
    ).events;
    expect(findDuplicateCandidates(events)).toHaveLength(0);
  });

  it.each([
    ['floating', '20260808T120000'],
    ['utc', '20260808T120000Z'],
  ])('compares %s duplicate times by the correct semantics', (_kind, start) => {
    const events = parseIcs(
      calendar(
        `${event('one@example.test', 'Match', start)}\r\n${event('two@example.test', 'Match', start)}`,
      ),
    ).events;
    expect(findDuplicateCandidates(events)[0]?.confidence).toBe('likely');
  });

  it('compares resolvable zoned values by instant and all-day values by date', () => {
    const zoned = calendar(
      `${event('one@example.test', 'Instant', '20260808T120000Z')}\r\n${event('two@example.test', 'Instant', '20260808T080000', '').replace('DTSTART:', 'DTSTART;TZID=America/New_York:').replace('DTEND:20260808T080000', 'DTEND;TZID=America/New_York:20260808T090000')}`,
    );
    expect(findDuplicateCandidates(parseIcs(zoned).events)[0]?.confidence).toBe('likely');
    const allDay = parseIcs(
      `${fixture('all-day.ics')}\n${fixture('all-day.ics').replaceAll('all-day@example.test', 'other@example.test')}`,
    ).events;
    expect(findDuplicateCandidates(allDay)[0]?.confidence).toBe('likely');
  });

  it('uses application metadata, omits invitation METHOD, and warns on disagreement', () => {
    const one = calendar(
      event('one@example.test', 'One'),
      'METHOD:REQUEST\r\nX-WR-CALNAME:One\r\n',
    );
    const two = calendar(event('two@example.test', 'Two'), 'METHOD:CANCEL\r\nX-WR-CALNAME:Two\r\n');
    const merged = mergeCalendars([
      { name: 'one.ics', text: one },
      { name: 'two.ics', text: two },
    ]);
    expect(merged.metadata).toMatchObject({ version: '2.0', name: 'Merged calendar', method: '' });
    expect(merged.content).not.toMatch(/\r\nMETHOD:/);
    expect(merged.diagnostics.some((item) => item.code === 'MIXED_CALENDAR_METADATA')).toBe(true);
  });

  it('deduplicates identical VTIMEZONE and warns on conflicting definitions', () => {
    const custom = fixture('conflicting-vtimezone.ics');
    const identical = mergeCalendars([
      { name: 'a.ics', text: custom },
      { name: 'b.ics', text: custom },
    ]);
    expect(identical.metadata.vtimezones).toHaveLength(1);
    const conflict = custom.replace('TZOFFSETTO:+0100', 'TZOFFSETTO:+0200');
    const merged = mergeCalendars([
      { name: 'a.ics', text: custom },
      { name: 'b.ics', text: conflict },
    ]);
    expect(merged.metadata.vtimezones).toHaveLength(1);
    expect(merged.diagnostics.some((item) => item.code === 'CONFLICTING_VTIMEZONE')).toBe(true);
    expect(parseIcs(merged.content).events).toHaveLength(2);
  });

  it('recovers readable events around malformed source content', () => {
    const merged = mergeCalendars([
      { name: 'malformed.ics', text: fixture('malformed-event.ics') },
    ]);
    expect(merged.events).toHaveLength(2);
    expect(merged.malformed).toBeGreaterThan(0);
  });
});

describe('safe timezone fixer', () => {
  it('reports mixed timezone kinds and identifiers', () => {
    const parsed = parseIcs(fixture('timezone-mixed.ics'));
    expect(analyzeEventTimezones(parsed.events, parsed.metadata)).toMatchObject({
      total: 5,
      utc: 1,
      zoned: 2,
      floating: 1,
      allDay: 1,
      identifiers: { UTC: 1, 'Europe/Lisbon': 1, 'America/New_York': 1, Floating: 1, 'All-day': 1 },
    });
  });

  it.each([
    ['UTC', 'Europe/Lisbon', '2026-08-08T13:00:00'],
    ['Europe/Lisbon', 'UTC', '2026-08-08T11:00:00'],
    ['Europe/Lisbon', 'America/New_York', '2026-08-08T07:00:00'],
    ['America/New_York', 'Europe/Lisbon', '2026-08-08T17:00:00'],
  ])('converts %s to %s while preserving the instant', (source, target, expected) => {
    const parsed = parseIcs(fixture('timezone-mixed.ics'));
    const original = parsed.events.find((item) => item.timezone === source)!;
    const result = previewTimezoneTransform([original], parsed.metadata, {
      operation: 'convert',
      sourceTimezone: source,
      targetTimezone: target,
    });
    expect(result.rows[0]).toMatchObject({
      result: 'changed',
      newStart: expected,
      newZone: target,
    });
    expect(result.events[0]!.startTime.instant).toBe(original.startTime.instant);
    expect(parseIcs(result.content).events[0]!.startTime.instant).toBe(original.startTime.instant);
  });

  it.each(['Europe/Lisbon', 'America/New_York'])(
    'assigns floating wall time to %s without shifting it',
    (target) => {
      const parsed = parseIcs(fixture('floating-time.ics'));
      const result = previewTimezoneTransform(parsed.events, parsed.metadata, {
        operation: 'assign',
        targetTimezone: target,
      });
      expect(result.rows[0]).toMatchObject({
        result: 'changed',
        newStart: '2026-08-08T12:00:00',
        newZone: target,
      });
      expect(parseIcs(result.content).events[0]!.startTime).toMatchObject({
        kind: 'zoned',
        tzid: target,
        raw: '20260808T120000',
      });
    },
  );

  it('protects all-day and does not convert floating events', () => {
    const parsed = parseIcs(fixture('timezone-mixed.ics'));
    const result = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'convert',
      sourceTimezone: 'Europe/Lisbon',
      targetTimezone: 'UTC',
    });
    expect(result.rows.find((row) => row.originalZone === 'All-day')?.result).toBe('unchanged');
    expect(result.rows.find((row) => row.originalZone === 'Floating')?.result).toBe('warning');
  });

  it('blocks unknown timezone conversion without guessing', () => {
    const parsed = parseIcs(fixture('conflicting-vtimezone.ics'));
    const result = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'convert',
      sourceTimezone: 'Custom/Fictional',
      targetTimezone: 'UTC',
    });
    expect(result.rows[0]).toMatchObject({ result: 'blocked', diagnosticCode: 'UNKNOWN_TIMEZONE' });
    expect(result.events[0]!.startTime.raw).toBe('20260808T120000');
  });

  it.each([
    ['Europe/Lisbon', '20260329T013000', 'NONEXISTENT_LOCAL_TIME'],
    ['Europe/Lisbon', '20261025T013000', 'AMBIGUOUS_LOCAL_TIME'],
    ['America/New_York', '20260308T023000', 'NONEXISTENT_LOCAL_TIME'],
    ['America/New_York', '20261101T013000', 'AMBIGUOUS_LOCAL_TIME'],
  ])('blocks unsafe assignment in %s for %s', (target, start, code) => {
    const parsed = parseIcs(calendar(event('dst@example.test', 'DST', start.replace('Z', ''))));
    const result = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'assign',
      targetTimezone: target,
    });
    expect(result.rows[0]).toMatchObject({ result: 'blocked', diagnosticCode: code });
  });

  it('preserves duration and leaves the source model unchanged', () => {
    const parsed = parseIcs(fixture('timezone-lisbon.ics'));
    const snapshot = structuredClone(parsed.events);
    const originalDuration =
      new Date(parsed.events[0]!.endTime!.instant!).getTime() -
      new Date(parsed.events[0]!.startTime.instant!).getTime();
    const result = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'convert',
      sourceTimezone: 'Europe/Lisbon',
      targetTimezone: 'America/New_York',
    });
    const resultDuration =
      new Date(result.events[0]!.endTime!.instant!).getTime() -
      new Date(result.events[0]!.startTime.instant!).getTime();
    expect(resultDuration).toBe(originalDuration);
    expect(parsed.events).toEqual(snapshot);
  });

  it('preserves recurrence metadata for assignment and blocks unsafe recurring conversion', () => {
    const source = calendar(
      event(
        'series@example.test',
        'Series',
        '20260808T120000',
        'RRULE:FREQ=DAILY;COUNT=3\r\nRDATE:20260812T120000\r\nEXDATE:20260809T120000\r\n',
      ),
    );
    const parsed = parseIcs(source);
    const assigned = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'assign',
      targetTimezone: 'Europe/Lisbon',
    });
    const roundTrip = parseIcs(assigned.content).events[0]!;
    expect(roundTrip.rrule).toBe('FREQ=DAILY;COUNT=3');
    expect(roundTrip.rdates[0]).toMatchObject({ kind: 'zoned', tzid: 'Europe/Lisbon' });
    expect(roundTrip.exdates[0]).toMatchObject({ kind: 'zoned', tzid: 'Europe/Lisbon' });
    const zoned = parseIcs(
      fixture('timezone-lisbon.ics').replace('SUMMARY:', 'RRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:'),
    );
    const converted = previewTimezoneTransform(zoned.events, zoned.metadata, {
      operation: 'convert',
      sourceTimezone: 'Europe/Lisbon',
      targetTimezone: 'UTC',
    });
    expect(converted.rows[0]).toMatchObject({
      result: 'blocked',
      diagnosticCode: 'RECURRENCE_TIMEZONE_WARNING',
    });
  });

  it('round trips hostile text as data, not markup', () => {
    const source = calendar(
      event(
        'safe@example.test',
        '<img src=x>',
        '20260808T120000',
        'DESCRIPTION:<script>alert(1)</script>\r\n',
      ).replace('LOCATION:Room 1', 'LOCATION:<svg onload=x>'),
    );
    const parsed = parseIcs(source);
    const output = previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: 'assign',
      targetTimezone: 'Europe/Lisbon',
    }).content;
    expect(parseIcs(output).events[0]).toMatchObject({
      title: '<img src=x>',
      description: '<script>alert(1)</script>',
      location: '<svg onload=x>',
    });
  });
});
