import {
  contactRichness,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from './duplicateDetection';
import type {
  Contact,
  ContactAddress,
  ContactRawProperty,
  ContactTypedValue,
  ContactUrl,
  VcfDiagnostic,
  VcfParameters,
} from './model';
import { serializeContact, serializeContacts } from './serializer';

export { serializeContact, serializeContacts } from './serializer';

export type SingularMergeField =
  | 'formattedName'
  | 'givenName'
  | 'familyName'
  | 'organization'
  | 'title'
  | 'role'
  | 'birthday'
  | 'anniversary'
  | 'nickname'
  | 'gender'
  | 'kind'
  | 'timezone'
  | 'geo'
  | 'uid';

export interface ProvenancedValue<T> {
  value: T;
  sourceContactId: string;
  sourceFile: string;
  originalIndex: number;
}

export interface MergeConflict {
  field: SingularMergeField;
  label: string;
  choices: ProvenancedValue<string>[];
  defaultSourceContactId: string;
}

export interface ContactMergePlan {
  contactIds: string[];
  primaryContactId: string;
  conflicts: MergeConflict[];
  noteChoices: ProvenancedValue<string[]>[];
  repeatedValueCount: number;
  vendorPropertyCount: number;
  binaryFieldsOmitted: number;
}

export interface ContactMergeSelections {
  primaryContactId?: string;
  singular?: Partial<Record<SingularMergeField, string>>;
  notes?: 'combine' | string;
}

const singularFields: { key: SingularMergeField; label: string }[] = [
  { key: 'formattedName', label: 'Formatted name' },
  { key: 'givenName', label: 'Given name' },
  { key: 'familyName', label: 'Family name' },
  { key: 'organization', label: 'Organization' },
  { key: 'title', label: 'Job title' },
  { key: 'role', label: 'Role' },
  { key: 'birthday', label: 'Birthday' },
  { key: 'anniversary', label: 'Anniversary' },
  { key: 'nickname', label: 'Nickname' },
  { key: 'gender', label: 'Gender' },
  { key: 'kind', label: 'Kind' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'geo', label: 'Geo' },
  { key: 'uid', label: 'UID' },
];

export function createContactMergePlan(
  contacts: Contact[],
  requestedPrimaryId?: string,
): ContactMergePlan {
  if (!contacts.length) throw new Error('Choose at least one contact to merge.');
  const primary = choosePrimary(contacts, requestedPrimaryId);
  const conflicts = singularFields.flatMap(({ key, label }) => {
    const choices = distinctProvenancedStrings(contacts, key);
    return choices.length > 1
      ? [
          {
            field: key,
            label,
            choices,
            defaultSourceContactId: preferredChoice(choices, primary.id),
          },
        ]
      : [];
  });
  return {
    contactIds: contacts.map((contact) => contact.id),
    primaryContactId: primary.id,
    conflicts,
    noteChoices: contacts
      .filter((contact) => contact.notes.length)
      .map((contact) => provenance(contact.notes, contact)),
    repeatedValueCount: contacts.reduce(
      (total, contact) =>
        total +
        contact.emails.length +
        contact.phones.length +
        contact.addresses.length +
        contact.urls.length +
        contact.categories.length,
      0,
    ),
    vendorPropertyCount: mergedVendorProperties(contacts).length,
    binaryFieldsOmitted: contacts.reduce(
      (total, contact) => total + Number(Boolean(contact.photo)) + Number(Boolean(contact.logo)),
      0,
    ),
  };
}

export function applyContactMergePlan(
  contacts: Contact[],
  plan: ContactMergePlan,
  selections: ContactMergeSelections = {},
): Contact {
  const selectedContacts = contacts.filter((contact) => plan.contactIds.includes(contact.id));
  if (!selectedContacts.length) throw new Error('The merge plan no longer matches any contacts.');
  const primary = choosePrimary(
    selectedContacts,
    selections.primaryContactId ?? plan.primaryContactId,
  );
  const pick = (field: SingularMergeField): string => {
    const requested = selections.singular?.[field];
    const selected = requested
      ? selectedContacts.find((contact) => contact.id === requested)
      : undefined;
    return String(
      selected?.[field] ||
        primary[field] ||
        selectedContacts.find((contact) => String(contact[field]).trim())?.[field] ||
        '',
    );
  };
  const notes = mergeNotes(selectedContacts, primary, selections.notes);
  const parameterWarnings: VcfDiagnostic[] = [];
  const formattedName = pick('formattedName');
  const merged: Contact = {
    ...primary,
    id: `merged:${plan.contactIds.slice().sort().join('|')}`,
    sourceIndex: primary.sourceIndex,
    originalIndex: primary.originalIndex,
    version: '4.0',
    formattedName,
    fullName: formattedName,
    givenName: pick('givenName'),
    familyName: pick('familyName'),
    additionalNames: richestCompatibleArray(selectedContacts, 'additionalNames', primary),
    honorificPrefixes: richestCompatibleArray(selectedContacts, 'honorificPrefixes', primary),
    honorificSuffixes: richestCompatibleArray(selectedContacts, 'honorificSuffixes', primary),
    organization: pick('organization'),
    organizationUnits: compatibleOrganizationUnits(selectedContacts, pick('organization'), primary),
    title: pick('title'),
    role: pick('role'),
    emails: mergeTypedValues(
      selectedContacts.flatMap((contact) => contact.emails),
      (item) => normalizeEmail(item.value),
      parameterWarnings,
    ),
    phones: mergeTypedValues(
      selectedContacts.flatMap((contact) => contact.phones),
      (item) => normalizePhone(item.value),
      parameterWarnings,
    ),
    addresses: mergeAddresses(
      selectedContacts.flatMap((contact) => contact.addresses),
      parameterWarnings,
    ),
    urls: mergeUrls(
      selectedContacts.flatMap((contact) => contact.urls),
      parameterWarnings,
    ),
    birthday: pick('birthday'),
    anniversary: pick('anniversary'),
    categories: uniqueStrings(selectedContacts.flatMap((contact) => contact.categories)),
    notes,
    nickname: pick('nickname'),
    gender: pick('gender'),
    uid: pick('uid'),
    kind: pick('kind'),
    geo: pick('geo'),
    timezone: pick('timezone'),
    sourceFile: primary.sourceFile,
    rawProperties: mergedVendorProperties(selectedContacts),
    warnings: [
      ...selectedContacts.flatMap((contact) => contact.warnings),
      ...parameterWarnings,
      ...binaryWarnings(selectedContacts, primary),
    ],
    raw: '',
  };
  delete merged.photo;
  delete merged.logo;
  merged.raw = serializeContact(merged);
  return merged;
}

/** Compatibility wrapper. Prefer createContactMergePlan/applyContactMergePlan. */
export function mergeContacts(
  contacts: Contact[],
  preferredName?: string,
  preferredValuesFromId?: string,
): Contact {
  const plan = createContactMergePlan(contacts, preferredValuesFromId);
  const merged = applyContactMergePlan(contacts, plan, {
    ...(preferredValuesFromId ? { primaryContactId: preferredValuesFromId } : {}),
  });
  if (preferredName) {
    merged.formattedName = preferredName;
    merged.fullName = preferredName;
    merged.raw = serializeContact(merged);
  }
  return merged;
}

/** Combines readable original records without normalization or deduplication. */
export function mergeVcfTexts(texts: string[]): string {
  const blocks = texts.flatMap(
    (text) => text.replace(/\r?\n[ \t]/g, '').match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [],
  );
  return `${blocks.join('\r\n')}\r\n`;
}

/** Combines only records accepted by the parser while retaining each record's source syntax/version. */
export function combineOriginalContacts(contacts: Contact[]): string {
  const records = contacts.map((contact) => contact.raw.trim()).filter(Boolean);
  return `${records.join('\r\n')}\r\n`;
}

export function serializeResolvedContacts(contacts: Contact[]): string {
  return serializeContacts(contacts);
}

function choosePrimary(contacts: Contact[], requestedId?: string): Contact {
  const requested = contacts.find((contact) => contact.id === requestedId);
  if (requested) return requested;
  return [...contacts].sort(
    (left, right) =>
      contactRichness(right) - contactRichness(left) ||
      left.sourceIndex - right.sourceIndex ||
      left.originalIndex - right.originalIndex,
  )[0]!;
}

function distinctProvenancedStrings(
  contacts: Contact[],
  key: SingularMergeField,
): ProvenancedValue<string>[] {
  const found = new Map<string, ProvenancedValue<string>>();
  for (const contact of contacts) {
    const value = String(contact[key]).trim();
    if (!value) continue;
    const normalized = key.toLowerCase().includes('name')
      ? normalizeName(value)
      : normalizeText(value);
    if (!found.has(normalized)) found.set(normalized, provenance(value, contact));
  }
  return [...found.values()];
}

function preferredChoice(choices: ProvenancedValue<string>[], primaryId: string): string {
  return (
    choices.find((choice) => choice.sourceContactId === primaryId)?.sourceContactId ??
    choices[0]!.sourceContactId
  );
}

function provenance<T>(value: T, contact: Contact): ProvenancedValue<T> {
  return {
    value,
    sourceContactId: contact.id,
    sourceFile: contact.sourceFile,
    originalIndex: contact.originalIndex,
  };
}

function mergeTypedValues<T extends ContactTypedValue>(
  values: T[],
  normalize: (value: T) => string,
  warnings: VcfDiagnostic[],
): T[] {
  const merged = new Map<string, T>();
  values.forEach((item) => {
    const key = normalize(item);
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, structuredClone(item));
      return;
    }
    const combined: T = {
      ...existing,
      types: uniqueStrings([...existing.types, ...item.types]),
      parameters: mergeParameters(existing.parameters, item.parameters),
    };
    const preference = mergedPreference(existing.preference, item.preference, warnings);
    delete combined.preference;
    if (preference !== undefined) combined.preference = preference;
    merged.set(key, combined);
  });
  return [...merged.values()];
}

function mergeAddresses(values: ContactAddress[], warnings: VcfDiagnostic[]): ContactAddress[] {
  return mergeTypedValues(values, addressKey, warnings);
}

function mergeUrls(values: ContactUrl[], warnings: VcfDiagnostic[]): ContactUrl[] {
  return mergeTypedValues(values, (item) => item.value.trim().normalize('NFKC'), warnings);
}

function mergedPreference(
  left: number | undefined,
  right: number | undefined,
  warnings: VcfDiagnostic[],
): number | undefined {
  if (left === right && left !== undefined) return left;
  if (left === undefined && right !== undefined) return right;
  if (right === undefined && left !== undefined) return left;
  if (left !== undefined && right !== undefined) warnings.push(parameterConflictWarning());
  return undefined;
}

function mergeParameters(left: VcfParameters, right: VcfParameters): VcfParameters {
  const result: VcfParameters = {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
    result[key] = uniqueStrings([...(left[key] ?? []), ...(right[key] ?? [])]);
  delete result.PREF;
  return result;
}

function parameterConflictWarning(): VcfDiagnostic {
  return {
    severity: 'warning',
    code: 'INVALID_PROPERTY',
    message:
      'Equivalent repeated values had conflicting PREF parameters; no preference was invented.',
    sourceFile: 'merged contacts',
    property: 'PREF',
  };
}

function mergeNotes(
  contacts: Contact[],
  primary: Contact,
  strategy: ContactMergeSelections['notes'],
): string[] {
  const distinct = uniqueStrings(contacts.flatMap((contact) => contact.notes));
  if (distinct.length <= 1) return distinct;
  if (strategy === 'combine') return distinct;
  const selected = strategy ? contacts.find((contact) => contact.id === strategy) : primary;
  return selected?.notes.length ? uniqueStrings(selected.notes) : [];
}

function compatibleOrganizationUnits(
  contacts: Contact[],
  selectedOrganization: string,
  primary: Contact,
): string[] {
  const compatible = contacts.filter(
    (contact) => normalizeText(contact.organization) === normalizeText(selectedOrganization),
  );
  return (
    [...compatible].sort((a, b) => b.organizationUnits.length - a.organizationUnits.length)[0]
      ?.organizationUnits ?? primary.organizationUnits
  );
}

function richestCompatibleArray(
  contacts: Contact[],
  key: 'additionalNames' | 'honorificPrefixes' | 'honorificSuffixes',
  primary: Contact,
): string[] {
  return [...contacts].sort((a, b) => b[key].length - a[key].length)[0]?.[key] ?? primary[key];
}

function mergedVendorProperties(contacts: Contact[]): ContactRawProperty[] {
  const standard = new Set([
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
  const found = new Map<string, ContactRawProperty>();
  contacts
    .flatMap((contact) => contact.rawProperties)
    .forEach((property) => {
      if (standard.has(property.name)) return;
      const signature = JSON.stringify([
        property.group ?? '',
        property.name,
        property.value,
        property.parameters,
      ]);
      if (!found.has(signature)) found.set(signature, structuredClone(property));
    });
  return [...found.values()];
}

function binaryWarnings(contacts: Contact[], primary: Contact): VcfDiagnostic[] {
  const count = contacts.reduce(
    (total, contact) => total + Number(Boolean(contact.photo)) + Number(Boolean(contact.logo)),
    0,
  );
  return count
    ? [
        {
          severity: 'warning',
          code: 'UNSUPPORTED_BINARY_FIELD',
          message: `${count} PHOTO/LOGO field${count === 1 ? '' : 's'} were omitted from the normalized merged contact.`,
          sourceFile: primary.sourceFile,
        },
      ]
    : [];
}

function uniqueStrings(values: string[]): string[] {
  const found = new Map<string, string>();
  values.filter(Boolean).forEach((value) => {
    const key = normalizeText(value);
    if (!found.has(key)) found.set(key, value);
  });
  return [...found.values()];
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

function addressKey(address: ContactAddress): string {
  return [
    address.poBox,
    address.extended,
    address.street,
    address.locality,
    address.region,
    address.postalCode,
    address.country,
  ]
    .map(normalizeText)
    .join('|');
}
