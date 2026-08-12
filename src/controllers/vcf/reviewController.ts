import { vcfLimits } from '../../config/vcf';
import type {
  DuplicateAnalysis,
  DuplicateAnalysisStage,
  DuplicateConfidence,
  DuplicateGroup,
} from '../../features/vcf/duplicateDetection';
import {
  applyContactMergePlan,
  createContactMergePlan,
  serializeResolvedContacts,
  type ContactMergeSelections,
  type SingularMergeField,
} from '../../features/vcf/merge';
import type { Contact } from '../../features/vcf/model';
import {
  deriveResolvedContacts,
  emptyResolutionState,
  resetContactResolutions,
  resolveExactDuplicateGroups,
  resolvedGroupCount,
  setContactResolution,
  undoLastResolution,
  type ContactResolutionState,
} from '../../features/vcf/resolutions';
import { analyzeContactDuplicatesAsync } from '../../features/vcf/workers/client';
import { el, qs } from '../../utils/dom';
import { downloadText } from '../../utils/files';
import { addDownload } from '../toolUi';

export interface DuplicateReviewOptions {
  downloadLabel: string;
  filename: string;
}

const stageLabels: Record<DuplicateAnalysisStage, string> = {
  'indexing-identifiers': 'Indexing contact identifiers…',
  'indexing-names': 'Indexing names and supporting fields…',
  'comparing-candidates': 'Comparing likely matches…',
  'grouping-duplicates': 'Grouping related records…',
};

export async function analyzeDuplicatesForReview(
  root: HTMLElement,
  contacts: Contact[],
): Promise<DuplicateAnalysis | undefined> {
  const controller = new AbortController();
  const status = el('div', { class: 'analysis-progress', role: 'status', 'aria-live': 'polite' });
  status.append(el('strong', {}, `Analyzing ${contacts.length.toLocaleString()} contacts`));
  const stage = el('span', {}, 'Preparing local indexes…');
  const cancel = el('button', { type: 'button', class: 'button secondary' }, 'Cancel analysis');
  cancel.addEventListener('click', () => controller.abort());
  status.append(stage, cancel);
  root.replaceChildren(status);
  try {
    const analysis = await analyzeContactDuplicatesAsync(contacts, {
      signal: controller.signal,
      onStage: (value) => {
        stage.textContent = stageLabels[value];
      },
    });
    status.remove();
    return analysis;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      cancel.remove();
      stage.textContent = 'Duplicate analysis cancelled. No contact decisions were changed.';
      return undefined;
    }
    throw error;
  }
}

export function renderDuplicateReview(
  root: HTMLElement,
  contacts: Contact[],
  analysis: DuplicateAnalysis,
  options: DuplicateReviewOptions,
): void {
  let state = emptyResolutionState();
  const toolbar = el('div', { class: 'filter-bar duplicate-filter' });
  // SECURITY: fixed review controls only; contact data is mounted with safe DOM APIs.
  toolbar.innerHTML = `<label>Confidence<select id="duplicate-confidence"><option value="">All confidence levels</option><option value="certain">Certain</option><option value="likely">Likely</option><option value="possible">Possible</option></select></label><label>Status<select id="duplicate-status"><option value="unresolved">Unresolved</option><option value="resolved">Resolved</option><option value="">All groups</option></select></label>`;
  const actions = el('div', { class: 'button-row duplicate-batch-actions' });
  const exactButton = el(
    'button',
    { type: 'button', class: 'button secondary' },
    `Resolve exact duplicates (${analysis.exactDuplicateCopies})`,
  );
  exactButton.disabled = analysis.exactDuplicateCopies === 0;
  const undo = el('button', { type: 'button', class: 'text-button' }, 'Undo last resolution');
  const reset = el('button', { type: 'button', class: 'text-button' }, 'Reset all');
  actions.append(exactButton, undo, reset);
  const live = el('div', {
    class: 'resolution-status',
    role: 'status',
    'aria-live': 'polite',
  });
  const groupRoot = el('div', { class: 'duplicate-groups' });
  const outputSummary = el('p', { class: 'summary-row duplicate-output-summary' });
  const downloadRoot = el('div', { class: 'button-row' });
  root.append(toolbar, actions, live, outputSummary, groupRoot, downloadRoot);

  const updateState = (next: ContactResolutionState, message: string): void => {
    state = next;
    live.textContent = message;
    render();
  };

  const render = (): void => {
    const confidence = qs<HTMLSelectElement>('#duplicate-confidence', toolbar).value as
      DuplicateConfidence | '';
    const status = qs<HTMLSelectElement>('#duplicate-status', toolbar).value;
    const visible = analysis.groups.filter((group) => {
      const resolved = Boolean(state.resolutions[group.id]);
      return (
        (!confidence || group.confidence === confidence) &&
        (!status || (status === 'resolved') === resolved)
      );
    });
    groupRoot.replaceChildren();
    visible
      .slice(0, vcfLimits.maxRenderedDuplicateGroups)
      .forEach((group, index) =>
        groupRoot.append(
          renderGroup(group, index, contacts, state, (resolution, message) =>
            updateState(setContactResolution(state, resolution), message),
          ),
        ),
      );
    if (!visible.length)
      groupRoot.append(
        el('p', { class: 'empty-state' }, 'No duplicate groups match these filters.'),
      );
    if (visible.length > vcfLimits.maxRenderedDuplicateGroups)
      groupRoot.append(
        el(
          'p',
          { class: 'field-help' },
          `Showing the first ${vcfLimits.maxRenderedDuplicateGroups} of ${visible.length.toLocaleString()} matching groups. Refine the filters to review the remainder.`,
        ),
      );
    const output = deriveResolvedContacts(contacts, analysis.groups, state);
    outputSummary.textContent = `${output.length.toLocaleString()} contact${output.length === 1 ? '' : 's'} in current export · ${resolvedGroupCount(state).toLocaleString()} of ${analysis.groups.length.toLocaleString()} group${analysis.groups.length === 1 ? '' : 's'} resolved`;
    undo.disabled = state.history.length === 0;
    reset.disabled = state.history.length === 0;
  };

  toolbar.addEventListener('input', render);
  undo.addEventListener('click', () =>
    updateState(undoLastResolution(state), 'Last resolution undone.'),
  );
  reset.addEventListener('click', () =>
    updateState(resetContactResolutions(), 'All resolutions reset. Original contacts restored.'),
  );
  exactButton.addEventListener('click', () => {
    const existing = actions.querySelector('.exact-confirmation');
    if (existing) return;
    const confirmation = el('div', { class: 'notice warning exact-confirmation' });
    confirmation.append(
      el(
        'p',
        {},
        `${analysis.exactDuplicateCopies.toLocaleString()} semantically identical duplicate copies will be removed. No likely or possible group is included.`,
      ),
    );
    const confirm = el(
      'button',
      { type: 'button', class: 'button primary' },
      'Confirm exact resolution',
    );
    const cancel = el('button', { type: 'button', class: 'text-button' }, 'Cancel');
    confirm.addEventListener('click', () => {
      confirmation.remove();
      updateState(
        resolveExactDuplicateGroups(state, contacts, analysis.groups),
        'Exact duplicate copies resolved. Review remains reversible until download.',
      );
    });
    cancel.addEventListener('click', () => confirmation.remove());
    confirmation.append(confirm, cancel);
    actions.append(confirmation);
  });
  addDownload(downloadRoot, options.downloadLabel, () => {
    const output = deriveResolvedContacts(contacts, analysis.groups, state);
    downloadText(serializeResolvedContacts(output), options.filename, 'text/vcard;charset=utf-8');
  });
  render();
}

function renderGroup(
  group: DuplicateGroup,
  index: number,
  contacts: Contact[],
  state: ContactResolutionState,
  resolve: (
    resolution:
      | { groupId: string; type: 'keep-all' }
      | { groupId: string; type: 'keep-only'; keptContactIds: string[] }
      | {
          groupId: string;
          type: 'merge';
          mergedContactIds: string[];
          selections: ContactMergeSelections;
        },
    message: string,
  ) => void,
): HTMLElement {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const records = group.contactIds
    .map((id) => byId.get(id))
    .filter((contact): contact is Contact => Boolean(contact));
  const disclosure = el('details', {
    class: `duplicate-group confidence-${group.confidence}${state.resolutions[group.id] ? ' resolved' : ''}`,
  });
  const summary = el('summary');
  summary.append(
    el('strong', {}, records.map((contact) => contact.formattedName).join(' / ')),
    el('span', { class: `confidence-label ${group.confidence}` }, confidenceText(group)),
  );
  disclosure.append(summary);
  const reasons = el('ul', { class: 'duplicate-reasons' });
  uniqueReasonLabels(group).forEach((label) => reasons.append(el('li', {}, label)));
  disclosure.append(reasons);
  const comparison = comparisonTable(records, group, index);
  disclosure.append(comparison);
  const controls = el('div', { class: 'button-row duplicate-actions' });
  const keepAll = el('button', { type: 'button', class: 'button secondary' }, 'Keep all');
  const keepSelected = el('button', { type: 'button', class: 'button secondary' }, 'Keep selected');
  const excludeSelected = el(
    'button',
    { type: 'button', class: 'text-button' },
    'Exclude selected',
  );
  const reviewMerge = el('button', { type: 'button', class: 'button primary' }, 'Review merge');
  const selectedIds = (): string[] =>
    [...comparison.querySelectorAll<HTMLInputElement>('input[data-select-contact]:checked')].map(
      (input) => input.value,
    );
  keepAll.addEventListener('click', () =>
    resolve({ groupId: group.id, type: 'keep-all' }, 'All records kept for this group.'),
  );
  keepSelected.addEventListener('click', () => {
    const ids = selectedIds();
    if (!ids.length) return appendError(disclosure, 'Select at least one record to keep.');
    resolve(
      { groupId: group.id, type: 'keep-only', keptContactIds: ids },
      `${ids.length} selected record${ids.length === 1 ? '' : 's'} kept.`,
    );
  });
  excludeSelected.addEventListener('click', () => {
    const excluded = new Set(selectedIds());
    const kept = records
      .filter((contact) => !excluded.has(contact.id))
      .map((contact) => contact.id);
    if (!kept.length)
      return appendError(disclosure, 'At least one record must remain in the group.');
    resolve(
      { groupId: group.id, type: 'keep-only', keptContactIds: kept },
      `${excluded.size} selected record${excluded.size === 1 ? '' : 's'} excluded.`,
    );
  });
  reviewMerge.addEventListener('click', () => {
    const ids = selectedIds();
    if (ids.length < 2) return appendError(disclosure, 'Select at least two records to merge.');
    const selected = records.filter((contact) => ids.includes(contact.id));
    const primaryId = comparison.querySelector<HTMLInputElement>(
      'input[data-primary]:checked',
    )?.value;
    renderMergeEditor(disclosure, selected, group, primaryId, resolve);
  });
  controls.append(keepAll, keepSelected, excludeSelected, reviewMerge);
  disclosure.append(controls);
  if (state.resolutions[group.id])
    disclosure.append(
      el(
        'p',
        { class: 'field-help resolution-label' },
        `Resolved: ${resolutionLabel(state.resolutions[group.id]!.type)}`,
      ),
    );
  return disclosure;
}

function comparisonTable(
  records: Contact[],
  group: DuplicateGroup,
  groupIndex: number,
): HTMLElement {
  const wrapper = el('div', { class: 'table-wrap duplicate-comparison', tabindex: '0' });
  const table = el('table');
  table.append(el('caption', { class: 'sr-only' }, `Duplicate group ${groupIndex + 1}`));
  const head = el('thead');
  const headRow = el('tr');
  headRow.append(el('th', { scope: 'col' }, 'Field'));
  records.forEach((contact, index) => {
    const th = el('th', { scope: 'col' });
    const select = el('input', {
      type: 'checkbox',
      value: contact.id,
      'data-select-contact': 'true',
      'aria-label': `Select record ${index + 1} from ${contact.sourceFile}`,
    });
    select.checked = true;
    const primary = el('input', {
      type: 'radio',
      name: `primary-${groupIndex}`,
      value: contact.id,
      'data-primary': 'true',
    });
    primary.checked = index === suggestedPrimaryIndex(records);
    const primaryLabel = el('label', { class: 'check-line' });
    primaryLabel.append(primary, document.createTextNode(' Use as primary'));
    th.append(
      select,
      el('strong', {}, `Record ${index + 1}`),
      el('small', {}, `${contact.sourceFile} · contact ${contact.originalIndex + 1}`),
      primaryLabel,
    );
    headRow.append(th);
  });
  head.append(headRow);
  const body = el('tbody');
  const rows: [string, (contact: Contact) => string][] = [
    ['Name', (contact) => contact.formattedName],
    ['Email', (contact) => contact.emails.map((item) => typedDisplay(item)).join('\n')],
    ['Phone', (contact) => contact.phones.map((item) => typedDisplay(item)).join('\n')],
    [
      'Organization',
      (contact) => [contact.organization, ...contact.organizationUnits].filter(Boolean).join(' · '),
    ],
    ['Title', (contact) => contact.title],
    ['Address', (contact) => contact.addresses.map((item) => item.formatted).join('\n')],
    ['Birthday', (contact) => contact.birthday],
    ['Notes', (contact) => contact.notes.join('\n\n')],
    ['UID', (contact) => contact.uid],
  ];
  rows.forEach(([label, value]) => {
    const row = el('tr');
    row.append(el('th', { scope: 'row' }, label));
    records.forEach((contact) => row.append(el('td', { class: 'preserve-lines' }, value(contact))));
    body.append(row);
  });
  table.append(head, body);
  wrapper.append(table);
  if (group.candidates.length < (records.length * (records.length - 1)) / 2)
    wrapper.append(
      el(
        'p',
        { class: 'field-help' },
        'This group contains a match chain; not every pair has direct duplicate evidence. Merge only the records you reviewed.',
      ),
    );
  return wrapper;
}

function renderMergeEditor(
  groupRoot: HTMLElement,
  contacts: Contact[],
  group: DuplicateGroup,
  primaryId: string | undefined,
  resolve: Parameters<typeof renderGroup>[4],
): void {
  groupRoot.querySelector('.merge-editor')?.remove();
  const plan = createContactMergePlan(contacts, primaryId);
  const editor = el('section', { class: 'merge-editor', 'aria-label': 'Field merge choices' });
  editor.append(
    el('h4', {}, 'Choose conflicting fields'),
    el(
      'p',
      { class: 'field-help' },
      'Equal values appear once. Missing and compatible repeated values are included automatically. Sources are shown for every conflict.',
    ),
  );
  plan.conflicts.forEach((conflict) => {
    const fieldset = el('fieldset', { 'data-merge-field': conflict.field });
    fieldset.append(el('legend', {}, conflict.label));
    conflict.choices.forEach((choice) => {
      const label = el('label', { class: 'merge-choice' });
      const radio = el('input', {
        type: 'radio',
        name: `merge-${group.id}-${conflict.field}`,
        value: choice.sourceContactId,
      });
      radio.checked = choice.sourceContactId === conflict.defaultSourceContactId;
      label.append(
        radio,
        el('span', {}, choice.value),
        el('small', {}, `${choice.sourceFile} · contact ${choice.originalIndex + 1}`),
      );
      fieldset.append(label);
    });
    editor.append(fieldset);
  });
  if (plan.noteChoices.length > 1) {
    const fieldset = el('fieldset', { 'data-notes-field': 'true' });
    fieldset.append(el('legend', {}, 'Notes'));
    plan.noteChoices.forEach((choice, index) => {
      const label = el('label', { class: 'merge-choice' });
      const radio = el('input', {
        type: 'radio',
        name: `merge-${group.id}-notes`,
        value: choice.sourceContactId,
      });
      radio.checked = index === 0;
      label.append(
        radio,
        el('span', { class: 'preserve-lines' }, choice.value.join('\n\n')),
        el('small', {}, choice.sourceFile),
      );
      fieldset.append(label);
    });
    const combineLabel = el('label', { class: 'merge-choice' });
    combineLabel.append(
      el('input', { type: 'radio', name: `merge-${group.id}-notes`, value: 'combine' }),
      el('span', {}, 'Combine distinct notes'),
    );
    fieldset.append(combineLabel);
    editor.append(fieldset);
  }
  if (!plan.conflicts.length && plan.noteChoices.length <= 1)
    editor.append(
      el(
        'p',
        { class: 'notice' },
        'There are no singular conflicts. Compatible repeated values will be unioned.',
      ),
    );
  if (plan.binaryFieldsOmitted)
    editor.append(
      el(
        'p',
        { class: 'notice warning' },
        `${plan.binaryFieldsOmitted} PHOTO/LOGO field${plan.binaryFieldsOmitted === 1 ? '' : 's'} will be omitted from the normalized merged contact.`,
      ),
    );
  const actions = el('div', { class: 'button-row' });
  const previewButton = el('button', { type: 'button', class: 'button primary' }, 'Preview merge');
  const cancel = el('button', { type: 'button', class: 'text-button' }, 'Cancel');
  cancel.addEventListener('click', () => editor.remove());
  previewButton.addEventListener('click', () => {
    const selections = readSelections(editor, plan.primaryContactId);
    const merged = applyContactMergePlan(contacts, plan, selections);
    editor.querySelector('.merge-preview')?.remove();
    const preview = mergePreview(merged, plan.vendorPropertyCount);
    const apply = el('button', { type: 'button', class: 'button primary' }, 'Apply merge');
    const cancelPreview = el('button', { type: 'button', class: 'text-button' }, 'Cancel preview');
    apply.addEventListener('click', () =>
      resolve(
        {
          groupId: group.id,
          type: 'merge',
          mergedContactIds: contacts.map((contact) => contact.id),
          selections,
        },
        `${contacts.length} records merged. Reset or undo remains available before download.`,
      ),
    );
    cancelPreview.addEventListener('click', () => preview.remove());
    preview.append(apply, cancelPreview);
    editor.append(preview);
  });
  actions.append(previewButton, cancel);
  editor.append(actions);
  groupRoot.append(editor);
  editor.querySelector<HTMLElement>('input, button')?.focus();
}

function readSelections(root: HTMLElement, primaryContactId: string): ContactMergeSelections {
  const singular: Partial<Record<SingularMergeField, string>> = {};
  root.querySelectorAll<HTMLElement>('[data-merge-field]').forEach((fieldset) => {
    const field = fieldset.dataset.mergeField as SingularMergeField;
    const selected = fieldset.querySelector<HTMLInputElement>('input:checked');
    if (selected) singular[field] = selected.value;
  });
  const notes = root.querySelector<HTMLInputElement>('[data-notes-field] input:checked')?.value;
  return {
    primaryContactId,
    singular,
    ...(notes ? { notes } : {}),
  };
}

function mergePreview(contact: Contact, vendorPropertyCount: number): HTMLElement {
  const preview = el('section', { class: 'merge-preview', 'aria-label': 'Result preview' });
  preview.append(el('h4', {}, 'Result preview'));
  const dl = el('dl', { class: 'detail-list' });
  const fields = [
    ['Name', contact.formattedName],
    ['Emails', contact.emails.map((item) => item.value).join('\n')],
    ['Phones', contact.phones.map((item) => item.value).join('\n')],
    ['Organization', contact.organization],
    ['Title', contact.title],
    ['Addresses', contact.addresses.map((item) => item.formatted).join('\n')],
    ['Notes', contact.notes.join('\n\n')],
    ['UID', contact.uid],
    ['Vendor properties', String(vendorPropertyCount)],
  ];
  fields.forEach(([label, value]) =>
    dl.append(el('dt', {}, label), el('dd', { class: 'preserve-lines' }, value)),
  );
  preview.append(dl);
  return preview;
}

function uniqueReasonLabels(group: DuplicateGroup): string[] {
  return [
    ...new Set(
      group.candidates.flatMap((candidate) => candidate.reasons.map((reason) => reason.label)),
    ),
  ];
}

function confidenceText(group: DuplicateGroup): string {
  return group.exact
    ? 'Exact duplicate'
    : `${group.confidence[0]!.toUpperCase()}${group.confidence.slice(1)} duplicate`;
}

function suggestedPrimaryIndex(contacts: Contact[]): number {
  const plan = createContactMergePlan(contacts);
  return Math.max(
    0,
    contacts.findIndex((contact) => contact.id === plan.primaryContactId),
  );
}

function typedDisplay(item: { value: string; types: string[]; preference?: number }): string {
  return `${item.value}${item.types.length ? ` (${item.types.join(', ')})` : ''}${item.preference ? ` · preference ${item.preference}` : ''}`;
}

function appendError(root: HTMLElement, message: string): void {
  root.querySelector('.duplicate-action-error')?.remove();
  root.append(el('p', { class: 'notice error duplicate-action-error', role: 'alert' }, message));
}

function resolutionLabel(type: 'keep-all' | 'keep-only' | 'merge'): string {
  if (type === 'keep-all') return 'keep all';
  if (type === 'keep-only') return 'selected records retained';
  return 'merged';
}
