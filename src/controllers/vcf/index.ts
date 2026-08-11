import { contactCsvColumns } from '../../features/vcf/csv';
import { label } from '../toolUi';

export function vcfOptionsMarkup(path: string): string {
  if (path === '/vcf-to-csv') {
    const primary = contactCsvColumns.slice(0, 12);
    const technical = contactCsvColumns.slice(12);
    return `<fieldset><legend>Export columns</legend><div class="check-grid">${checkboxes(primary)}</div></fieldset><details class="option-details"><summary>Technical fields</summary><div class="check-grid">${checkboxes(technical)}</div></details><label>Repeated fields<select id="vcf-csv-mode"><option value="combined">One contact per row, combined with |</option><option value="expanded">Long format, one repeated value per row</option></select></label><p class="field-help">Expanded mode adds repeated_field, repeated_value, repeated_types, and repeated_preference columns. CSV downloads include a UTF-8 BOM for spreadsheet compatibility.</p>`;
  }
  if (path === '/vcf-duplicate-remover')
    return `<div class="notice"><strong>No contact is removed automatically.</strong> Indexed UID, email, phone, name, address, organization, and birthday signals produce explainable candidates. Review and resolve each group before exporting.</div>`;
  if (path === '/vcf-merge')
    return `<div class="notice"><strong>Combining is the default.</strong> Every readable contact remains in the direct combined download. Duplicate detection is advisory and its review workflow is optional.</div>`;
  return '';
}

export async function runVcfController(
  path: string,
  files: File[],
  result: HTMLElement,
): Promise<void> {
  if (path === '/vcf-viewer') {
    const { runVcfViewer } = await import('./viewerController');
    return runVcfViewer(files, result);
  }
  if (path === '/vcf-to-csv') {
    const { runVcfToCsv } = await import('./csvController');
    return runVcfToCsv(files, result);
  }
  if (path === '/vcf-merge') {
    const { runVcfMerge } = await import('./mergeController');
    return runVcfMerge(files, result);
  }
  if (path === '/vcf-duplicate-remover') {
    const { runVcfDuplicateReview } = await import('./duplicateController');
    return runVcfDuplicateReview(files, result);
  }
  throw new Error('Unknown VCF tool route.');
}

function checkboxes(columns: readonly string[]): string {
  return columns
    .map(
      (column) =>
        `<label><input type="checkbox" name="column" value="${column}" checked /> ${label(column)}</label>`,
    )
    .join('');
}
