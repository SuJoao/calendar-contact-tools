import { renderDataTable } from '../../components/DataTable';
import { vcfLimits } from '../../config/vcf';
import { contactCsv, type ContactCsvMode } from '../../features/vcf/csv';
import { el, qs } from '../../utils/dom';
import { downloadText, stem } from '../../utils/files';
import { addDownload, label, selectedColumns, showSummary } from '../toolUi';
import { loadContacts, vcfDiagnosticMessages } from './shared';

export async function runVcfToCsv(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadContacts(files);
  const columns = selectedColumns();
  const mode = qs<HTMLSelectElement>('#vcf-csv-mode').value as ContactCsvMode;
  const output = contactCsv(loaded.contacts, { mode, columns });
  showSummary(
    result,
    'CSV preview',
    [
      `${loaded.contacts.length.toLocaleString()} contacts`,
      `${output.rows.length.toLocaleString()} output rows`,
      `${loaded.skippedContacts.toLocaleString()} contacts skipped`,
    ],
    vcfDiagnosticMessages(loaded.diagnostics),
  );
  const tableRoot = el('div', { class: 'contact-table' });
  result.append(tableRoot);
  renderDataTable(
    tableRoot,
    output.rows.slice(0, vcfLimits.maxPreviewRows),
    output.columns.map((key) => ({ key, label: label(key) })),
  );
  if (output.rows.length > vcfLimits.maxPreviewRows)
    result.append(
      el(
        'p',
        { class: 'field-help' },
        `Previewing the first ${vcfLimits.maxPreviewRows.toLocaleString()} of ${output.rows.length.toLocaleString()} output rows. The download contains every bounded row.`,
      ),
    );
  result.append(
    el(
      'p',
      { class: 'field-help' },
      'Spreadsheet protection is applied only to the exported representation. Dangerous free-text formula prefixes are escaped; international phone numbers keep their leading +.',
    ),
  );
  addDownload(result, 'Download CSV', () =>
    downloadText(
      output.csv,
      files.length === 1 ? `${stem(files[0]!.name)}.csv` : 'combined-contacts.csv',
      'text/csv;charset=utf-8',
    ),
  );
}
