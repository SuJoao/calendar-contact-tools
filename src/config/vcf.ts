/** Central safety and rendering limits for untrusted browser-local contact input. */
export const vcfLimits = {
  maxContacts: 50_000,
  maxPropertyLength: 1_000_000,
  maxRepeatedValues: 10_000,
  workerThresholdBytes: 500_000,
  maxRenderedContacts: 500,
  maxPreviewRows: 100,
  duplicateWorkerThresholdContacts: 750,
  maxDuplicateCandidates: 50_000,
  maxDuplicateGroupSize: 50,
  maxWeakBucketSize: 100,
  maxStrongBucketSize: 1_000,
  maxRenderedDuplicateGroups: 100,
} as const;

export type VcfLimits = typeof vcfLimits;
