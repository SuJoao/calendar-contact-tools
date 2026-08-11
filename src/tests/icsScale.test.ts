import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { findEventDuplicates } from '../features/ics/duplicateDetection';
import { analyzeCalendarMerge } from '../features/ics/merge';
import { parseIcs } from '../features/ics/parser';
import { generateCalendar } from './helpers/calendarFactory';

describe('ICS scale and adversarial limits', () => {
  it.each([100, 1_000])('parses and normalizes %i generated events', (count) => {
    const result = parseIcs(generateCalendar(count));
    expect(result.events).toHaveLength(count);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('parses, normalizes, and prepares 10,000 events within a broad regression budget', () => {
    const parseStart = performance.now();
    const result = parseIcs(generateCalendar(10_000));
    const parseMilliseconds = performance.now() - parseStart;
    const tableStart = performance.now();
    const rows = result.events.map((event) => ({
      title: event.title,
      start: event.startTime.value,
      timezone: event.timezone,
      uid: event.uid,
    }));
    const tableMilliseconds = performance.now() - tableStart;
    expect(rows).toHaveLength(10_000);
    expect(parseMilliseconds).toBeLessThan(15_000);
    expect(tableMilliseconds).toBeLessThan(2_000);
  }, 20_000);

  it('handles thousands of duplicate UIDs without quadratic matching', () => {
    const events = parseIcs(generateCalendar(2_000, { duplicateEvery: 20 })).events;
    expect(findEventDuplicates(events).size).toBe(1_980);
  });

  it.each([
    [2, 100],
    [3, 1_000],
    [2, 5_000],
  ])(
    'analyzes %i generated calendars with %i events each',
    (calendarCount, eventCount) => {
      const inputs = Array.from({ length: calendarCount }, (_, index) => ({
        name: `generated-${index}.ics`,
        text: generateCalendar(eventCount),
      }));
      const analysis = analyzeCalendarMerge(inputs);
      expect(analysis.events).toHaveLength(calendarCount * eventCount);
      expect(analysis.candidates.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it('rejects an oversized folded property at the configured boundary', () => {
    const source = generateCalendar(1, { descriptionLength: 600 }).replace(
      'x'.repeat(600),
      `${'x'.repeat(600)}\r\n ${'y'.repeat(600)}`,
    );
    const result = parseIcs(source, 'large.ics', {
      maxPropertyLength: 1_000,
    });
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.some((item) => item.code === 'LIMIT_EXCEEDED')).toBe(true);
  });

  it('stops at a configurable event limit', () => {
    const result = parseIcs(generateCalendar(20), 'limited.ics', { maxEvents: 10 });
    expect(result.events).toHaveLength(10);
    expect(result.diagnostics.some((item) => item.code === 'LIMIT_EXCEEDED')).toBe(true);
  });

  it('rejects an event above the attendee safety limit while preserving neighboring events', () => {
    const source = `${generateCalendar(1)}\n${generateCalendar(1, { attendeesPerEvent: 6 })}`;
    const result = parseIcs(source, 'attendees.ics', { maxAttendeesPerEvent: 5 });
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics.some((item) => item.code === 'MALFORMED_EVENT')).toBe(true);
  });

  it('bounds recovery work for deeply repeated malformed event markers', () => {
    const source = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${'BEGIN:VEVENT\r\n'.repeat(1_000)}END:VCALENDAR`;
    const result = parseIcs(source, 'repeated.ics', { maxEvents: 100 });
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.some((item) => item.code === 'TRUNCATED_COMPONENT')).toBe(true);
  });
});
