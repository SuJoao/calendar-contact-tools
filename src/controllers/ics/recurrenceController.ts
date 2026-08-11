import { renderDataTable } from '../../components/DataTable';
import { calendarLimits } from '../../config/calendar';
import { siteConfig } from '../../config/site';
import { diagnosticMessages } from '../../features/ics/diagnostics';
import {
  analyzeRecurrence,
  recurrenceCsvColumns,
  type ExpandedOccurrence,
  type RecurrenceSeries,
} from '../../features/ics/recurrence';
import { expandRecurrencesAsync } from '../../features/ics/workers/client';
import { toCsv } from '../../utils/csv';
import { el, qs } from '../../utils/dom';
import { downloadText, stem } from '../../utils/files';
import { addDownload, showSummary } from '../toolUi';
import { calendarDiagnosticMessages, invalidEventCount, loadCalendars } from './shared';

let activeExpansion: AbortController | undefined;
let expansionGeneration = 0;

export async function runIcsRecurrence(files: File[], result: HTMLElement): Promise<void> {
  activeExpansion?.abort();
  bindQuickRanges();
  const loaded = await loadCalendars(files);
  const analysis = analyzeRecurrence(loaded.events);
  showSummary(
    result,
    'Recurring events summary',
    [
      `${loaded.events.length} readable events`,
      `${analysis.recurringSeries} recurring series`,
      `${analysis.seriesWithExclusions} series with exclusions`,
      `${analysis.seriesWithAdditions} series with RDATE additions`,
      `${analysis.seriesWithOverrides} series with modified occurrences`,
      `${analysis.unsupportedSeries} series with unsupported behavior`,
      `${invalidEventCount(loaded.diagnostics)} unreadable events`,
    ],
    [
      ...calendarDiagnosticMessages(loaded.diagnostics),
      ...diagnosticMessages(analysis.diagnostics),
    ],
  );
  if (!analysis.series.length) {
    result.append(el('p', { class: 'empty-state' }, 'No expandable recurrence series were found.'));
    return;
  }

  const inspector = el('section', { class: 'recurrence-inspector' });
  inspector.append(el('h2', {}, 'Select a recurrence series'));
  const seriesLabel = el('label', {}, 'Series');
  const seriesSelect = el('select', { id: 'recurrence-series' });
  analysis.series.forEach((series) =>
    seriesSelect.append(
      el('option', { value: series.id }, `${series.master.title} — ${series.uid || 'No UID'}`),
    ),
  );
  seriesLabel.append(seriesSelect);
  const definition = el('div', { class: 'recurrence-definition' });
  const expansionRoot = el('section', { 'aria-live': 'polite' });
  const controls = el('div', { class: 'button-row' });
  const expandButton = el(
    'button',
    { type: 'button', class: 'button primary', id: 'expand-recurrence' },
    'Expand selected series',
  );
  const cancelButton = el(
    'button',
    {
      type: 'button',
      class: 'button secondary',
      id: 'cancel-recurrence-expansion',
      hidden: '',
    },
    'Cancel expansion',
  );
  controls.append(expandButton, cancelButton);
  inspector.append(seriesLabel, definition, controls, expansionRoot);
  result.append(inspector);

  const selectedSeries = (): RecurrenceSeries =>
    analysis.series.find((series) => series.id === seriesSelect.value) ?? analysis.series[0]!;
  const renderDefinition = (): void => {
    const series = selectedSeries();
    definition.replaceChildren(
      el('h3', {}, series.description),
      el('p', { class: 'field-help' }, 'Raw RRULE'),
      el('pre', {}, series.definition.rrule ?? '(No RRULE; recurrence uses RDATE or overrides)'),
      el(
        'p',
        { class: 'field-help' },
        `${series.definition.exdates.length} EXDATE · ${series.definition.rdates.length} RDATE · ${series.definition.overrides.length} override records`,
      ),
    );
    if (series.diagnostics.length) {
      const notice = el('div', { class: 'notice warning' });
      notice.append(el('strong', {}, 'Series diagnostics'));
      const list = el('ul');
      diagnosticMessages(series.diagnostics).forEach((message) =>
        list.append(el('li', {}, message)),
      );
      notice.append(list);
      definition.append(notice);
    }
    expansionRoot.replaceChildren();
  };
  seriesSelect.addEventListener('change', renderDefinition);
  renderDefinition();

  cancelButton.addEventListener('click', () => activeExpansion?.abort());
  expandButton.addEventListener('click', async () => {
    activeExpansion?.abort();
    activeExpansion = new AbortController();
    const generation = ++expansionGeneration;
    expandButton.disabled = true;
    cancelButton.hidden = false;
    expansionRoot.replaceChildren(el('p', { role: 'status' }, 'Expanding recurrence locally…'));
    try {
      const limit = Math.min(
        siteConfig.maxRecurrenceOccurrences,
        Math.max(1, Number(qs<HTMLInputElement>('#occurrence-limit').value)),
      );
      const expansion = await expandRecurrencesAsync(
        {
          events: loaded.events,
          rangeStart: qs<HTMLInputElement>('#range-from').value,
          rangeEnd: qs<HTMLInputElement>('#range-to').value,
          seriesIds: [selectedSeries().id],
          limits: {
            maxOccurrencesPerSeries: limit,
            maxTotalOccurrences: calendarLimits.maxTotalOccurrences,
            maxRangeDays: calendarLimits.maxExpansionRangeDays,
          },
        },
        { signal: activeExpansion.signal },
      );
      if (generation !== expansionGeneration) return;
      renderExpansion(
        expansionRoot,
        expansion.occurrences,
        expansion.cancelledOccurrences,
        expansion.diagnostics,
        expansion.truncated,
        stem(loaded.contents[0]!.name),
      );
    } catch (error) {
      if (generation !== expansionGeneration) return;
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Expansion cancelled. You can adjust the range and try again.'
          : error instanceof Error
            ? error.message
            : 'The recurrence could not be expanded.';
      expansionRoot.replaceChildren(
        el('div', { class: 'notice warning', role: 'status' }, message),
      );
    } finally {
      if (generation === expansionGeneration) {
        expandButton.disabled = false;
        cancelButton.hidden = true;
      }
    }
  });
}

function renderExpansion(
  root: HTMLElement,
  occurrences: ExpandedOccurrence[],
  cancelled: ExpandedOccurrence[],
  diagnostics: Parameters<typeof diagnosticMessages>[0],
  truncated: boolean,
  filenameStem: string,
): void {
  root.replaceChildren();
  root.append(
    el('h2', {}, 'Occurrence results'),
    el(
      'div',
      { class: truncated ? 'notice warning' : 'summary-row', role: 'status' },
      `${occurrences.length} active occurrences · ${cancelled.length} cancelled occurrences${truncated ? ' · Expansion stopped at a safety limit.' : ''}`,
    ),
  );
  if (diagnostics.length) {
    const notice = el('div', { class: 'notice warning' });
    notice.append(el('strong', {}, 'Expansion diagnostics'));
    const list = el('ul');
    diagnosticMessages(diagnostics).forEach((message) => list.append(el('li', {}, message)));
    notice.append(list);
    root.append(notice);
  }
  const filterBar = el('div', { class: 'filter-bar' });
  const filterLabel = el('label', {}, 'Show');
  const filter = el('select');
  [
    ['all', 'All active occurrences'],
    ['modified', 'Modified'],
    ['rdate', 'RDATE'],
    ['warnings', 'Warnings'],
    ['cancelled', 'Cancelled'],
  ].forEach(([value, text]) => filter.append(el('option', { value: value! }, text)));
  filterLabel.append(filter);
  filterBar.append(filterLabel);
  root.append(filterBar);
  const tableRoot = el('div', { class: 'calendar-table' });
  root.append(tableRoot);
  const renderRows = (): void => {
    const rows = filterOccurrences(occurrences, cancelled, filter.value);
    const visible = rows.slice(0, calendarLimits.maxRenderedRows);
    renderDataTable(
      tableRoot,
      visible,
      [
        ['title', 'Event'],
        ['occurrence_start', 'Occurrence start'],
        ['occurrence_end', 'Occurrence end'],
        ['timezone', 'Timezone'],
        ['occurrence_source', 'Source'],
        ['status', 'Status'],
      ].map(([key, label]) => ({ key: key!, label: label! })),
      'No occurrences match this filter.',
    );
    if (rows.length > visible.length)
      tableRoot.append(
        el(
          'p',
          { class: 'field-help' },
          `Showing the first ${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} results. The CSV includes every bounded result.`,
        ),
      );
  };
  filter.addEventListener('change', renderRows);
  renderRows();
  const csvRows = [...occurrences, ...cancelled];
  addDownload(root, 'Download occurrences CSV', () =>
    downloadText(
      toCsv(csvRows, [...recurrenceCsvColumns]),
      `${filenameStem}-recurring-events.csv`,
      'text/csv;charset=utf-8',
    ),
  );
}

function filterOccurrences(
  occurrences: ExpandedOccurrence[],
  cancelled: ExpandedOccurrence[],
  filter: string,
): ExpandedOccurrence[] {
  if (filter === 'cancelled') return cancelled;
  if (filter === 'modified') return occurrences.filter((item) => item.modified);
  if (filter === 'rdate') return occurrences.filter((item) => item.occurrence_source === 'rdate');
  if (filter === 'warnings') return occurrences.filter((item) => item.diagnostics.length);
  return occurrences;
}

function bindQuickRanges(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-range-days]').forEach((button) => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => {
      const startInput = qs<HTMLInputElement>('#range-from');
      const endInput = qs<HTMLInputElement>('#range-to');
      const start = new Date(`${startInput.value}T00:00:00Z`);
      if (Number.isNaN(start.getTime())) return;
      start.setUTCDate(start.getUTCDate() + Number(button.dataset.rangeDays ?? 0));
      endInput.value = start.toISOString().slice(0, 10);
    });
  });
}
