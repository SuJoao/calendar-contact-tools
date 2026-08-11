import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calendarLimits } from '../config/calendar';
import {
  analyzeRecurrence,
  expandRecurrences,
  recurrenceCsvColumns,
  recurrenceText,
} from '../features/ics/recurrence';
import { parseIcs } from '../features/ics/parser';
import { serializeCalendar } from '../features/ics/serializer';
import { shouldUseRecurrenceWorker } from '../features/ics/workers/client';
import { toCsv } from '../utils/csv';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/ics/recurrence/${name}`, import.meta.url), 'utf8');
}

function source(properties: string, override = ''): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fictional Recurrence Tests//EN',
    'BEGIN:VEVENT',
    'UID:test-series@example.test',
    ...properties.split('\n'),
    'SUMMARY:Fictional recurrence',
    'LOCATION:Test room',
    'END:VEVENT',
    ...(override ? override.split('\n') : []),
    'END:VCALENDAR',
  ].join('\r\n');
}

function expand(ics: string, rangeStart = '2026-01-01', rangeEnd = '2027-12-31') {
  const parsed = parseIcs(ics, 'recurrence.ics');
  return expandRecurrences({ events: parsed.events, rangeStart, rangeEnd });
}

describe('recurrence rule features', () => {
  it.each([
    ['DAILY', 'DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;COUNT=4', 4],
    ['WEEKLY', 'DTSTART:20260101T090000Z\nRRULE:FREQ=WEEKLY;COUNT=4', 4],
    ['MONTHLY', 'DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;COUNT=4', 4],
    ['YEARLY', 'DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;COUNT=2', 2],
    ['INTERVAL', 'DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;INTERVAL=2;COUNT=4', 4],
  ])('expands %s with bounded COUNT', (_name, properties, expected) => {
    expect(expand(source(properties)).occurrences).toHaveLength(expected);
  });

  it('shows why one target DTSTART cannot preserve every recurring instant across different DST regimes', () => {
    const result = expand(
      source('DTSTART;TZID=Europe/Lisbon:20260302T090000\nRRULE:FREQ=WEEKLY;COUNT=5'),
      '2026-03-01',
      '2026-04-10',
    );
    const newYorkHours = result.occurrences.map((item) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(item.startTime.instant!)),
    );
    expect(new Set(newYorkHours)).toEqual(new Set(['04', '05']));
  });

  it('includes the final occurrence exactly at UTC UNTIL', () => {
    const result = expand(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;UNTIL=20260803T090000Z'),
      '2026-08-01',
      '2026-08-10',
    );
    expect(result.occurrences.map((item) => item.occurrence_start)).toEqual([
      '2026-08-01T09:00:00.000Z',
      '2026-08-02T09:00:00.000Z',
      '2026-08-03T09:00:00.000Z',
    ]);
  });

  it('interprets a zoned UTC UNTIL boundary in the DTSTART wall-clock zone', () => {
    const result = expand(
      source(
        'DTSTART;TZID=Europe/Lisbon:20260322T090000\nRRULE:FREQ=WEEKLY;UNTIL=20260405T080000Z',
      ),
      '2026-03-20',
      '2026-04-10',
    );
    expect(result.occurrences.map((item) => item.occurrence_start)).toEqual([
      '2026-03-22T09:00:00',
      '2026-03-29T09:00:00',
      '2026-04-05T09:00:00',
    ]);
  });

  it('supports weekly and ordinal BYDAY forms', () => {
    const weekdays = expand(
      source('DTSTART:20260803T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6'),
      '2026-08-01',
      '2026-08-20',
    );
    expect(weekdays.occurrences.map((item) => item.occurrence_start.slice(0, 10))).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-10',
      '2026-08-12',
      '2026-08-14',
    ]);
    const ordinal = expand(
      source('DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=1MO,-1FR;COUNT=4'),
      '2026-01-01',
      '2026-03-31',
    );
    expect(ordinal.occurrences.map((item) => item.occurrence_start.slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-01-05',
      '2026-01-30',
      '2026-02-02',
      '2026-02-27',
    ]);
  });

  it('supports BYMONTHDAY, negative BYMONTHDAY, BYMONTH, and BYSETPOS', () => {
    const monthDays = expand(
      source('DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1,15,-1;COUNT=6'),
      '2026-01-01',
      '2026-03-31',
    );
    expect(monthDays.occurrences.map((item) => item.occurrence_start.slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-01-31',
      '2026-02-01',
      '2026-02-15',
      '2026-02-28',
    ]);
    const setPosition = expand(
      source(
        'DTSTART:20260101T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3',
      ),
      '2026-01-01',
      '2026-03-31',
    );
    expect(setPosition.occurrences.map((item) => item.occurrence_start.slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-01-30',
      '2026-02-27',
      '2026-03-31',
    ]);
    const byMonth = expand(
      source('DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;BYMONTH=3,9;COUNT=4'),
      '2026-01-01',
      '2027-12-31',
    );
    expect(byMonth.occurrences.filter((item) => item.occurrence_source !== 'master')).toHaveLength(
      4,
    );
  });

  it('supports BYHOUR, BYMINUTE, BYSECOND, WKST, BYYEARDAY, and BYWEEKNO', () => {
    const times = expand(
      source(
        'DTSTART:20260101T000000Z\nRRULE:FREQ=DAILY;COUNT=4;BYHOUR=9;BYMINUTE=15;BYSECOND=0,30;WKST=SU',
      ),
      '2026-01-01',
      '2026-01-05',
    );
    expect(times.occurrences.map((item) => item.occurrence_start.slice(11))).toEqual([
      '00:00:00.000Z',
      '09:15:00.000Z',
      '09:15:30.000Z',
      '09:15:00.000Z',
      '09:15:30.000Z',
    ]);
    const yearDay = expand(
      source('DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=100;COUNT=2'),
      '2026-01-01',
      '2027-12-31',
    );
    expect(yearDay.occurrences.filter((item) => item.occurrence_source !== 'master')).toHaveLength(
      2,
    );
    const weekNo = expand(
      source('DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO;COUNT=2'),
      '2026-01-01',
      '2027-12-31',
    );
    expect(weekNo.occurrences.filter((item) => item.occurrence_source !== 'master')).toHaveLength(
      2,
    );
  });

  it('describes simple rules and labels unsupported prose conservatively', () => {
    expect(recurrenceText('FREQ=DAILY;COUNT=10')).toMatch(/Every day/i);
    expect(recurrenceText('not-a-rule')).toBe('Complex recurrence rule');
  });
});

describe('recurrence time semantics and duration', () => {
  it('preserves UTC, floating, and all-day identities', () => {
    const utc = expand(source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=2'));
    expect(utc.occurrences[0]!.startTime).toMatchObject({ kind: 'utc', raw: '20260801T090000Z' });
    const floating = expand(source('DTSTART:20260801T090000\nRRULE:FREQ=DAILY;COUNT=2'));
    expect(floating.occurrences[0]!.startTime).toEqual({
      kind: 'floating',
      raw: '20260801T090000',
      value: '2026-08-01T09:00:00',
    });
    const allDay = expand(fixture('all-day.ics'), '2026-01-01', '2029-12-31');
    expect(allDay.occurrences.map((item) => item.occurrence_start)).toEqual([
      '2026-08-08',
      '2027-08-08',
      '2028-08-08',
    ]);
    expect(allDay.occurrences.every((item) => item.occurrence_end.endsWith('-08-09'))).toBe(true);
  });

  it.each([
    ['lisbon-dst@example.test', ['09:00:00.000Z', '08:00:00.000Z']],
    ['new-york-dst@example.test', ['14:00:00.000Z', '13:00:00.000Z']],
  ])('keeps %s at 09:00 local while the UTC offset changes', (uid, expectedUtcTimes) => {
    const result = expand(fixture('zoned-dst.ics'), '2026-03-01', '2026-04-10');
    const occurrences = result.occurrences.filter((item) => item.uid === uid);
    expect(occurrences.every((item) => item.occurrence_start.endsWith('09:00:00'))).toBe(true);
    const utcTimes = [...new Set(occurrences.map((item) => item.startTime.instant!.slice(11)))];
    expect(utcTimes).toEqual(expectedUtcTimes);
  });

  it('preserves DTSTART/DTEND, DURATION, DTSTART-only, and exclusive all-day duration', () => {
    const dtend = expand(
      source('DTSTART:20260801T090000Z\nDTEND:20260801T103000Z\nRRULE:FREQ=DAILY;COUNT=2'),
      '2026-08-01',
      '2026-08-05',
    );
    expect(dtend.occurrences[1]!.occurrence_end).toBe('2026-08-02T10:30:00.000Z');
    const duration = expand(
      source('DTSTART:20260801T090000\nDURATION:PT45M\nRRULE:FREQ=DAILY;COUNT=2'),
      '2026-08-01',
      '2026-08-05',
    );
    expect(duration.occurrences[0]!.occurrence_end).toBe('2026-08-01T09:45:00');
    const startOnly = expand(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=1'),
      '2026-08-01',
      '2026-08-05',
    );
    expect(startOnly.occurrences[0]!.occurrence_end).toBe('');
    const allDay = expand(fixture('all-day.ics'), '2026-08-01', '2026-08-31');
    expect(allDay.occurrences[0]).toMatchObject({
      occurrence_start: '2026-08-08',
      occurrence_end: '2026-08-09',
    });
  });

  it('skips invalid monthly dates and follows leap-year behavior', () => {
    const monthEnd = expand(
      source('DTSTART:20260131T090000Z\nRRULE:FREQ=MONTHLY;COUNT=4'),
      '2026-01-01',
      '2026-08-31',
    );
    expect(monthEnd.occurrences.map((item) => item.occurrence_start.slice(0, 10))).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
    ]);
    const leap = expand(fixture('leap-day.ics'), '2024-01-01', '2028-12-31');
    expect(leap.occurrences.map((item) => item.occurrence_start)).toEqual([
      '2024-02-29',
      '2028-02-29',
    ]);
  });
});

describe('recurrence additions, exclusions, and overrides', () => {
  it('deduplicates RDATE against RRULE and applies multiple EXDATE properties', () => {
    const result = expand(fixture('rdate-exdate.ics'), '2026-08-01', '2026-08-15');
    expect(result.occurrences.map((item) => item.occurrence_start)).toEqual([
      '2026-08-01T09:00:00.000Z',
      '2026-08-02T09:00:00.000Z',
      '2026-08-10T09:00:00.000Z',
    ]);
    expect(result.occurrences.at(-1)?.occurrence_source).toBe('rdate');
  });

  it.each([
    ['DATE', 'DTSTART;VALUE=DATE:20260801\nRDATE;VALUE=DATE:20260805,20260810', 'date'],
    [
      'floating DATE-TIME',
      'DTSTART:20260801T090000\nRDATE:20260805T090000,20260810T090000',
      'floating',
    ],
    [
      'zoned DATE-TIME',
      'DTSTART;TZID=Europe/Lisbon:20260801T090000\nRDATE;TZID=Europe/Lisbon:20260805T090000,20260810T090000',
      'zoned',
    ],
  ])('includes multiple %s RDATE values with their time kind', (_name, properties, kind) => {
    const result = expand(source(properties), '2026-08-01', '2026-08-15');
    expect(result.occurrences).toHaveLength(3);
    expect(result.occurrences.map((item) => item.startTime.kind)).toEqual([kind, kind, kind]);
    expect(result.occurrences.slice(1).every((item) => item.occurrence_source === 'rdate')).toBe(
      true,
    );
  });

  it('matches floating, all-day, UTC, and zoned EXDATE by semantic identity', () => {
    const cases = [
      'DTSTART:20260801T090000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260802T090000',
      'DTSTART;VALUE=DATE:20260801\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;VALUE=DATE:20260802',
      'DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260802T090000Z',
      'DTSTART;TZID=Europe/Lisbon:20260801T090000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;TZID=Europe/Lisbon:20260802T090000',
    ];
    cases.forEach((properties) => {
      const result = expand(source(properties), '2026-08-01', '2026-08-05');
      expect(result.occurrences).toHaveLength(2);
      expect(
        result.occurrences.some((item) => item.occurrence_start.startsWith('2026-08-02')),
      ).toBe(false);
    });
  });

  it('replaces a generated instance with a modified RECURRENCE-ID override', () => {
    const result = expand(fixture('override.ics'), '2026-08-01', '2026-08-31');
    expect(result.occurrences).toHaveLength(4);
    expect(
      result.occurrences.filter((item) => item.occurrence_start === '2026-08-15T09:00:00'),
    ).toHaveLength(0);
    expect(result.occurrences.find((item) => item.modified)).toMatchObject({
      title: 'Moved fictional meeting',
      occurrence_start: '2026-08-15T11:00:00',
      occurrence_end: '2026-08-15T12:30:00',
      location: 'Room B',
      recurrence_id: '2026-08-15T09:00:00',
      status: 'Modified occurrence',
    });
  });

  it('separates one cancelled override without cancelling the series', () => {
    const result = expand(fixture('cancelled-override.ics'), '2026-08-01', '2026-08-10');
    expect(result.occurrences).toHaveLength(3);
    expect(result.cancelledOccurrences).toHaveLength(1);
    expect(result.cancelledOccurrences[0]).toMatchObject({
      recurrence_id: '2026-08-03T09:00:00.000Z',
      status: 'Cancelled',
    });
  });

  it('preserves but does not expand PERIOD RDATE values', () => {
    const parsed = parseIcs(fixture('rdate-period.ics'));
    expect(parsed.events).toHaveLength(1);
    expect(parsed.diagnostics.some((item) => item.code === 'UNSUPPORTED_RDATE_PERIOD')).toBe(true);
    const serialized = serializeCalendar(parsed.events, { metadata: parsed.metadata });
    expect(serialized).toContain('RDATE;VALUE=PERIOD:20260810T090000Z/20260810T100000Z');
    expect(
      expandRecurrences({ events: parsed.events, rangeStart: '2026-08-01', rangeEnd: '2026-08-15' })
        .occurrences,
    ).toHaveLength(2);
  });

  it('diagnoses and skips a malformed recurrence date without losing the event', () => {
    const parsed = parseIcs(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=2\nRDATE:20261340T090000Z'),
    );
    expect(parsed.events).toHaveLength(1);
    expect(parsed.diagnostics.some((item) => item.code === 'INVALID_DATE')).toBe(true);
    expect(
      expandRecurrences({
        events: parsed.events,
        rangeStart: '2026-08-01',
        rangeEnd: '2026-08-10',
      }).occurrences,
    ).toHaveLength(2);
  });

  it('stops before unsupported THISANDFUTURE behavior', () => {
    const parsed = parseIcs(fixture('this-and-future.ics'));
    const result = expandRecurrences({
      events: parsed.events,
      rangeStart: '2026-08-01',
      rangeEnd: '2026-08-20',
    });
    expect(result.diagnostics.some((item) => item.code === 'UNSUPPORTED_THISANDFUTURE')).toBe(true);
    expect(result.occurrences.every((item) => item.occurrence_start < '2026-08-05')).toBe(true);
    expect(serializeCalendar(parsed.events)).toContain(
      'RECURRENCE-ID;RANGE=THISANDFUTURE:20260805T090000Z',
    );
  });

  it('exports escaped CSV while preserving floating values and hostile text as data', () => {
    const parsed = parseIcs(
      source('DTSTART:20260801T090000\nRRULE:FREQ=DAILY;COUNT=2').replace(
        'SUMMARY:Fictional recurrence',
        'SUMMARY:Comma\\, <script>alert(1)</script>',
      ),
      'hostile.ics',
    );
    const result = expandRecurrences({
      events: parsed.events,
      rangeStart: '2026-08-01',
      rangeEnd: '2026-08-05',
    });
    const csv = toCsv(result.occurrences, [...recurrenceCsvColumns]);
    expect(csv).toContain('"Comma, <script>alert(1)</script>"');
    expect(csv).toContain('2026-08-01T09:00:00');
    expect(csv).toContain(',floating,');
    expect(csv).toContain('hostile.ics');
  });
});

describe('broken recurrence sets and safeguards', () => {
  it('diagnoses override without master, duplicate master, duplicate override, and kind mismatch', () => {
    const orphan = parseIcs(source('RECURRENCE-ID:20260801T090000Z\nDTSTART:20260801T100000Z'));
    expect(
      analyzeRecurrence(orphan.events).diagnostics.some(
        (item) => item.code === 'MISSING_RECURRENCE_MASTER',
      ),
    ).toBe(true);
    const twoMasters = parseIcs(`${fixture('daily.ics')}\n${fixture('daily.ics')}`);
    expect(
      analyzeRecurrence(twoMasters.events).diagnostics.some(
        (item) => item.code === 'DUPLICATE_RECURRENCE_MASTER',
      ),
    ).toBe(true);
    const overrideBlock = [
      'BEGIN:VEVENT',
      'UID:test-series@example.test',
      'RECURRENCE-ID:20260802T090000Z',
      'DTSTART:20260802T110000Z',
      'SUMMARY:First override',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:test-series@example.test',
      'RECURRENCE-ID:20260802T090000Z',
      'DTSTART:20260802T120000Z',
      'SUMMARY:Second override',
      'END:VEVENT',
    ].join('\n');
    const duplicate = parseIcs(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=3', overrideBlock),
    );
    expect(
      analyzeRecurrence(duplicate.events).diagnostics.some(
        (item) => item.code === 'DUPLICATE_RECURRENCE_OVERRIDE',
      ),
    ).toBe(true);
    const mismatchBlock = overrideBlock.replaceAll(
      'RECURRENCE-ID:20260802T090000Z',
      'RECURRENCE-ID:20260802T090000',
    );
    const mismatch = parseIcs(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=DAILY;COUNT=3', mismatchBlock),
    );
    expect(
      analyzeRecurrence(mismatch.events).diagnostics.some(
        (item) => item.code === 'RECURRENCE_TIME_KIND_MISMATCH',
      ),
    ).toBe(true);
  });

  it('does not approximate invalid or unsupported RRULE parts', () => {
    const invalid = parseIcs(source('DTSTART:20260801T090000Z\nRRULE:FREQ=NOTREAL'));
    expect(invalid.diagnostics.some((item) => item.code === 'INVALID_RRULE')).toBe(true);
    const unsupported = parseIcs(
      source('DTSTART:20260801T090000Z\nRRULE:FREQ=YEARLY;BYEASTER=1;COUNT=2'),
    );
    const unsupportedResult = expandRecurrences({
      events: unsupported.events,
      rangeStart: '2026-01-01',
      rangeEnd: '2030-12-31',
    });
    expect(
      unsupportedResult.diagnostics.some((item) => item.code === 'UNSUPPORTED_RRULE_PART'),
    ).toBe(true);
    expect(unsupportedResult.occurrences).toHaveLength(1);
  });

  it('rejects invalid or excessive date ranges', () => {
    const parsed = parseIcs(fixture('daily.ics'));
    expect(() =>
      expandRecurrences({
        events: parsed.events,
        rangeStart: '2026-08-10',
        rangeEnd: '2026-08-01',
      }),
    ).toThrow(/after the start/);
    expect(() =>
      expandRecurrences({
        events: parsed.events,
        rangeStart: '2020-01-01',
        rangeEnd: '2030-01-01',
      }),
    ).toThrow(/cannot exceed/);
  });

  it('stops a SECONDLY recurrence before expensive calculation', () => {
    const parsed = parseIcs(fixture('recurrence-bomb.ics'));
    const result = expandRecurrences({
      events: parsed.events,
      rangeStart: '2026-08-01',
      rangeEnd: '2027-08-01',
    });
    expect(result.truncated).toBe(true);
    expect(result.occurrences.length).toBeLessThanOrEqual(1);
    expect(result.diagnostics.some((item) => item.code === 'RECURRENCE_LIMIT_REACHED')).toBe(true);
    expect(
      shouldUseRecurrenceWorker({
        events: parsed.events,
        rangeStart: '2026-08-01',
        rangeEnd: '2027-08-01',
      }),
    ).toBe(true);
  });

  it('enforces per-series and total occurrence limits', () => {
    const first = parseIcs(source('DTSTART:20260801T000000Z\nRRULE:FREQ=HOURLY'));
    const perSeries = expandRecurrences({
      events: first.events,
      rangeStart: '2026-08-01',
      rangeEnd: '2026-08-10',
      limits: { maxOccurrencesPerSeries: 50, maxTotalOccurrences: 100 },
    });
    expect(perSeries.occurrences.length).toBeLessThanOrEqual(50);
    expect(perSeries.truncated).toBe(true);
    const two = parseIcs(
      `${source('DTSTART:20260801T000000Z\nRRULE:FREQ=DAILY;COUNT=10')}\n${source('DTSTART:20260801T010000Z\nRRULE:FREQ=DAILY;COUNT=10').replaceAll('test-series@example.test', 'second@example.test')}`,
    );
    const total = expandRecurrences({
      events: two.events,
      rangeStart: '2026-08-01',
      rangeEnd: '2026-08-20',
      limits: { maxOccurrencesPerSeries: 10, maxTotalOccurrences: 12 },
    });
    expect(total.occurrences.length).toBeLessThanOrEqual(12);
    expect(total.truncated).toBe(true);
  });

  it('maintains sorting, range, uniqueness, and exclusion invariants', () => {
    const result = expand(fixture('rdate-exdate.ics'), '2026-08-01', '2026-08-31');
    const starts = result.occurrences.map((item) => item.occurrence_start);
    expect(starts).toEqual([...starts].sort());
    expect(new Set(starts).size).toBe(starts.length);
    expect(starts.every((value) => value >= '2026-08-01' && value < '2026-09-01')).toBe(true);
    expect(starts).not.toContain('2026-08-03T09:00:00.000Z');
  });
});

describe('recurrence scale', () => {
  it('expands 100 series with 100 occurrences under the total cap', () => {
    const events = Array.from(
      { length: 100 },
      (_, index) =>
        parseIcs(
          source('DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY;COUNT=100').replaceAll(
            'test-series@example.test',
            `series-${index}@example.test`,
          ),
        ).events[0]!,
    );
    const result = expandRecurrences({ events, rangeStart: '2026-01-01', rangeEnd: '2026-12-31' });
    expect(result.occurrences).toHaveLength(10_000);
    expect(result.truncated).toBe(false);
  });

  it('bounds one series with more than 10,000 potential occurrences', () => {
    const parsed = parseIcs(source('DTSTART:20260101T000000Z\nRRULE:FREQ=HOURLY'));
    const result = expandRecurrences({
      events: parsed.events,
      rangeStart: '2026-01-01',
      rangeEnd: '2027-12-31',
    });
    expect(result.occurrences.length).toBeLessThanOrEqual(calendarLimits.maxOccurrencesPerSeries);
    expect(result.truncated).toBe(true);
  });
});
