/** Central safety limits for untrusted browser-local calendar input. */
export const calendarLimits = {
  maxEvents: 25_000,
  maxPropertyLength: 1_000_000,
  maxAttendeesPerEvent: 10_000,
  workerThresholdBytes: 500_000,
  maxPreviewRows: 100,
  maxRenderedRows: 1_000,
  defaultExpansionRangeDays: 365,
  maxExpansionRangeDays: 366 * 5,
  maxOccurrencesPerSeries: 10_000,
  maxTotalOccurrences: 25_000,
  recurrenceWorkerThreshold: 2_000,
} as const;

export type CalendarLimits = typeof calendarLimits;
