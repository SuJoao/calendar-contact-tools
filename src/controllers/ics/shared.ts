import { diagnosticMessages } from '../../features/ics/diagnostics';
import type {
  CalendarDiagnostic,
  CalendarEvent,
  CalendarInput,
  IcsParseResult,
} from '../../features/ics/model';
import { parseCalendarInputs } from '../../features/ics/workers/client';
import { readFileText } from '../../utils/files';

export interface LoadedCalendars {
  contents: CalendarInput[];
  parsed: IcsParseResult[];
  events: CalendarEvent[];
  diagnostics: CalendarDiagnostic[];
}

export async function loadCalendarContents(files: File[]): Promise<CalendarInput[]> {
  return Promise.all(
    files.map(async (file) => ({ name: file.name, text: await readFileText(file) })),
  );
}

export async function loadCalendars(files: File[]): Promise<LoadedCalendars> {
  const contents = await loadCalendarContents(files);
  const parsed = await parseCalendarInputs(contents);
  return {
    contents,
    parsed,
    events: parsed.flatMap((item) => item.events),
    diagnostics: parsed.flatMap((item) => item.diagnostics),
  };
}

export function calendarDiagnosticMessages(diagnostics: CalendarDiagnostic[]): string[] {
  return diagnosticMessages(diagnostics);
}

export function invalidEventCount(diagnostics: CalendarDiagnostic[]): number {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === 'error' &&
      ['MALFORMED_EVENT', 'TRUNCATED_COMPONENT', 'INVALID_DATE'].includes(diagnostic.code),
  ).length;
}
