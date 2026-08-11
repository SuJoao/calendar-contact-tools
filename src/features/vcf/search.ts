import type { Contact } from './model';

export interface ContactFilters {
  query?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasOrganization?: boolean;
  hasAddress?: boolean;
  hasNotes?: boolean;
  sourceFile?: string;
  version?: string;
}

export type ContactSort = 'name' | 'organization' | 'source';

export function filterContacts(contacts: Contact[], filters: ContactFilters): Contact[] {
  const query = searchKey(filters.query ?? '');
  return contacts.filter((contact) => {
    if (filters.hasEmail && !contact.emails.length) return false;
    if (filters.hasPhone && !contact.phones.length) return false;
    if (filters.hasOrganization && !contact.organization) return false;
    if (filters.hasAddress && !contact.addresses.length) return false;
    if (filters.hasNotes && !contact.notes.length) return false;
    if (filters.sourceFile && contact.sourceFile !== filters.sourceFile) return false;
    if (filters.version && contact.version !== filters.version) return false;
    if (!query) return true;
    return searchKey(
      [
        contact.formattedName,
        contact.givenName,
        contact.familyName,
        contact.additionalNames,
        contact.emails.map((item) => item.value),
        contact.phones.map((item) => item.value),
        contact.organization,
        contact.organizationUnits,
        contact.title,
        contact.categories,
      ]
        .flat(3)
        .join(' '),
    ).includes(query);
  });
}

export function sortContacts(contacts: Contact[], sort: ContactSort): Contact[] {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  const value = (contact: Contact): string => {
    if (sort === 'organization') return contact.organization;
    if (sort === 'source') return contact.sourceFile;
    return contact.formattedName;
  };
  return [...contacts].sort((left, right) => collator.compare(value(left), value(right)));
}

export function searchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}
