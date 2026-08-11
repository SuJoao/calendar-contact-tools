import type { Contact, ContactRawProperty, ContactTypedValue, VcfParameters } from './model';

export const mergedVcfVersion = '4.0' as const;

const standardProperties = new Set([
  'VERSION',
  'FN',
  'N',
  'ORG',
  'TITLE',
  'ROLE',
  'EMAIL',
  'TEL',
  'ADR',
  'URL',
  'BDAY',
  'ANNIVERSARY',
  'CATEGORIES',
  'NOTE',
  'NICKNAME',
  'GENDER',
  'UID',
  'KIND',
  'PHOTO',
  'LOGO',
  'GEO',
  'TZ',
  'PRODID',
  'REV',
]);

const preservedParameterNames = new Set([
  'TYPE',
  'PREF',
  'LANGUAGE',
  'VALUE',
  'MEDIATYPE',
  'ALTID',
  'PID',
]);

export function serializeContacts(contacts: Contact[]): string {
  return `${contacts.map(serializeContact).join('\r\n')}\r\n`;
}

export function serializeContact(contact: Contact): string {
  const lines = [
    'BEGIN:VCARD',
    `VERSION:${mergedVcfVersion}`,
    `FN:${escapeVcfText(contact.formattedName)}`,
    `N:${escapeComponents([
      contact.familyName,
      contact.givenName,
      contact.additionalNames.join(','),
      contact.honorificPrefixes.join(','),
      contact.honorificSuffixes.join(','),
    ])}`,
  ];
  if (contact.organization || contact.organizationUnits.length)
    lines.push(`ORG:${escapeComponents([contact.organization, ...contact.organizationUnits])}`);
  pushText(lines, 'TITLE', contact.title);
  pushText(lines, 'ROLE', contact.role);
  contact.emails.forEach((item) => lines.push(typedLine('EMAIL', item)));
  contact.phones.forEach((item) =>
    lines.push(typedLine('TEL', item, item.value.includes(':') ? {} : { VALUE: ['text'] })),
  );
  contact.addresses.forEach((item) =>
    lines.push(
      `${parameterizedName('ADR', item)}:${escapeComponents([
        item.poBox,
        item.extended,
        item.street,
        item.locality,
        item.region,
        item.postalCode,
        item.country,
      ])}`,
    ),
  );
  contact.urls.forEach((item) => lines.push(typedLine('URL', item)));
  pushText(lines, 'BDAY', contact.birthday);
  pushText(lines, 'ANNIVERSARY', contact.anniversary);
  if (contact.categories.length)
    lines.push(`CATEGORIES:${contact.categories.map(escapeVcfText).join(',')}`);
  contact.notes.forEach((value) => pushText(lines, 'NOTE', value));
  pushText(lines, 'NICKNAME', contact.nickname);
  pushText(lines, 'GENDER', contact.gender);
  pushText(lines, 'UID', contact.uid);
  pushText(lines, 'KIND', contact.kind);
  pushText(lines, 'GEO', contact.geo);
  pushText(lines, 'TZ', contact.timezone);
  vendorProperties(contact.rawProperties).forEach((property) =>
    lines.push(serializeRawProperty(property)),
  );
  lines.push('END:VCARD');
  return lines.flatMap((line) => foldVcfLine(line)).join('\r\n');
}

export function foldVcfLine(line: string, limit = 75): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).byteLength <= limit) return [line];
  const result: string[] = [];
  let current = '';
  let currentLimit = limit;
  for (const character of line) {
    if (encoder.encode(current + character).byteLength > currentLimit) {
      result.push(result.length ? ` ${current}` : current);
      current = character;
      currentLimit = limit - 1;
    } else current += character;
  }
  if (current) result.push(result.length ? ` ${current}` : current);
  return result;
}

export function escapeVcfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function typedLine(
  name: string,
  item: ContactTypedValue,
  additionalParameters: VcfParameters = {},
): string {
  return `${parameterizedName(name, item, additionalParameters)}:${escapeVcfText(item.value)}`;
}

function parameterizedName(
  name: string,
  item: ContactTypedValue,
  additionalParameters: VcfParameters = {},
): string {
  const parameters: VcfParameters = { ...item.parameters, ...additionalParameters };
  if (item.types.length) parameters.TYPE = item.types;
  if (item.preference) parameters.PREF = [String(item.preference)];
  const suffix = Object.entries(parameters)
    .filter(([key, values]) => preservedParameterNames.has(key) && values.length)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => `;${key}=${values.map(parameterValue).join(',')}`)
    .join('');
  return `${name}${suffix}`;
}

function serializeRawProperty(property: ContactRawProperty): string {
  const name = `${property.group ? `${safeToken(property.group)}.` : ''}${safeToken(property.name)}`;
  const parameters = Object.entries(property.parameters)
    .filter(([key, values]) => preservedParameterNames.has(key) && values.length)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => `;${safeToken(key)}=${values.map(parameterValue).join(',')}`)
    .join('');
  return `${name}${parameters}:${escapeVcfText(property.value)}`;
}

function vendorProperties(properties: ContactRawProperty[]): ContactRawProperty[] {
  const seen = new Set<string>();
  return properties.filter((property) => {
    if (standardProperties.has(property.name)) return false;
    const signature = JSON.stringify([
      property.group ?? '',
      property.name,
      property.value,
      property.parameters,
    ]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function pushText(lines: string[], name: string, value: string): void {
  if (value) lines.push(`${name}:${escapeVcfText(value)}`);
}

function escapeComponents(values: string[]): string {
  return values.map(escapeVcfText).join(';');
}

function parameterValue(value: string): string {
  const clean = value.replace(/[\r\n"]/g, '');
  return /[:,;]/.test(clean) ? `"${clean}"` : clean;
}

function safeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '-');
}
