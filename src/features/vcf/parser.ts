import { vcfLimits } from '../../config/vcf';
import type {
  Contact,
  ContactAddress,
  ContactMedia,
  ContactRawProperty,
  ContactTypedValue,
  ContactUrl,
  VcfDiagnostic,
  VcfDiagnosticCode,
  VcfParameters,
  VcfParseResult,
  VcfVersion,
} from './model';

interface LogicalLine {
  text: string;
  line: number;
}

interface CardBlock {
  lines: LogicalLine[];
  raw: string;
  startLine: number;
}

interface ParsedProperty extends ContactRawProperty {
  decodedValue: string;
}

interface ActiveVcfLimits {
  maxContacts: number;
  maxPropertyLength: number;
  maxRepeatedValues: number;
}

export interface ParseVcfOptions {
  maxContacts?: number;
  maxPropertyLength?: number;
  maxRepeatedValues?: number;
}

export function unfoldVcf(text: string): string {
  return unfoldLines(text)
    .map((line) => line.text)
    .join('\r\n');
}

export function parseVcf(
  text: string,
  sourceFile = 'contacts.vcf',
  options: ParseVcfOptions = {},
): VcfParseResult {
  const limits = { ...vcfLimits, ...options };
  const diagnostics: VcfDiagnostic[] = [];
  const { blocks, skipped } = scanCards(unfoldLines(text), sourceFile, diagnostics);
  if (!blocks.length && !skipped) {
    diagnostic(
      diagnostics,
      sourceFile,
      'MALFORMED_VCARD',
      'error',
      'The file is not a vCard file (BEGIN:VCARD is missing).',
    );
    return {
      contacts: [],
      diagnostics,
      warnings: diagnostics.map((item) => item.message),
      skippedContacts: 1,
    };
  }

  const contacts: Contact[] = [];
  let skippedContacts = skipped;
  for (const [index, block] of blocks.entries()) {
    if (contacts.length >= limits.maxContacts) {
      diagnostic(
        diagnostics,
        sourceFile,
        'CONTACT_LIMIT_REACHED',
        'warning',
        `Only the first ${limits.maxContacts.toLocaleString()} readable contacts were loaded.`,
        block.startLine,
      );
      skippedContacts += blocks.length - index;
      break;
    }
    const contact = parseBlock(block, sourceFile, index, diagnostics, limits);
    if (contact) contacts.push(contact);
    else skippedContacts += 1;
  }
  return {
    contacts,
    diagnostics,
    warnings: diagnostics.map((item) => item.message),
    skippedContacts,
  };
}

function unfoldLines(text: string): LogicalLine[] {
  const physical = text.replace(/\r\n?/g, '\n').split('\n');
  const logical: LogicalLine[] = [];
  let current: LogicalLine | undefined;
  for (let index = 0; index < physical.length; index += 1) {
    const value = physical[index]!;
    if (current && /^[ \t]/.test(value)) {
      if (/ENCODING=(?:QUOTED-PRINTABLE|QP)/i.test(current.text) && current.text.endsWith('='))
        current.text = current.text.slice(0, -1) + value.slice(1);
      else current.text += value.slice(1);
      continue;
    }
    if (
      current &&
      /ENCODING=(?:QUOTED-PRINTABLE|QP)/i.test(current.text) &&
      current.text.endsWith('=')
    ) {
      current.text = current.text.slice(0, -1) + value;
      continue;
    }
    if (current) logical.push(current);
    current = { text: value, line: index + 1 };
  }
  if (current) logical.push(current);
  return logical;
}

function scanCards(
  lines: LogicalLine[],
  sourceFile: string,
  diagnostics: VcfDiagnostic[],
): { blocks: CardBlock[]; skipped: number } {
  const blocks: CardBlock[] = [];
  let active: LogicalLine[] | undefined;
  let skipped = 0;
  for (const line of lines) {
    const marker = line.text.trim().toUpperCase();
    if (marker === 'BEGIN:VCARD') {
      if (active) {
        skipped += 1;
        diagnostic(
          diagnostics,
          sourceFile,
          'TRUNCATED_VCARD',
          'error',
          'A contact ended without END:VCARD and was skipped.',
          active[0]?.line,
        );
      }
      active = [line];
    } else if (marker === 'END:VCARD') {
      if (!active) {
        diagnostic(
          diagnostics,
          sourceFile,
          'MALFORMED_VCARD',
          'warning',
          'An END:VCARD marker without a matching start was ignored.',
          line.line,
        );
        continue;
      }
      active.push(line);
      blocks.push({
        lines: active,
        raw: active.map((item) => item.text).join('\r\n'),
        startLine: active[0]!.line,
      });
      active = undefined;
    } else if (active) active.push(line);
  }
  if (active) {
    skipped += 1;
    diagnostic(
      diagnostics,
      sourceFile,
      'TRUNCATED_VCARD',
      'error',
      'A contact ended without END:VCARD and was skipped.',
      active[0]?.line,
    );
  }
  return { blocks, skipped };
}

function parseBlock(
  block: CardBlock,
  sourceFile: string,
  index: number,
  diagnostics: VcfDiagnostic[],
  limits: ActiveVcfLimits,
): Contact | undefined {
  const contactId = `${sourceFile}:${index + 1}`;
  const properties: ParsedProperty[] = [];
  for (const line of block.lines.slice(1, -1)) {
    if (!line.text.trim()) continue;
    if (line.text.length > limits.maxPropertyLength) {
      diagnostic(
        diagnostics,
        sourceFile,
        'OVERSIZED_PROPERTY',
        'warning',
        `A property longer than ${limits.maxPropertyLength.toLocaleString()} characters was ignored.`,
        line.line,
        contactId,
      );
      continue;
    }
    const property = parseProperty(line, sourceFile, contactId, diagnostics);
    if (property) properties.push(property);
  }
  if (!properties.some((property) => !['VERSION', 'PRODID'].includes(property.name))) {
    diagnostic(
      diagnostics,
      sourceFile,
      'MALFORMED_VCARD',
      'error',
      'A contact contained no readable identity or contact properties and was skipped.',
      block.startLine,
      contactId,
    );
    return undefined;
  }

  const versionText = first(properties, 'VERSION')?.decodedValue.trim() ?? '';
  const version: VcfVersion = ['2.1', '3.0', '4.0'].includes(versionText)
    ? (versionText as VcfVersion)
    : 'unknown';
  if (!versionText)
    diagnostic(
      diagnostics,
      sourceFile,
      'MISSING_VERSION',
      'warning',
      'VERSION is missing; common fields were parsed conservatively.',
      block.startLine,
      contactId,
    );
  else if (version === 'unknown')
    diagnostic(
      diagnostics,
      sourceFile,
      'UNSUPPORTED_VERSION',
      'warning',
      `vCard version ${versionText} is not explicitly supported; common fields were preserved.`,
      first(properties, 'VERSION')?.line,
      contactId,
      undefined,
      'VERSION',
    );

  const nameParts = structured(first(properties, 'N')?.decodedValue ?? '', ';', 5);
  const familyName = nameParts[0] ?? '';
  const givenName = nameParts[1] ?? '';
  const additionalNames = listComponent(nameParts[2] ?? '');
  const honorificPrefixes = listComponent(nameParts[3] ?? '');
  const honorificSuffixes = listComponent(nameParts[4] ?? '');
  const fn = simple(first(properties, 'FN')?.decodedValue ?? '');
  const derivedName = [
    ...honorificPrefixes,
    givenName,
    ...additionalNames,
    familyName,
    ...honorificSuffixes,
  ]
    .filter(Boolean)
    .join(' ');
  const formattedName = fn || derivedName || '(Unnamed contact)';
  if (!fn)
    diagnostic(
      diagnostics,
      sourceFile,
      'MISSING_FN',
      'warning',
      derivedName
        ? 'FN is missing; the display name was derived from N without changing the source.'
        : 'FN is missing and no structured name was available.',
      block.startLine,
      contactId,
      formattedName,
      'FN',
    );

  const org = structured(first(properties, 'ORG')?.decodedValue ?? '', ';');
  const contactWarnings = diagnostics.filter((item) => item.contactId === contactId);
  const photo = mediaValue(first(properties, 'PHOTO'), diagnostics, sourceFile, contactId);
  const logo = mediaValue(first(properties, 'LOGO'), diagnostics, sourceFile, contactId);
  const contact: Contact = {
    id: contactId,
    sourceIndex: 0,
    originalIndex: index,
    version,
    formattedName,
    fullName: formattedName,
    familyName,
    givenName,
    additionalNames,
    honorificPrefixes,
    honorificSuffixes,
    organization: org[0] ?? '',
    organizationUnits: org.slice(1).filter(Boolean),
    title: simple(first(properties, 'TITLE')?.decodedValue ?? ''),
    role: simple(first(properties, 'ROLE')?.decodedValue ?? ''),
    emails: typedValues(properties, 'EMAIL', limits, diagnostics, sourceFile, contactId),
    phones: typedValues(properties, 'TEL', limits, diagnostics, sourceFile, contactId),
    addresses: addressValues(properties, limits, diagnostics, sourceFile, contactId),
    urls: urlValues(properties, limits, diagnostics, sourceFile, contactId),
    birthday: simple(first(properties, 'BDAY')?.decodedValue ?? ''),
    anniversary: simple(first(properties, 'ANNIVERSARY')?.decodedValue ?? ''),
    categories: properties
      .filter((property) => property.name === 'CATEGORIES')
      .flatMap((property) => structured(property.decodedValue, ','))
      .filter(Boolean)
      .slice(0, limits.maxRepeatedValues),
    notes: properties
      .filter((property) => property.name === 'NOTE')
      .map((property) => simple(property.decodedValue))
      .slice(0, limits.maxRepeatedValues),
    nickname: simple(first(properties, 'NICKNAME')?.decodedValue ?? ''),
    gender: simple(first(properties, 'GENDER')?.decodedValue ?? ''),
    uid: simple(first(properties, 'UID')?.decodedValue ?? ''),
    kind: simple(first(properties, 'KIND')?.decodedValue ?? ''),
    ...(photo ? { photo } : {}),
    ...(logo ? { logo } : {}),
    geo: simple(first(properties, 'GEO')?.decodedValue ?? ''),
    timezone: simple(first(properties, 'TZ')?.decodedValue ?? ''),
    sourceFile,
    rawProperties: properties.map(rawProperty),
    warnings: contactWarnings,
    raw: block.raw,
  };
  contact.warnings = diagnostics.filter((item) => item.contactId === contactId);
  return contact;
}

function parseProperty(
  line: LogicalLine,
  sourceFile: string,
  contactId: string,
  diagnostics: VcfDiagnostic[],
): ParsedProperty | undefined {
  const colon = delimiterIndex(line.text, ':');
  if (colon < 1) {
    diagnostic(
      diagnostics,
      sourceFile,
      'INVALID_PROPERTY',
      'warning',
      'A property without a name/value separator was ignored.',
      line.line,
      contactId,
    );
    return undefined;
  }
  const head = line.text.slice(0, colon);
  const rawValue = line.text.slice(colon + 1);
  const headParts = splitHeader(head);
  const qualifiedName = headParts.shift() ?? '';
  const dot = qualifiedName.lastIndexOf('.');
  const group = dot >= 0 ? qualifiedName.slice(0, dot) : undefined;
  const name = (dot >= 0 ? qualifiedName.slice(dot + 1) : qualifiedName).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) {
    diagnostic(
      diagnostics,
      sourceFile,
      'INVALID_PROPERTY',
      'warning',
      `The property name “${name || qualifiedName}” is invalid and was ignored.`,
      line.line,
      contactId,
    );
    return undefined;
  }
  const parameters = parseParameters(headParts);
  const decodedValue = decodePropertyValue(
    rawValue,
    parameters,
    sourceFile,
    contactId,
    name,
    line.line,
    diagnostics,
  );
  return {
    ...(group ? { group } : {}),
    name,
    value: isBinary(parameters) ? '[embedded binary omitted]' : simple(decodedValue),
    rawValue: isBinary(parameters) ? '[embedded binary omitted]' : rawValue,
    parameters,
    line: line.line,
    decodedValue,
  };
}

function parseParameters(parts: string[]): VcfParameters {
  const parameters: VcfParameters = {};
  for (const part of parts) {
    const equals = delimiterIndex(part, '=');
    const key = (equals < 0 ? 'TYPE' : part.slice(0, equals)).trim().toUpperCase();
    const raw = equals < 0 ? part : part.slice(equals + 1);
    const values = splitHeaderValues(raw).map(unquote).filter(Boolean);
    parameters[key] = [...(parameters[key] ?? []), ...values];
  }
  return parameters;
}

function decodePropertyValue(
  rawValue: string,
  parameters: VcfParameters,
  sourceFile: string,
  contactId: string,
  property: string,
  line: number,
  diagnostics: VcfDiagnostic[],
): string {
  const encoding = parameters.ENCODING?.[0]?.toUpperCase();
  if (encoding !== 'QUOTED-PRINTABLE' && encoding !== 'QP') return rawValue;
  const bytes: number[] = [];
  for (let index = 0; index < rawValue.length; index += 1) {
    const match = rawValue.slice(index).match(/^=([0-9A-F]{2})/i);
    if (match) {
      bytes.push(Number.parseInt(match[1]!, 16));
      index += 2;
    } else bytes.push(...new TextEncoder().encode(rawValue[index]!));
  }
  const charset = (parameters.CHARSET?.[0] ?? 'UTF-8').toUpperCase().replaceAll('_', '-');
  const supported =
    charset === 'UTF-8' || charset === 'UTF8' || charset === 'ISO-8859-1' || charset === 'LATIN1';
  if (!supported) {
    diagnostic(
      diagnostics,
      sourceFile,
      'UNSUPPORTED_CHARSET',
      'warning',
      `The ${property} value uses unsupported charset ${charset}; its encoded text was preserved.`,
      line,
      contactId,
      undefined,
      property,
    );
    return rawValue;
  }
  try {
    return new TextDecoder(
      charset.startsWith('ISO') || charset === 'LATIN1' ? 'iso-8859-1' : 'utf-8',
      {
        fatal: true,
      },
    ).decode(new Uint8Array(bytes));
  } catch {
    if (!parameters.CHARSET) {
      diagnostic(
        diagnostics,
        sourceFile,
        'INVALID_ENCODING',
        'warning',
        `The ${property} value was not valid UTF-8; ISO-8859-1 was used as a conservative fallback.`,
        line,
        contactId,
        undefined,
        property,
      );
      return new TextDecoder('iso-8859-1').decode(new Uint8Array(bytes));
    }
    diagnostic(
      diagnostics,
      sourceFile,
      'INVALID_ENCODING',
      'warning',
      `The ${property} value could not be decoded as ${charset}; its encoded text was preserved.`,
      line,
      contactId,
      undefined,
      property,
    );
    return rawValue;
  }
}

function typedValues(
  properties: ParsedProperty[],
  name: string,
  limits: ActiveVcfLimits,
  diagnostics: VcfDiagnostic[],
  sourceFile: string,
  contactId: string,
): ContactTypedValue[] {
  const matching = properties.filter((property) => property.name === name);
  repeatedLimit(matching.length, name, limits, diagnostics, sourceFile, contactId);
  return matching.slice(0, limits.maxRepeatedValues).map((property) => ({
    value: simple(property.decodedValue),
    types: types(property.parameters),
    ...preference(property.parameters),
    parameters: property.parameters,
  }));
}

function addressValues(
  properties: ParsedProperty[],
  limits: ActiveVcfLimits,
  diagnostics: VcfDiagnostic[],
  sourceFile: string,
  contactId: string,
): ContactAddress[] {
  const matching = properties.filter((property) => property.name === 'ADR');
  repeatedLimit(matching.length, 'ADR', limits, diagnostics, sourceFile, contactId);
  return matching.slice(0, limits.maxRepeatedValues).map((property) => {
    const parts = structured(property.decodedValue, ';', 7);
    const [
      poBox = '',
      extended = '',
      street = '',
      locality = '',
      region = '',
      postalCode = '',
      country = '',
    ] = parts;
    const formatted = [poBox, extended, street, locality, region, postalCode, country]
      .filter(Boolean)
      .join(', ');
    return {
      value: formatted,
      formatted,
      poBox,
      extended,
      street,
      locality,
      region,
      postalCode,
      country,
      types: types(property.parameters),
      ...preference(property.parameters),
      parameters: property.parameters,
    };
  });
}

function urlValues(
  properties: ParsedProperty[],
  limits: ActiveVcfLimits,
  diagnostics: VcfDiagnostic[],
  sourceFile: string,
  contactId: string,
): ContactUrl[] {
  const values = typedValues(properties, 'URL', limits, diagnostics, sourceFile, contactId);
  return values.map((value) => {
    const safeProtocol = isSafeHttpUrl(value.value);
    if (value.value && !safeProtocol)
      diagnostic(
        diagnostics,
        sourceFile,
        'UNSAFE_URI',
        'warning',
        'A URL with a non-HTTP(S) protocol is displayed only as text.',
        properties.find(
          (property) => property.name === 'URL' && simple(property.decodedValue) === value.value,
        )?.line,
        contactId,
        undefined,
        'URL',
      );
    return { ...value, safeProtocol };
  });
}

function mediaValue(
  property: ParsedProperty | undefined,
  diagnostics: VcfDiagnostic[],
  sourceFile: string,
  contactId: string,
): ContactMedia | undefined {
  if (!property) return undefined;
  const encoding = property.parameters.ENCODING?.[0]?.toUpperCase() ?? '';
  const mediaType = mediaTypeFrom(property.parameters);
  if (encoding === 'B' || encoding === 'BASE64' || isBinary(property.parameters)) {
    const compact = property.decodedValue.replace(/\s/g, '');
    return {
      kind: 'embedded',
      mediaType,
      encoding: encoding || 'BASE64',
      estimatedBytes: Math.max(
        0,
        Math.floor((compact.length * 3) / 4) -
          (compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0),
      ),
    };
  }
  const reference = simple(property.decodedValue);
  const safeProtocol = isSafeHttpUrl(reference);
  if (!safeProtocol)
    diagnostic(
      diagnostics,
      sourceFile,
      'UNSUPPORTED_BINARY_FIELD',
      'warning',
      `${property.name} data uses an unsupported representation and will not be loaded.`,
      property.line,
      contactId,
      undefined,
      property.name,
    );
  return {
    kind: safeProtocol ? 'remote' : 'unsupported',
    mediaType,
    encoding,
    reference,
    safeProtocol,
  };
}

function structured(value: string, separator: string, minimum = 0): string[] {
  const result = splitEscaped(value, separator);
  while (result.length < minimum) result.push('');
  return result;
}

export function splitEscaped(value: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += char === 'n' || char === 'N' ? '\n' : char;
      escaped = false;
    } else if (char === '\\') escaped = true;
    else if (char === separator) {
      result.push(current);
      current = '';
    } else current += char;
  }
  if (escaped) current += '\\';
  result.push(current);
  return result;
}

function simple(value: string): string {
  return splitEscaped(value, '\0')[0] ?? '';
}

function listComponent(value: string): string[] {
  return splitEscaped(value, ',').filter(Boolean);
}

function first(properties: ParsedProperty[], name: string): ParsedProperty | undefined {
  return properties.find((property) => property.name === name);
}

function rawProperty(property: ParsedProperty): ContactRawProperty {
  return {
    ...(property.group ? { group: property.group } : {}),
    name: property.name,
    value: property.value,
    rawValue: property.rawValue,
    parameters: property.parameters,
    line: property.line,
  };
}

function types(parameters: VcfParameters): string[] {
  return (parameters.TYPE ?? []).map((value) => value.toLowerCase());
}

function preference(parameters: VcfParameters): { preference?: number } {
  const explicit = Number.parseInt(parameters.PREF?.[0] ?? '', 10);
  if (Number.isFinite(explicit) && explicit > 0) return { preference: explicit };
  if ((parameters.TYPE ?? []).some((value) => value.toUpperCase() === 'PREF'))
    return { preference: 1 };
  return {};
}

function repeatedLimit(
  count: number,
  property: string,
  limits: ActiveVcfLimits,
  diagnostics: VcfDiagnostic[],
  sourceFile: string,
  contactId: string,
): void {
  if (count <= limits.maxRepeatedValues) return;
  diagnostic(
    diagnostics,
    sourceFile,
    'REPEATED_VALUE_LIMIT_REACHED',
    'warning',
    `${property} values after the first ${limits.maxRepeatedValues.toLocaleString()} were ignored.`,
    undefined,
    contactId,
    undefined,
    property,
  );
}

function isBinary(parameters: VcfParameters): boolean {
  const encoding = parameters.ENCODING?.[0]?.toUpperCase();
  return encoding === 'B' || encoding === 'BASE64';
}

function mediaTypeFrom(parameters: VcfParameters): string {
  const explicit = parameters.MEDIATYPE?.[0];
  if (explicit) return explicit;
  const type = parameters.TYPE?.find((value) => /^(?:JPEG|JPG|PNG|GIF|WEBP|SVG)$/i.test(value));
  return type ? `image/${type.toLowerCase().replace('jpg', 'jpeg')}` : 'Unknown image type';
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function delimiterIndex(value: string, delimiter: string): number {
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') quoted = !quoted;
    else if (!quoted && value[index] === delimiter) return index;
  }
  return -1;
}

function splitHeader(value: string): string[] {
  return splitQuoted(value, ';');
}

function splitHeaderValues(value: string): string[] {
  return splitQuoted(value, ',');
}

function splitQuoted(value: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === separator && !quoted) {
      result.push(current);
      current = '';
    } else current += char;
  }
  result.push(current);
  return result;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function diagnostic(
  target: VcfDiagnostic[],
  sourceFile: string,
  code: VcfDiagnosticCode,
  severity: VcfDiagnostic['severity'],
  message: string,
  line?: number,
  contactId?: string,
  contactName?: string,
  property?: string,
): void {
  target.push({
    severity,
    code,
    message,
    sourceFile,
    ...(line === undefined ? {} : { line }),
    ...(contactId ? { contactId } : {}),
    ...(contactName ? { contactName } : {}),
    ...(property ? { property } : {}),
  });
}
