import {
  analyzeEventTimezones,
  previewTimezoneTransform,
  type TimezoneOperation,
  type TimezoneResultStatus,
  type TimezoneTransformResult,
} from '../../features/ics/timezoneFixer';
import { el, qs } from '../../utils/dom';
import { downloadText, stem } from '../../utils/files';
import { addDownload, showSummary } from '../toolUi';
import { calendarDiagnosticMessages, invalidEventCount, loadCalendars } from './shared';

export async function runIcsTimezone(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadCalendars(files);
  const input = loaded.contents[0]!;
  const parsed = loaded.parsed[0]!;
  const analysis = analyzeEventTimezones(parsed.events, parsed.metadata);
  const action = qs<HTMLSelectElement>('#timezone-action').value as TimezoneOperation;
  const scope = qs<HTMLSelectElement>('#timezone-scope').value;
  const selectedIndexes = new Set<number>();
  const buildPreview = (): TimezoneTransformResult => {
    const scopedIndexes =
      scope === 'floating'
        ? new Set(
            parsed.events
              .map((event, index) => (event.startTime.kind === 'floating' ? index : -1))
              .filter((index) => index >= 0),
          )
        : scope === 'selected'
          ? selectedIndexes
          : undefined;
    return previewTimezoneTransform(parsed.events, parsed.metadata, {
      operation: action,
      sourceTimezone: scope === 'matching' ? qs<HTMLInputElement>('#source-zone').value.trim() : '',
      targetTimezone: qs<HTMLInputElement>('#target-zone').value.trim(),
      ...(scopedIndexes ? { selectedIndexes: scopedIndexes } : {}),
    });
  };
  const preview = buildPreview();

  const render = (activePreview: TimezoneTransformResult): void => {
    showSummary(
      result,
      action === 'inspect' ? 'Timezone inspection' : 'Timezone change preview',
      [
        `${analysis.total} readable events`,
        `${analysis.utc} UTC`,
        `${analysis.zoned} named-zone`,
        `${analysis.floating} floating`,
        `${analysis.allDay} all-day`,
        `${analysis.unknown} unknown timezone values`,
        `${analysis.ambiguous} ambiguous local values`,
        `${analysis.nonexistent} nonexistent local values`,
        `${analysis.vtimezones} embedded VTIMEZONE definitions`,
        `${invalidEventCount(loaded.diagnostics)} unreadable events`,
      ],
      calendarDiagnosticMessages(loaded.diagnostics),
    );
    result.append(zoneCounts(analysis.identifiers));
    if (action !== 'inspect') {
      result.append(
        el(
          'div',
          { class: 'notice', role: 'status' },
          `${activePreview.changed} changed · ${activePreview.blocked} blocked · ${activePreview.warnings} require review`,
        ),
      );
    }
    result.append(
      renderPreviewTable(activePreview, selectedIndexes, () => render(buildPreview()), scope),
    );
    if (action !== 'inspect') {
      const reset = el('button', { type: 'button', class: 'button secondary' }, 'Reset changes');
      reset.addEventListener('click', () => {
        const resetPreview = previewTimezoneTransform(parsed.events, parsed.metadata, {
          operation: 'inspect',
        });
        render(resetPreview);
      });
      result.append(reset);
      if (activePreview.changed)
        addDownload(result, 'Download corrected ICS', () =>
          downloadText(
            activePreview.content,
            `${stem(input.name)}-timezone-fixed.ics`,
            'text/calendar;charset=utf-8',
          ),
        );
    }
    appendTimezoneGlossary(result);
  };
  render(preview);
}

function zoneCounts(identifiers: Record<string, number>): HTMLElement {
  const section = el('section');
  section.append(el('h3', {}, 'Timezone identifiers'));
  const list = el('ul', { class: 'compact-list' });
  Object.entries(identifiers).forEach(([zone, count]) =>
    list.append(el('li', {}, `${zone}: ${count}`)),
  );
  section.append(list);
  return section;
}

function renderPreviewTable(
  preview: TimezoneTransformResult,
  selectedIndexes: Set<number>,
  previewSelected: () => void,
  scope: string,
): HTMLElement {
  const section = el('section');
  section.append(el('h2', {}, 'Event preview'));
  const toolbar = el('div', { class: 'filter-bar' });
  const label = el('label', {}, 'Show result');
  const select = el('select');
  ['all', 'changed', 'unchanged', 'warning', 'blocked'].forEach((value) => {
    const option = el('option', { value }, value === 'all' ? 'All results' : capitalize(value));
    select.append(option);
  });
  label.append(select);
  toolbar.append(label);
  if (scope === 'selected') {
    const apply = el(
      'button',
      { type: 'button', class: 'button secondary' },
      'Preview selected events',
    );
    apply.addEventListener('click', previewSelected);
    toolbar.append(apply);
  }
  section.append(toolbar);
  const wrap = el('div', { class: 'table-wrap calendar-table' });
  const table = el('table');
  table.append(el('caption', { class: 'sr-only' }, 'Timezone change preview'));
  const head = el('thead');
  const header = el('tr');
  ['Select', 'Event', 'Original start / zone', 'New start / zone', 'Result'].forEach((text) =>
    header.append(el('th', { scope: 'col' }, text)),
  );
  head.append(header);
  const body = el('tbody');
  const renderRows = (filter: string): void => {
    body.replaceChildren();
    preview.rows
      .filter((row) => filter === 'all' || row.result === filter)
      .forEach((item) => {
        const row = el('tr');
        const selectCell = el('td');
        const checkbox = el('input', {
          type: 'checkbox',
          'aria-label': `Select ${item.event}`,
        });
        checkbox.checked = selectedIndexes.has(item.eventIndex);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedIndexes.add(item.eventIndex);
          else selectedIndexes.delete(item.eventIndex);
        });
        selectCell.append(checkbox);
        row.append(
          selectCell,
          el('td', {}, item.event),
          el('td', {}, `${item.originalStart} · ${item.originalZone}`),
          el('td', {}, `${item.newStart} · ${item.newZone}`),
          el('td', {}, `${capitalize(item.result)} — ${item.message}`),
        );
        body.append(row);
      });
  };
  select.addEventListener('change', () => renderRows(select.value));
  renderRows('all');
  table.append(head, body);
  wrap.append(table);
  section.append(wrap);
  return section;
}

function appendTimezoneGlossary(root: HTMLElement): void {
  const section = el('section', { class: 'glossary' });
  section.append(el('h2', {}, 'Timezone terms'));
  const definitions: [string, string][] = [
    [
      'Floating time',
      'A wall-clock value with no timezone or UTC marker. It has no safe instant until you assign a zone.',
    ],
    ['UTC', 'An absolute reference time marked by a trailing Z.'],
    [
      'TZID',
      'A named timezone attached to a local date-time. Browser IANA data resolves recognized names.',
    ],
    ['All-day event', 'A calendar date, not a clock time. It is never shifted here.'],
    ['Convert timezone', 'Keeps a known instant and changes the wall-clock representation.'],
    [
      'Assign timezone',
      'Keeps a floating wall-clock value and gives it a timezone, creating an instant.',
    ],
  ];
  const list = el('dl');
  definitions.forEach(([term, definition]) =>
    list.append(el('dt', {}, term), el('dd', {}, definition)),
  );
  section.append(list);
  root.append(section);
}

function capitalize(value: TimezoneResultStatus | string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
