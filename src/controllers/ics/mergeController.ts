import { diagnosticMessages } from '../../features/ics/diagnostics';
import { calendarLimits } from '../../config/calendar';
import { serializeMerge } from '../../features/ics/merge';
import { analyzeCalendarMergeInputs } from '../../features/ics/workers/client';
import { el } from '../../utils/dom';
import { downloadText } from '../../utils/files';
import { addDownload, showSummary } from '../toolUi';
import { loadCalendarContents } from './shared';

export async function runIcsMerge(files: File[], result: HTMLElement): Promise<void> {
  const contents = await loadCalendarContents(files);
  const analysis = await analyzeCalendarMergeInputs(contents);
  const excluded = new Set<number>();
  const candidateSelection = new Set<number>();
  let candidatePage = 0;

  const renderStatus = (): void => {
    const warnings = diagnosticMessages(
      analysis.diagnostics.filter(
        (diagnostic) => !['DUPLICATE_UID', 'DUPLICATE_CANDIDATE'].includes(diagnostic.code),
      ),
    );
    showSummary(
      result,
      'Merge preview ready',
      [
        `${analysis.sourceCount} source calendars`,
        `${analysis.events.length} readable events`,
        `${analysis.candidates.length} duplicate candidates`,
        `${analysis.events.length - excluded.size} events included`,
        `${analysis.timezoneDefinitions} timezone definitions`,
        `${analysis.malformed} malformed events or boundaries`,
      ],
      warnings,
    );
    if (analysis.candidates.length)
      result.append(
        renderDuplicateReview(
          analysis.events,
          analysis.candidates,
          excluded,
          candidateSelection,
          candidatePage,
          (page) => {
            candidatePage = page;
            renderStatus();
          },
          renderStatus,
        ),
      );
    else result.append(el('p', { class: 'field-help' }, 'No duplicate candidates were detected.'));
    addDownload(result, 'Download merged ICS', () =>
      downloadText(
        serializeMerge(analysis, excluded),
        'merged-calendar.ics',
        'text/calendar;charset=utf-8',
      ),
    );
  };
  renderStatus();
}

function renderDuplicateReview(
  events: Parameters<typeof serializeMerge>[0]['events'],
  candidates: Parameters<typeof serializeMerge>[0]['candidates'],
  excluded: Set<number>,
  selected: Set<number>,
  page: number,
  setPage: (page: number) => void,
  rerender: () => void,
): HTMLElement {
  const section = el('section', { class: 'duplicate-review' });
  section.append(
    el('h2', {}, 'Duplicate review'),
    el(
      'p',
      { class: 'field-help' },
      'Confidence is evidence for review, not an automatic deletion decision. Recurrence masters and different RECURRENCE-ID overrides are kept distinct.',
    ),
  );
  const toolbar = el('div', { class: 'filter-bar button-row' });
  const excludeButton = el(
    'button',
    { type: 'button', class: 'button secondary' },
    'Exclude selected',
  );
  excludeButton.addEventListener('click', () => {
    selected.forEach((index) => excluded.add(index));
    selected.clear();
    rerender();
  });
  const keepAll = el(
    'button',
    { type: 'button', class: 'button secondary' },
    'Keep all duplicates',
  );
  keepAll.addEventListener('click', () => {
    excluded.clear();
    selected.clear();
    rerender();
  });
  toolbar.append(excludeButton, keepAll);
  const pageSize = calendarLimits.maxPreviewRows;
  const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  if (pageCount > 1) {
    const previous = actionButton('Previous candidates', () => setPage(Math.max(0, safePage - 1)));
    previous.disabled = safePage === 0;
    const next = actionButton('Next candidates', () =>
      setPage(Math.min(pageCount - 1, safePage + 1)),
    );
    next.disabled = safePage === pageCount - 1;
    toolbar.append(
      el(
        'span',
        {},
        `Candidates ${safePage * pageSize + 1}–${Math.min(candidates.length, (safePage + 1) * pageSize)} of ${candidates.length}`,
      ),
      previous,
      next,
    );
  }
  section.append(toolbar);

  const wrap = el('div', { class: 'table-wrap calendar-table' });
  const table = el('table');
  table.append(el('caption', { class: 'sr-only' }, 'Calendar duplicate candidates'));
  const head = el('thead');
  const headerRow = el('tr');
  [
    'Select copy',
    'Confidence',
    'First event',
    'Second event',
    'Why it matched',
    'Decision',
  ].forEach((heading) => headerRow.append(el('th', { scope: 'col' }, heading)));
  head.append(headerRow);
  const body = el('tbody');
  candidates
    .slice(safePage * pageSize, (safePage + 1) * pageSize)
    .forEach((candidate, visibleIndex) => {
      const candidateIndex = safePage * pageSize + visibleIndex;
      const first = events[candidate.eventA]!;
      const second = events[candidate.eventB]!;
      const row = el('tr');
      const selectionCell = el('td');
      const checkbox = el('input', {
        type: 'checkbox',
        'aria-label': `Select second copy of ${second.title}`,
      });
      checkbox.checked = selected.has(candidate.eventB);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(candidate.eventB);
        else selected.delete(candidate.eventB);
      });
      selectionCell.append(checkbox);
      row.append(
        selectionCell,
        el('td', {}, candidate.confidence),
        eventCell(first, excluded.has(candidate.eventA)),
        eventCell(second, excluded.has(candidate.eventB)),
        el('td', {}, candidate.reasons.join('; ')),
      );
      const actions = el('td', { class: 'button-row' });
      actions.append(
        actionButton('Keep both', () => {
          excluded.delete(candidate.eventA);
          excluded.delete(candidate.eventB);
          rerender();
        }),
        actionButton('Keep first', () => {
          excluded.delete(candidate.eventA);
          excluded.add(candidate.eventB);
          rerender();
        }),
        actionButton('Keep second', () => {
          excluded.add(candidate.eventA);
          excluded.delete(candidate.eventB);
          rerender();
        }),
      );
      if (candidate.exact)
        actions.append(
          actionButton(
            'Remove exact copy',
            () => {
              excluded.add(candidate.eventB);
              rerender();
            },
            `Remove exact copy ${candidateIndex + 1}`,
          ),
        );
      row.append(actions);
      body.append(row);
    });
  table.append(head, body);
  wrap.append(table);
  section.append(wrap);
  return section;
}

function eventCell(
  event: { title: string; startTime: { value: string }; sourceFile: string },
  excluded: boolean,
): HTMLTableCellElement {
  const cell = el('td');
  cell.append(
    el('strong', {}, event.title),
    el('br'),
    document.createTextNode(
      `${event.startTime.value} · ${event.sourceFile}${excluded ? ' · Excluded' : ''}`,
    ),
  );
  return cell;
}

function actionButton(text: string, action: () => void, ariaLabel?: string): HTMLButtonElement {
  const button = el(
    'button',
    {
      type: 'button',
      class: 'button secondary',
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
    },
    text,
  );
  button.addEventListener('click', action);
  return button;
}
