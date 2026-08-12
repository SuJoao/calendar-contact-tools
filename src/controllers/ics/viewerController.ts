import { renderDataTable } from '../../components/DataTable';
import { calendarLimits } from '../../config/calendar';
import { calendarEventToCsvRow, calendarCsvColumns } from '../../features/ics/csv';
import type { CalendarEvent } from '../../features/ics/model';
import { toCsv } from '../../utils/csv';
import { el, qs } from '../../utils/dom';
import { downloadText } from '../../utils/files';
import { addDownload, label, showSummary } from '../toolUi';
import { calendarDiagnosticMessages, invalidEventCount, loadCalendars } from './shared';

export async function runIcsViewer(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadCalendars(files);
  showSummary(
    result,
    'Calendar events',
    [
      `${loaded.events.length} events loaded`,
      `${invalidEventCount(loaded.diagnostics)} events could not be parsed`,
    ],
    calendarDiagnosticMessages(loaded.diagnostics),
  );
  renderViewer(result, loaded.events);
}

function renderViewer(result: HTMLElement, events: CalendarEvent[]): void {
  const controls = el('div', { class: 'filter-bar' });
  // SECURITY: fixed controls only; parsed event values are rendered by DataTable.
  controls.innerHTML = `<label>Search<input id="event-search" type="search" placeholder="Title, location, description" /></label><label>Sort<select id="event-sort"><option value="start">Start time</option><option value="title">Title</option></select></label><label>From<input id="event-from" type="date" /></label><label>Timezone<select id="event-zone"><option value="">All timezones</option></select></label><label>Recurrence<select id="event-recurring"><option value="">All events</option><option value="yes">Recurring</option><option value="no">Non-recurring</option></select></label>`;
  const zoneSelect = qs<HTMLSelectElement>('#event-zone', controls);
  [...new Set(events.map((event) => event.timezone))].forEach((zone) =>
    zoneSelect.add(new Option(zone, zone)),
  );
  const tableRoot = el('div', { class: 'calendar-table' });
  result.append(controls, tableRoot);
  let displayed = [...events];
  const render = (): void => {
    const query = qs<HTMLInputElement>('#event-search', controls).value.toLocaleLowerCase();
    const from = qs<HTMLInputElement>('#event-from', controls).value;
    const zone = zoneSelect.value;
    const recurring = qs<HTMLSelectElement>('#event-recurring', controls).value;
    displayed = events
      .filter((event) =>
        [event.title, event.location, event.description, event.organizer, event.attendees]
          .flat()
          .join(' ')
          .toLocaleLowerCase()
          .includes(query),
      )
      .filter((event) => !from || event.startTime.value.slice(0, 10) >= from)
      .filter((event) => !zone || event.timezone === zone)
      .filter((event) => !recurring || (recurring === 'yes') === Boolean(event.rrule));
    const sort = qs<HTMLSelectElement>('#event-sort', controls).value;
    displayed.sort((a, b) =>
      (sort === 'title' ? a.title : a.startTime.value).localeCompare(
        sort === 'title' ? b.title : b.startTime.value,
      ),
    );
    renderDataTable(
      tableRoot,
      displayed.slice(0, calendarLimits.maxRenderedRows).map(viewerRow),
      [
        'title',
        'start',
        'end',
        'time_kind',
        'timezone',
        'all_day',
        'recurring',
        'location',
        'organizer',
        'attendees',
        'status',
        'uid',
      ].map((key) => ({ key, label: label(key) })),
    );
    if (displayed.length > calendarLimits.maxRenderedRows)
      tableRoot.append(
        el(
          'p',
          { class: 'field-help' },
          `Showing the first ${calendarLimits.maxRenderedRows.toLocaleString()} matching events. Refine the filters to inspect the remainder; exports include every match.`,
        ),
      );
  };
  controls.addEventListener('input', render);
  render();
  addDownload(result, 'Download displayed CSV', () =>
    downloadText(
      toCsv(
        displayed.map((event) => calendarEventToCsvRow(event)),
        [...calendarCsvColumns],
      ),
      'displayed-events.csv',
      'text/csv;charset=utf-8',
    ),
  );
  const details = el('details');
  details.append(
    el('summary', {}, 'Raw event details'),
    el('pre', {}, events.map((event) => event.raw).join('\n\n')),
  );
  result.append(details);
}

function viewerRow(event: CalendarEvent): Record<string, unknown> {
  return {
    title: event.title,
    start: event.startTime.value,
    end: event.endTime?.value ?? '',
    time_kind: timeKindLabel(event),
    timezone: event.timezone,
    all_day: event.allDay,
    recurring: Boolean(event.rrule),
    location: event.location,
    organizer: event.organizer,
    attendees: event.attendees.join('; '),
    status: event.status,
    uid: event.uid,
  };
}

function timeKindLabel(event: CalendarEvent): string {
  if (event.timeKind === 'floating') return 'Floating time';
  if (event.timeKind === 'date') return 'Date only';
  if (event.timeKind === 'zoned') return 'Named timezone';
  return 'UTC';
}
