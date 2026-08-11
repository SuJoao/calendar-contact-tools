import { describe, expect, it } from 'vitest';
import { parseIcs } from '../features/ics/parser';
import { parseVcf } from '../features/vcf/parser';

describe('adversarial local file parsing', () => {
  it('bounds oversized ICS properties and attendee fan-out', () => {
    const attendees = Array.from(
      { length: 50 },
      (_, index) => `ATTENDEE:mailto:p${index}@test.invalid`,
    );
    const calendar = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:bounded@test.invalid',
      'DTSTART:20260809T120000Z',
      `SUMMARY:${'x'.repeat(101)}`,
      ...attendees,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const result = parseIcs(calendar, 'hostile.ics', {
      maxEvents: 2,
      maxPropertyLength: 100,
      maxAttendeesPerEvent: 5,
    });
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.some((item) => item.code === 'LIMIT_EXCEEDED')).toBe(true);
  });

  it('recovers complete ICS records around malformed nested input without executing values', () => {
    const text = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:safe@test.invalid',
      'DTSTART:20260809T120000Z',
      'SUMMARY:<img src=x onerror=alert(1)>',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:truncated@test.invalid',
      'BEGIN:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const result = parseIcs(text, '<script>.ics');
    expect(result.events.map((event) => event.title)).toContain('<img src=x onerror=alert(1)>');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('caps contacts, repeated values, and long VCF properties', () => {
    const cards = Array.from({ length: 4 }, (_, card) =>
      [
        'BEGIN:VCARD',
        'VERSION:4.0',
        `FN:Person ${card}`,
        `NOTE:${'z'.repeat(101)}`,
        ...Array.from({ length: 20 }, (__, index) => `EMAIL:p${card}-${index}@test.invalid`),
        'END:VCARD',
      ].join('\r\n'),
    ).join('\r\n');
    const result = parseVcf(cards, 'hostile.vcf', {
      maxContacts: 2,
      maxPropertyLength: 100,
      maxRepeatedValues: 3,
    });
    expect(result.contacts.length).toBeLessThanOrEqual(2);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('treats remote and executable contact values as inert parser data', () => {
    const result = parseVcf(
      [
        'BEGIN:VCARD',
        'VERSION:4.0',
        'FN:<script>alert(1)</script>',
        'URL:javascript:alert(1)',
        'PHOTO:https://tracking.invalid/pixel.png',
        'END:VCARD',
      ].join('\r\n'),
      'unsafe-name.vcf',
    );
    expect(result.contacts[0]?.formattedName).toBe('<script>alert(1)</script>');
    expect(JSON.stringify(result.contacts[0])).toContain('tracking.invalid');
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
