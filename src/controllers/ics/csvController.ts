import { renderDataTable } from '../../components/DataTable';
import { calendarEventToCsvRow } from '../../features/ics/csv';
import { calendarLimits } from '../../config/calendar';
import { toCsv } from '../../utils/csv';
import { el, qs } from '../../utils/dom';
import { downloadText, stem } from '../../utils/files';
import { addDownload, label, selectedColumns, showSummary } from '../toolUi';
import { calendarDiagnosticMessages, invalidEventCount, loadCalendars } from './shared';

export async function runIcsToCsv(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadCalendars(files);
  const columns = selectedColumns();
  const options = {
    dateFormat: qs<HTMLSelectElement>('#date-format').value as 'iso' | 'locale',
    timezoneOutput: qs<HTMLSelectElement>('#timezone-output').value as 'original' | 'utc' | 'local',
  };
  const rows = loaded.events.map((event) => calendarEventToCsvRow(event, options));
  showSummary(
    result,
    'CSV preview',
    [
      `${loaded.events.length} events`,
      `${invalidEventCount(loaded.diagnostics)} events skipped`,
      `${columns.length} columns`,
    ],
    calendarDiagnosticMessages(loaded.diagnostics),
  );
  const tableRoot = el('div');
  result.append(tableRoot);
  renderDataTable(
    tableRoot,
    rows.slice(0, calendarLimits.maxPreviewRows),
    columns.map((key) => ({ key, label: label(key) })),
  );
  addDownload(result, 'Download CSV', () =>
    downloadText(
      toCsv(rows, columns),
      files.length === 1 ? `${stem(files[0]!.name)}.csv` : 'combined-calendars.csv',
      'text/csv;charset=utf-8',
    ),
  );
}
