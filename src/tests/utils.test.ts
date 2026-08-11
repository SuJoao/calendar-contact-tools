import { describe, expect, it } from 'vitest';
import type { Sponsor } from '../types';
import { csvCell, toCsv } from '../utils/csv';
import { formatDate } from '../utils/dates';
import { escapeHtml } from '../utils/dom';
import { isSponsorActive, validateSponsor } from '../utils/sponsors';

const sponsor: Sponsor = {
  id: 'test',
  name: 'Test',
  description: 'Description',
  image: '/sponsors/test.svg',
  url: 'https://example.test',
  placement: ['homepage'],
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  label: 'Sponsor',
  isActive: true,
};

describe('shared utilities', () => {
  it('escapes CSV quotes, commas and newlines', () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(toCsv([{ name: 'Zoë', note: 'a,b' }], ['name', 'note'])).toBe('name,note\r\nZoë,"a,b"');
  });

  it('formats deterministic ISO and timezone dates', () => {
    const date = new Date('2026-08-08T12:00:00Z');
    expect(formatDate(date, 'iso')).toBe('2026-08-08T12:00:00.000Z');
    expect(formatDate(date, 'locale', 'UTC')).toContain('8 Aug 2026');
  });

  it('validates and date-filters sponsors', () => {
    expect(validateSponsor(sponsor)).toBe(true);
    expect(isSponsorActive(sponsor, '2026-08-08')).toBe(true);
    expect(isSponsorActive(sponsor, '2026-09-01')).toBe(false);
    expect(validateSponsor({ ...sponsor, url: 'not a url' })).toBe(false);
  });

  it('escapes file content before it can become markup', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
});
