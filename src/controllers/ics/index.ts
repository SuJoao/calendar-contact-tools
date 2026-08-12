import { siteConfig } from '../../config/site';
import { calendarCsvColumns } from '../../features/ics/csv';
import { routePaths } from '../../routePaths';
import { label } from '../toolUi';

export function isIcsPath(path: string): boolean {
  return path.startsWith('/ics');
}

export function icsOptionsMarkup(path: string): string {
  if (path === routePaths.icsToCsv)
    return `<fieldset><legend>CSV columns</legend><div class="check-grid">${checkboxes([...calendarCsvColumns])}</div></fieldset><div class="option-row"><label>Date format<select id="date-format"><option value="iso">ISO 8601</option><option value="locale">Browser locale</option></select></label><label>Timezone output<select id="timezone-output"><option value="original">Original wall-clock value</option><option value="utc">UTC where resolvable</option><option value="local">Browser timezone where resolvable</option></select></label></div>`;
  if (path === routePaths.icsMerge)
    return `<div class="notice"><strong>Nothing is removed automatically.</strong> The merged preview keeps every readable event. Review duplicate candidates after processing and explicitly exclude only the copies you do not want.</div>`;
  if (path === routePaths.icsTimezoneFixer)
    return `<div class="notice warning"><strong>Inspect first and review before downloading.</strong> Assign keeps a floating wall time and gives it a zone. Convert preserves a known instant and changes its wall time.</div><div class="option-row"><label>Action<select id="timezone-action"><option value="inspect">Inspect only</option><option value="convert">Convert timezone</option><option value="assign">Assign timezone to floating times</option></select></label><label>Apply to<select id="timezone-scope"><option value="matching">Events matching source timezone</option><option value="eligible">All eligible events</option><option value="floating">Floating events</option><option value="selected">Selected preview events</option></select></label><label>Source timezone (convert)<input id="source-zone" value="Europe/Lisbon" autocomplete="off" /></label><label>Target timezone<input id="target-zone" value="UTC" autocomplete="off" /></label></div>`;
  if (path === routePaths.icsRecurringEventsViewer) {
    const today = isoDay(new Date());
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    return `<div class="option-row"><label>From<input id="range-from" type="date" value="${today}" /></label><label>Until<input id="range-to" type="date" value="${isoDay(next)}" /></label><label>Maximum per series<input id="occurrence-limit" type="number" min="1" max="${siteConfig.maxRecurrenceOccurrences}" value="1000" /></label></div><div class="button-row recurrence-quick-ranges" aria-label="Quick date ranges"><button type="button" class="button secondary" data-range-days="30">30 days</button><button type="button" class="button secondary" data-range-days="90">3 months</button><button type="button" class="button secondary" data-range-days="365">1 year</button></div><p class="field-help">Expansion uses explicit calendar dates and strict occurrence limits. Unsupported recurrence behavior is diagnosed instead of approximated.</p>`;
  }
  return '';
}

export async function runIcsController(
  path: string,
  files: File[],
  result: HTMLElement,
): Promise<void> {
  if (path === routePaths.icsViewer) {
    const { runIcsViewer } = await import('./viewerController');
    return runIcsViewer(files, result);
  }
  if (path === routePaths.icsToCsv) {
    const { runIcsToCsv } = await import('./csvController');
    return runIcsToCsv(files, result);
  }
  if (path === routePaths.icsMerge) {
    const { runIcsMerge } = await import('./mergeController');
    return runIcsMerge(files, result);
  }
  if (path === routePaths.icsTimezoneFixer) {
    const { runIcsTimezone } = await import('./timezoneController');
    return runIcsTimezone(files, result);
  }
  if (path === routePaths.icsRecurringEventsViewer) {
    const { runIcsRecurrence } = await import('./recurrenceController');
    return runIcsRecurrence(files, result);
  }
  throw new Error('Unknown calendar tool route.');
}

function checkboxes(columns: string[]): string {
  return columns
    .map(
      (column) =>
        `<label><input type="checkbox" name="column" value="${column}" checked /> ${label(column)}</label>`,
    )
    .join('');
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
