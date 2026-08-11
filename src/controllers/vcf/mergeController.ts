import { combineOriginalContacts } from '../../features/vcf/merge';
import { downloadText } from '../../utils/files';
import { addDownload, showSummary } from '../toolUi';
import { analyzeDuplicatesForReview, renderDuplicateReview } from './reviewController';
import { loadContacts, vcfDiagnosticMessages } from './shared';

export async function runVcfMerge(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadContacts(files);
  const analysis = await analyzeDuplicatesForReview(result, loaded.contacts);
  if (!analysis) return;
  showSummary(
    result,
    'Contact files combined',
    [
      `${files.length.toLocaleString()} files`,
      `${loaded.contacts.length.toLocaleString()} readable contacts`,
      `${loaded.skippedContacts.toLocaleString()} malformed contacts skipped`,
      `${analysis.groups.length.toLocaleString()} possible duplicate groups`,
      `${loaded.contacts.length.toLocaleString()} contacts before optional deduplication`,
    ],
    vcfDiagnosticMessages(loaded.diagnostics).concat(
      analysis.diagnostics.map((diagnostic) => diagnostic.message),
    ),
  );
  const originalDownload = document.createElement('div');
  originalDownload.className = 'button-row';
  addDownload(originalDownload, 'Download combined VCF without deduplication', () =>
    downloadText(
      combineOriginalContacts(loaded.contacts),
      'merged-contacts.vcf',
      'text/vcard;charset=utf-8',
    ),
  );
  originalDownload.append(
    Object.assign(document.createElement('p'), {
      className: 'field-help',
      textContent:
        'This preserves every readable original vCard record and its source version. Malformed records listed above are omitted; duplicate review below is optional.',
    }),
  );
  result.append(originalDownload);
  if (analysis.groups.length) {
    result.append(
      Object.assign(document.createElement('h3'), { textContent: 'Optional duplicate review' }),
    );
    renderDuplicateReview(result, loaded.contacts, analysis, {
      downloadLabel: 'Download reviewed normalized VCF',
      filename: 'merged-reviewed-contacts.vcf',
    });
  }
}
