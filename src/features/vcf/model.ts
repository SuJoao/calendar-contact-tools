export type VcfVersion = '2.1' | '3.0' | '4.0' | 'unknown';

export type VcfDiagnosticSeverity = 'error' | 'warning' | 'info';

export type VcfDiagnosticCode =
  | 'MALFORMED_VCARD'
  | 'MISSING_VERSION'
  | 'UNSUPPORTED_VERSION'
  | 'MISSING_FN'
  | 'INVALID_PROPERTY'
  | 'INVALID_ENCODING'
  | 'UNSUPPORTED_CHARSET'
  | 'TRUNCATED_VCARD'
  | 'OVERSIZED_PROPERTY'
  | 'CONTACT_LIMIT_REACHED'
  | 'REPEATED_VALUE_LIMIT_REACHED'
  | 'UNSUPPORTED_BINARY_FIELD'
  | 'UNSAFE_URI';

export interface VcfDiagnostic {
  severity: VcfDiagnosticSeverity;
  code: VcfDiagnosticCode;
  message: string;
  sourceFile: string;
  contactId?: string;
  contactName?: string;
  property?: string;
  line?: number;
}

export type VcfParameters = Record<string, string[]>;

export interface ContactRawProperty {
  group?: string;
  name: string;
  value: string;
  rawValue: string;
  parameters: VcfParameters;
  line: number;
}

export interface ContactTypedValue {
  value: string;
  types: string[];
  preference?: number;
  parameters: VcfParameters;
}

export type ContactEmail = ContactTypedValue;
export type ContactPhone = ContactTypedValue;
export type ContactUrl = ContactTypedValue & { safeProtocol: boolean };

export interface ContactAddress extends ContactTypedValue {
  poBox: string;
  extended: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  formatted: string;
}

export interface ContactMedia {
  kind: 'embedded' | 'remote' | 'unsupported';
  mediaType: string;
  encoding: string;
  estimatedBytes?: number;
  reference?: string;
  safeProtocol?: boolean;
}

export interface Contact {
  id: string;
  sourceIndex: number;
  originalIndex: number;
  version: VcfVersion;
  formattedName: string;
  /** Compatibility display alias. New code should use formattedName. */
  fullName: string;
  givenName: string;
  additionalNames: string[];
  familyName: string;
  honorificPrefixes: string[];
  honorificSuffixes: string[];
  organization: string;
  organizationUnits: string[];
  title: string;
  role: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  urls: ContactUrl[];
  birthday: string;
  anniversary: string;
  categories: string[];
  notes: string[];
  nickname: string;
  gender: string;
  uid: string;
  kind: string;
  photo?: ContactMedia;
  logo?: ContactMedia;
  geo: string;
  timezone: string;
  sourceFile: string;
  rawProperties: ContactRawProperty[];
  warnings: VcfDiagnostic[];
  raw: string;
}

export interface VcfInput {
  name: string;
  text: string;
}

export interface VcfParseResult {
  contacts: Contact[];
  diagnostics: VcfDiagnostic[];
  /** Compatibility projection for older callers. */
  warnings: string[];
  skippedContacts: number;
}
