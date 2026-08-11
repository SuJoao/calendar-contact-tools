import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contactCsv, contactsToCsvRows, protectSpreadsheetValue } from '../features/vcf/csv';
import {
  findDuplicateGroups,
  nameSimilarity,
  normalizePhone,
} from '../features/vcf/duplicateDetection';
import { mergeContacts, mergeVcfTexts, serializeContact } from '../features/vcf/merge';
import type { ContactTypedValue } from '../features/vcf/model';
import { parseVcf, splitEscaped, unfoldVcf } from '../features/vcf/parser';
import { filterContacts, sortContacts } from '../features/vcf/search';
import { shouldUseContactWorker } from '../features/vcf/workers/client';
import { generatedVcf } from './helpers/contactFactory';

const fixture = (name: string): string =>
  readFileSync(resolve('src/tests/fixtures/vcf', name), 'utf8');

const typed = (value: string, types: string[] = []): ContactTypedValue => ({
  value,
  types,
  parameters: {},
});

describe('canonical VCF parsing', () => {
  it.each([
    ['vcard-21.vcf', '2.1'],
    ['vcard-30.vcf', '3.0'],
    ['vcard-40.vcf', '4.0'],
  ])('parses supported version fixture %s', (name, version) => {
    expect(parseVcf(fixture(name)).contacts[0]?.version).toBe(version);
  });

  it('preserves structured names, organizations, and dates', () => {
    const contact = parseVcf(fixture('vcard-30.vcf')).contacts[0]!;
    expect(contact).toMatchObject({
      formattedName: 'Dr. Jane Q. Smith',
      familyName: 'Smith',
      givenName: 'Jane',
      birthday: '--04-15',
      organization: 'Example Corp.',
      organizationUnits: ['Research', 'Applied Systems'],
    });
    expect(contact.additionalNames).toEqual(['Q.']);
    expect(contact.honorificPrefixes).toEqual(['Dr.']);
    expect(contact.honorificSuffixes).toEqual(['PhD']);
  });

  it('parses CRLF and LF files containing multiple contacts', () => {
    expect(parseVcf(fixture('multiple-contacts.vcf')).contacts).toHaveLength(2);
    expect(
      parseVcf(fixture('multiple-contacts.vcf').replaceAll('\n', '\r\n')).contacts,
    ).toHaveLength(2);
  });

  it('unfolds space, tab, UTF-8, NOTE, and ADR continuations', () => {
    const text = fixture('folded-lines.vcf');
    const contact = parseVcf(text).contacts[0]!;
    expect(unfoldVcf(text)).not.toMatch(/\r\n[ \t]/);
    expect(contact.notes[0]).toContain('português and it continues');
    expect(contact.addresses[0]?.postalCode).toBe('4000-001');
  });

  it('honors vCard escaping without splitting escaped separators', () => {
    const contact = parseVcf(fixture('escaped-values.vcf')).contacts[0]!;
    expect(contact.organization).toBe('Example, Inc.');
    expect(contact.organizationUnits).toEqual(['Research;Development']);
    expect(contact.notes[0]).toBe('Line one\nLine two with comma, semicolon; and slash\\');
    expect(contact.categories).toEqual(['One, literal', 'Two']);
    expect(splitEscaped('one\\;still-one;two', ';')).toEqual(['one;still-one', 'two']);
  });

  it('decodes UTF-8 and ISO-8859-1 quoted-printable values', () => {
    expect(parseVcf(fixture('vcard-21.vcf')).contacts[0]?.formattedName).toBe('André Dupont');
    expect(parseVcf(fixture('quoted-printable.vcf')).contacts[0]?.formattedName).toBe(
      'José da Silva',
    );
  });

  it('preserves encoded data and diagnoses unsupported charsets', () => {
    const result = parseVcf(fixture('quoted-printable.vcf'));
    expect(result.contacts[0]?.notes[0]).toBe('Encoded=20note');
    expect(result.diagnostics.some((item) => item.code === 'UNSUPPORTED_CHARSET')).toBe(true);
  });

  it('preserves repeated values with type and preference metadata', () => {
    const contact = parseVcf(fixture('repeated-values.vcf')).contacts[0]!;
    expect(contact.emails).toHaveLength(2);
    expect(contact.emails[1]).toMatchObject({
      value: 'home@example.test',
      types: ['home'],
      preference: 1,
    });
    expect(contact.phones).toHaveLength(2);
    expect(contact.addresses[1]).toMatchObject({
      street: '2 Work Street',
      locality: 'Lisbon',
      country: 'Portugal',
      types: ['work'],
    });
  });

  it('preserves grouped vendor properties without making them primary fields', () => {
    const contact = parseVcf(fixture('vendor-properties.vcf')).contacts[0]!;
    const vendor = contact.rawProperties.find((item) => item.name === 'X-ABLABEL');
    expect(vendor).toMatchObject({ group: 'item1', value: 'Custom label' });
    expect(contact.rawProperties.find((item) => item.name === 'X-CUSTOM')?.value).toContain(
      '<script>',
    );
  });

  it('derives a display name from N and reports missing FN', () => {
    const result = parseVcf('BEGIN:VCARD\nVERSION:4.0\nN:Smith;Jane;;;\nEND:VCARD');
    expect(result.contacts[0]?.formattedName).toBe('Jane Smith');
    expect(result.diagnostics.some((item) => item.code === 'MISSING_FN')).toBe(true);
  });

  it('preserves unknown versions with a diagnostic', () => {
    const result = parseVcf('BEGIN:VCARD\nVERSION:5.0\nFN:Future Contact\nEND:VCARD');
    expect(result.contacts[0]?.version).toBe('unknown');
    expect(result.diagnostics.some((item) => item.code === 'UNSUPPORTED_VERSION')).toBe(true);
  });

  it('reports a missing version without discarding the contact', () => {
    const result = parseVcf('BEGIN:VCARD\nFN:Versionless Contact\nEND:VCARD');
    expect(result.contacts).toHaveLength(1);
    expect(result.diagnostics.some((item) => item.code === 'MISSING_VERSION')).toBe(true);
  });

  it('partially recovers valid cards around a malformed contact', () => {
    const result = parseVcf(fixture('malformed-contact.vcf'));
    expect(result.contacts.map((item) => item.formattedName)).toEqual([
      'Readable Before',
      'Readable After',
    ]);
    expect(result.skippedContacts).toBe(1);
    expect(result.diagnostics.some((item) => item.code === 'MALFORMED_VCARD')).toBe(true);
  });

  it('reports and skips a truncated trailing contact', () => {
    const result = parseVcf(fixture('truncated-contact.vcf'));
    expect(result.contacts).toHaveLength(1);
    expect(result.skippedContacts).toBe(1);
    expect(result.diagnostics.some((item) => item.code === 'TRUNCATED_VCARD')).toBe(true);
  });

  it('returns a structured failure for non-vCard input', () => {
    const result = parseVcf('not a contact file', 'wrong.vcf');
    expect(result.contacts).toHaveLength(0);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'MALFORMED_VCARD',
      sourceFile: 'wrong.vcf',
    });
  });
});

describe('VCF media and URI safety', () => {
  it('records remote media as metadata without creating a resource', () => {
    const contact = parseVcf(fixture('remote-photo.vcf')).contacts[0]!;
    expect(contact.photo).toMatchObject({
      kind: 'remote',
      reference: 'https://images.example.test/contact.jpg',
    });
    expect(contact.logo?.kind).toBe('unsupported');
  });

  it('records embedded media size/type without exposing base64 in raw properties', () => {
    const contact = parseVcf(fixture('embedded-photo.vcf')).contacts[0]!;
    expect(contact.photo).toMatchObject({ kind: 'embedded', mediaType: 'image/jpeg' });
    expect(contact.photo?.estimatedBytes).toBeGreaterThan(0);
    expect(contact.rawProperties.find((item) => item.name === 'PHOTO')?.value).toBe(
      '[embedded binary omitted]',
    );
  });

  it('marks javascript URLs unsafe while preserving them as text', () => {
    const result = parseVcf(fixture('repeated-values.vcf'));
    expect(result.contacts[0]?.urls[1]).toMatchObject({
      value: 'javascript:alert(1)',
      safeProtocol: false,
    });
    expect(result.diagnostics.some((item) => item.code === 'UNSAFE_URI')).toBe(true);
  });
});

describe('contact search, merge, and duplicate readiness', () => {
  const contacts = parseVcf(
    `${fixture('unicode.vcf')}\n${fixture('repeated-values.vcf')}`,
  ).contacts;

  it('searches human fields accent-insensitively without mutating display values', () => {
    expect(filterContacts(contacts, { query: 'joao' })[0]?.formattedName).toBe('João 😀 Núñez');
    expect(filterContacts(contacts, { query: 'home@example.test' })).toHaveLength(1);
    expect(contacts[0]?.formattedName).toContain('João');
  });

  it('filters presence fields and sorts without mutating canonical order', () => {
    const original = contacts.map((item) => item.id);
    expect(filterContacts(contacts, { hasPhone: true })).toHaveLength(1);
    expect(sortContacts(contacts, 'name')).not.toBe(contacts);
    expect(contacts.map((item) => item.id)).toEqual(original);
  });

  it('normalizes comparison values and finds configurable duplicates', () => {
    const first = parseVcf(fixture('vcard-30.vcf')).contacts[0]!;
    const second = {
      ...first,
      id: 'second',
      formattedName: 'Jane Smith',
      fullName: 'Jane Smith',
      emails: [typed('JANE@example.test')],
      phones: [typed('+351 (912) 345-678')],
    };
    expect(normalizePhone(second.phones[0]!.value)).toBe(normalizePhone(first.phones[0]!.value));
    expect(nameSimilarity(first.formattedName, second.formattedName)).toBeGreaterThan(0.6);
    expect(
      findDuplicateGroups([first, second], {
        email: true,
        phone: false,
        similarName: false,
        organizationAndName: false,
      }),
    ).toHaveLength(1);
  });

  it('merges typed repeated values and serializes a valid vCard', () => {
    const first = parseVcf(fixture('vcard-30.vcf')).contacts[0]!;
    const second = {
      ...first,
      id: 'second',
      emails: [typed('new@example.test')],
      notes: ['Second note'],
    };
    const merged = mergeContacts([first, second], 'Chosen Name');
    expect(merged.emails.map((item) => item.value)).toEqual([
      'jane@example.test',
      'new@example.test',
    ]);
    expect(serializeContact(merged)).toMatch(/BEGIN:VCARD[\s\S]*FN:Chosen Name[\s\S]*END:VCARD/);
  });

  it('preserves valid records when merging source files', () => {
    expect(
      mergeVcfTexts([fixture('vcard-30.vcf'), fixture('vcard-40.vcf')]).match(/BEGIN:VCARD/g),
    ).toHaveLength(2);
  });
});

describe('VCF CSV export', () => {
  const injection = parseVcf(fixture('csv-injection.vcf')).contacts[0]!;

  it('quotes commas, quotes, line breaks, Unicode, emoji, and repeated values', () => {
    const contact = parseVcf(fixture('unicode.vcf')).contacts[0]!;
    const output = contactCsv([{ ...contact, notes: ['line one\nline two, "quoted"'] }], {
      mode: 'combined',
      columns: ['full_name', 'notes'],
    }).csv;
    expect(output).toContain('João 😀 Núñez');
    expect(output).toContain('"line one\nline two, ""quoted"""');
  });

  it('supports field selection and empty fields', () => {
    const output = contactCsv([injection], {
      mode: 'combined',
      columns: ['full_name', 'birthday'],
    });
    expect(output.columns).toEqual(['full_name', 'birthday']);
    expect(output.csv.split('\r\n')[0]).toBe('full_name,birthday');
  });

  it('uses a documented long schema for repeated fields', () => {
    const contact = parseVcf(fixture('repeated-values.vcf')).contacts[0]!;
    const rows = contactsToCsvRows([contact], 'expanded');
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.repeated_field)).toEqual([
      'email',
      'email',
      'phone',
      'phone',
      'address',
      'address',
      'website',
      'website',
    ]);
  });

  it('protects formula-like free text in all exported fields', () => {
    const output = contactCsv([injection], {
      mode: 'combined',
      columns: ['full_name', 'organization', 'job_title', 'addresses', 'notes', 'websites'],
    });
    Object.values(output.rows[0]!).forEach((value) => expect(value).not.toMatch(/^[=+\-@]/));
    expect(output.csv).toContain("'=HYPERLINK");
  });

  it('keeps legitimate international phone prefixes intact', () => {
    expect(protectSpreadsheetValue('+351 912 345 678', 'phones')).toBe('+351 912 345 678');
    const row = contactCsv([injection], { mode: 'combined', columns: ['phones'] }).rows[0]!;
    expect(row.phones).toBe('+351 912 345 678');
  });

  it('protects a repeated non-phone + payload but not a repeated phone', () => {
    expect(protectSpreadsheetValue('+cmd', 'repeated_value', { repeated_field: 'website' })).toBe(
      "'+cmd",
    );
    expect(protectSpreadsheetValue('+351 1', 'repeated_value', { repeated_field: 'phone' })).toBe(
      '+351 1',
    );
  });
});

describe('VCF scale limits', () => {
  it('parses 100 generated contacts', () => {
    expect(parseVcf(generatedVcf(100), 'generated-100.vcf').contacts).toHaveLength(100);
  });

  it('parses and searches 1,000 generated contacts', () => {
    const contacts = parseVcf(generatedVcf(1_000), 'generated-1000.vcf').contacts;
    expect(contacts).toHaveLength(1_000);
    expect(filterContacts(contacts, { query: 'person999@example.test' })).toHaveLength(1);
  });

  it('parses 10,000 contacts, generates CSV, and crosses the worker threshold', () => {
    const text = generatedVcf(10_000);
    const contacts = parseVcf(text, 'generated-10000.vcf').contacts;
    expect(contacts).toHaveLength(10_000);
    expect(
      contactCsv(contacts, { mode: 'combined', columns: ['full_name', 'emails'] }).rows,
    ).toHaveLength(10_000);
    expect(shouldUseContactWorker([{ name: 'generated.vcf', text }])).toBe(true);
  }, 30_000);

  it('stops at a configurable contact limit with a diagnostic', () => {
    const result = parseVcf(generatedVcf(5), 'limited.vcf', { maxContacts: 2 });
    expect(result.contacts).toHaveLength(2);
    expect(result.skippedContacts).toBe(3);
    expect(result.diagnostics.some((item) => item.code === 'CONTACT_LIMIT_REACHED')).toBe(true);
  });

  it('ignores oversized properties while preserving the rest of a contact', () => {
    const result = parseVcf(
      `BEGIN:VCARD\nVERSION:4.0\nFN:Bounded Contact\nNOTE:${'x'.repeat(64)}\nEMAIL:safe@example.test\nEND:VCARD`,
      'oversized.vcf',
      { maxPropertyLength: 32 },
    );
    expect(result.contacts[0]?.emails[0]?.value).toBe('safe@example.test');
    expect(result.contacts[0]?.notes).toEqual([]);
    expect(result.diagnostics.some((item) => item.code === 'OVERSIZED_PROPERTY')).toBe(true);
  });
});
