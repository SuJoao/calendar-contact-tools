import { showSummary } from '../toolUi';
import { analyzeDuplicatesForReview, renderDuplicateReview } from './reviewController';
import { loadContacts, vcfDiagnosticMessages } from './shared';

export async function runVcfDuplicateReview(files: File[], result: HTMLElement): Promise<void> {
  const loaded = await loadContacts(files);
  const analysis = await analyzeDuplicatesForReview(result, loaded.contacts);
  if (!analysis) return;
  const certain = analysis.groups.filter((group) => group.confidence === 'certain').length;
  const likely = analysis.groups.filter((group) => group.confidence === 'likely').length;
  const possible = analysis.groups.filter((group) => group.confidence === 'possible').length;
  const minimum =
    loaded.contacts.length -
    analysis.groups.reduce((total, group) => total + group.contactIds.length - 1, 0);
  showSummary(
    result,
    'Duplicate review',
    [
      `${loaded.contacts.length.toLocaleString()} contacts`,
      `${analysis.candidates.length.toLocaleString()} candidate pairs`,
      `${certain.toLocaleString()} certain groups`,
      `${likely.toLocaleString()} likely groups`,
      `${possible.toLocaleString()} possible groups`,
      `${minimum.toLocaleString()}–${loaded.contacts.length.toLocaleString()} contacts depending on your choices`,
    ],
    vcfDiagnosticMessages(loaded.diagnostics).concat(
      analysis.diagnostics.map((diagnostic) => diagnostic.message),
    ),
  );
  renderDuplicateReview(result, loaded.contacts, analysis, {
    downloadLabel: 'Download reviewed VCF',
    filename: 'cleaned-contacts.vcf',
  });
}
