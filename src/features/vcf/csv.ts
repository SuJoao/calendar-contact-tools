import { toCsv } from '../../utils/csv';
import type { Contact, ContactAddress, ContactTypedValue } from './model';

export type ContactCsvMode = 'combined' | 'expanded';

export const contactCsvColumns = [
  'full_name',
  'given_name',
  'family_name',
  'organization',
  'job_title',
  'emails',
  'phones',
  'addresses',
  'websites',
  'birthday',
  'categories',
  'notes',
  'vcard_version',
  'uid',
  'source_file',
] as const;

export const expandedContactCsvColumns = [
  'repeated_field',
  'repeated_value',
  'repeated_types',
  'repeated_preference',
] as const;

export type ContactCsvColumn = (typeof contactCsvColumns)[number];

export interface ContactCsvOptions {
  mode: ContactCsvMode;
  columns: string[];
}

export function contactToCsvRow(contact: Contact): Record<string, string> {
  return {
    full_name: contact.formattedName,
    given_name: contact.givenName,
    family_name: contact.familyName,
    organization: [contact.organization, ...contact.organizationUnits].filter(Boolean).join(' | '),
    job_title: contact.title,
    emails: joinTyped(contact.emails),
    phones: joinTyped(contact.phones),
    addresses: contact.addresses.map((item) => item.formatted).join(' | '),
    websites: joinTyped(contact.urls),
    birthday: contact.birthday,
    categories: contact.categories.join(' | '),
    notes: contact.notes.join(' | '),
    vcard_version: contact.version,
    uid: contact.uid,
    source_file: contact.sourceFile,
  };
}

export function contactsToCsvRows(
  contacts: Contact[],
  mode: ContactCsvMode,
): Record<string, string>[] {
  if (mode === 'combined') return contacts.map(contactToCsvRow);
  return contacts.flatMap((contact) => expandedRows(contact));
}

export function contactCsv(
  contacts: Contact[],
  { mode, columns }: ContactCsvOptions,
): { csv: string; rows: Record<string, string>[]; columns: string[] } {
  const rows = contactsToCsvRows(contacts, mode);
  const outputColumns =
    mode === 'expanded' ? [...columns, ...expandedContactCsvColumns] : [...columns];
  const safeRows = rows.map((row) => protectRow(row, outputColumns));
  return { csv: toCsv(safeRows, outputColumns), rows: safeRows, columns: outputColumns };
}

function expandedRows(contact: Contact): Record<string, string>[] {
  const base = contactToCsvRow(contact);
  const repeated: { kind: string; item: ContactTypedValue | ContactAddress }[] = [
    ...contact.emails.map((item) => ({ kind: 'email', item })),
    ...contact.phones.map((item) => ({ kind: 'phone', item })),
    ...contact.addresses.map((item) => ({ kind: 'address', item })),
    ...contact.urls.map((item) => ({ kind: 'website', item })),
  ];
  if (!repeated.length)
    return [
      {
        ...base,
        repeated_field: '',
        repeated_value: '',
        repeated_types: '',
        repeated_preference: '',
      },
    ];
  return repeated.map(({ kind, item }) => ({
    ...base,
    repeated_field: kind,
    repeated_value: 'formatted' in item ? item.formatted : item.value,
    repeated_types: item.types.join(' | '),
    repeated_preference: item.preference?.toString() ?? '',
  }));
}

function protectRow(row: Record<string, string>, columns: string[]): Record<string, string> {
  return Object.fromEntries(
    columns.map((column) => [column, protectSpreadsheetValue(row[column] ?? '', column, row)]),
  );
}

export function protectSpreadsheetValue(
  value: string,
  column: string,
  row: Record<string, string> = {},
): string {
  const phoneField =
    column === 'phones' || (column === 'repeated_value' && row.repeated_field === 'phone');
  if (phoneField) return value;
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function joinTyped(values: ContactTypedValue[]): string {
  return values.map((item) => item.value).join(' | ');
}
