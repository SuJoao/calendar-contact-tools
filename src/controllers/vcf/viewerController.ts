import { vcfLimits } from '../../config/vcf';
import { contactCsv, contactCsvColumns } from '../../features/vcf/csv';
import type {
  Contact,
  ContactAddress,
  ContactMedia,
  ContactTypedValue,
} from '../../features/vcf/model';
import { filterContacts, sortContacts, type ContactSort } from '../../features/vcf/search';
import { el, qs } from '../../utils/dom';
import { downloadText } from '../../utils/files';
import { addDownload, showSummary } from '../toolUi';
import { loadContacts, vcfDiagnosticMessages } from './shared';

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

export async function runVcfViewer(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadContacts(files);
  const contacts = loaded.contacts;
  showSummary(
    result,
    'Contacts',
    [
      `${contacts.length.toLocaleString()} contacts`,
      `${count(contacts, (contact) => contact.emails.length > 0).toLocaleString()} with email`,
      `${count(contacts, (contact) => contact.phones.length > 0).toLocaleString()} with phone`,
      `${count(contacts, (contact) => Boolean(contact.organization)).toLocaleString()} with organization`,
      `${loaded.skippedContacts.toLocaleString()} malformed contacts skipped`,
    ],
    vcfDiagnosticMessages(loaded.diagnostics),
  );
  renderViewer(result, contacts);
}

function renderViewer(result: HTMLElement, contacts: Contact[]): void {
  const controls = el('div', { class: 'filter-bar' });
  // SECURITY: fixed controls only; parsed contact values use textContent-backed DOM helpers.
  controls.innerHTML = `<label>Search<input id="contact-search" type="search" placeholder="Name, email, phone, organization" /></label><label>Has field<select id="contact-has"><option value="">Any contact</option><option value="email">Has email</option><option value="phone">Has phone</option><option value="organization">Has organization</option><option value="address">Has address</option><option value="notes">Has notes</option></select></label><label>Source file<select id="contact-source"><option value="">All sources</option></select></label><label>vCard version<select id="contact-version"><option value="">All versions</option></select></label><label>Sort<select id="contact-sort"><option value="name">Name</option><option value="organization">Organization</option><option value="source">Source</option></select></label>`;
  const sourceSelect = qs<HTMLSelectElement>('#contact-source', controls);
  [...new Set(contacts.map((contact) => contact.sourceFile))]
    .sort()
    .forEach((source) => sourceSelect.add(new Option(source, source)));
  const versionSelect = qs<HTMLSelectElement>('#contact-version', controls);
  [...new Set(contacts.map((contact) => contact.version))]
    .sort()
    .forEach((version) => versionSelect.add(new Option(version, version)));
  const tableRoot = el('div', { class: 'contact-table' });
  const selected = new Set(contacts.map((contact) => contact.id));
  let displayed = [...contacts];

  const render = (): void => {
    const has = qs<HTMLSelectElement>('#contact-has', controls).value;
    displayed = sortContacts(
      filterContacts(contacts, {
        query: qs<HTMLInputElement>('#contact-search', controls).value,
        hasEmail: has === 'email',
        hasPhone: has === 'phone',
        hasOrganization: has === 'organization',
        hasAddress: has === 'address',
        hasNotes: has === 'notes',
        sourceFile: sourceSelect.value,
        version: versionSelect.value,
      }),
      qs<HTMLSelectElement>('#contact-sort', controls).value as ContactSort,
    );
    renderContactTable(tableRoot, displayed, selected);
  };
  controls.addEventListener('input', render);
  result.append(controls, tableRoot);
  render();

  addDownload(result, 'Download selected contacts CSV', () => {
    const chosen = contacts.filter((contact) => selected.has(contact.id));
    if (!chosen.length) {
      result.append(
        el('p', { class: 'notice error', role: 'alert' }, 'Select at least one contact to export.'),
      );
      return;
    }
    downloadText(
      contactCsv(chosen, { mode: 'combined', columns: [...contactCsvColumns] }).csv,
      'selected-contacts.csv',
      'text/csv;charset=utf-8',
    );
  });
}

function renderContactTable(root: HTMLElement, contacts: Contact[], selected: Set<string>): void {
  root.replaceChildren();
  if (!contacts.length) {
    root.append(el('p', { class: 'empty-state' }, 'No matching contacts.'));
    return;
  }
  const wrapper = el('div', {
    class: 'table-wrap',
    tabindex: '0',
    role: 'region',
    'aria-label': 'Contacts table',
  });
  const table = el('table');
  table.append(el('caption', { class: 'sr-only' }, 'Contacts'));
  const head = el('thead');
  const headRow = el('tr');
  ['Select', 'Name', 'Organization', 'Email', 'Phone', 'Source'].forEach((heading) =>
    headRow.append(el('th', { scope: 'col' }, heading)),
  );
  head.append(headRow);
  const body = el('tbody');
  contacts.slice(0, vcfLimits.maxRenderedContacts).forEach((contact) => {
    const row = el('tr');
    const selectCell = el('td');
    const checkbox = el('input', {
      type: 'checkbox',
      'aria-label': `Select ${contact.formattedName}`,
    });
    checkbox.checked = selected.has(contact.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(contact.id);
      else selected.delete(contact.id);
    });
    selectCell.append(checkbox);
    const nameCell = el('td', { class: 'contact-name-cell' });
    const details = el('details', { class: 'contact-details' });
    details.append(el('summary', {}, contact.formattedName), contactDetail(contact));
    nameCell.append(details);
    row.append(
      selectCell,
      nameCell,
      el('td', {}, contact.organization),
      el('td', {}, contact.emails[0]?.value ?? ''),
      el('td', {}, contact.phones[0]?.value ?? ''),
      el('td', {}, contact.sourceFile),
    );
    body.append(row);
  });
  table.append(head, body);
  wrapper.append(table);
  root.append(wrapper);
  if (contacts.length > vcfLimits.maxRenderedContacts)
    root.append(
      el(
        'p',
        { class: 'field-help' },
        `Showing the first ${vcfLimits.maxRenderedContacts.toLocaleString()} of ${contacts.length.toLocaleString()} matching contacts. Refine the filters to inspect the remainder; exports include every selection.`,
      ),
    );
}

function contactDetail(contact: Contact): HTMLElement {
  const root = el('div', { class: 'contact-detail-panel' });
  section(root, 'Identity', [
    ['Given name', contact.givenName],
    ['Additional names', contact.additionalNames.join(', ')],
    ['Family name', contact.familyName],
    ['Prefixes', contact.honorificPrefixes.join(', ')],
    ['Suffixes', contact.honorificSuffixes.join(', ')],
    ['Nickname', contact.nickname],
    ['Gender', contact.gender],
  ]);
  section(root, 'Work', [
    ['Organization', contact.organization],
    ['Organization units', contact.organizationUnits.join(' · ')],
    ['Title', contact.title],
    ['Role', contact.role],
  ]);
  typedSection(root, 'Email', contact.emails);
  typedSection(root, 'Phone', contact.phones);
  addressSection(root, contact.addresses);
  section(root, 'Other', [
    ['Websites', contact.urls.map((item) => item.value).join('\n')],
    ['Birthday', contact.birthday],
    ['Anniversary', contact.anniversary],
    ['Categories', contact.categories.join(', ')],
    ['Notes', contact.notes.join('\n\n')],
    ['Timezone', contact.timezone],
    ['Geo', contact.geo],
    ['Photo', mediaLabel(contact.photo)],
    ['Logo', mediaLabel(contact.logo)],
  ]);
  section(root, 'Technical details', [
    ['vCard version', contact.version],
    ['UID', contact.uid],
    ['Kind', contact.kind],
    ['Source file', contact.sourceFile],
  ]);
  const additional = contact.rawProperties.filter(
    (property) => !standardProperties.has(property.name),
  );
  if (additional.length) {
    const disclosure = el('details', { class: 'additional-properties' });
    disclosure.append(el('summary', {}, 'Additional properties'));
    const dl = el('dl', { class: 'detail-list' });
    additional.forEach((property) =>
      dl.append(el('dt', {}, property.name), el('dd', {}, property.value)),
    );
    disclosure.append(dl);
    root.append(disclosure);
  }
  return root;
}

function section(root: HTMLElement, heading: string, fields: [string, string][]): void {
  const visible = fields.filter(([, value]) => Boolean(value));
  if (!visible.length) return;
  const sectionRoot = el('section');
  sectionRoot.append(el('h4', {}, heading));
  const dl = el('dl', { class: 'detail-list' });
  visible.forEach(([name, value]) => {
    const dd = el('dd', value.includes('\n') ? { class: 'preserve-lines' } : {}, value);
    dl.append(el('dt', {}, name), dd);
  });
  sectionRoot.append(dl);
  root.append(sectionRoot);
}

function typedSection(root: HTMLElement, heading: string, values: ContactTypedValue[]): void {
  section(
    root,
    heading,
    values.map((item, index) => [
      `${heading} ${index + 1}${item.types.length ? ` (${item.types.join(', ')})` : ''}`,
      `${item.value}${item.preference ? ` · preference ${item.preference}` : ''}`,
    ]),
  );
}

function addressSection(root: HTMLElement, values: ContactAddress[]): void {
  section(
    root,
    'Address',
    values.map((item, index) => [
      `Address ${index + 1}${item.types.length ? ` (${item.types.join(', ')})` : ''}`,
      item.formatted,
    ]),
  );
}

function mediaLabel(media: ContactMedia | undefined): string {
  if (!media) return '';
  if (media.kind === 'embedded')
    return `Embedded · ${media.mediaType}${media.estimatedBytes === undefined ? '' : ` · approximately ${formatBytes(media.estimatedBytes)}`}`;
  if (media.kind === 'remote') return `Remote image not loaded · ${media.reference ?? ''}`;
  return 'Unsupported image data not loaded';
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
}

function count(contacts: Contact[], predicate: (contact: Contact) => boolean): number {
  return contacts.filter(predicate).length;
}
