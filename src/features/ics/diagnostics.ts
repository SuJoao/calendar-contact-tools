import type { CalendarDiagnostic } from './model';

export function diagnosticMessage(diagnostic: CalendarDiagnostic): string {
  const context = [
    diagnostic.eventTitle ? `“${diagnostic.eventTitle}”` : '',
    diagnostic.eventUid ? `UID ${diagnostic.eventUid}` : '',
    diagnostic.line ? `line ${diagnostic.line}` : '',
  ].filter(Boolean);
  return `${diagnostic.message}${context.length ? ` (${context.join(', ')})` : ''}`;
}

export function diagnosticMessages(diagnostics: readonly CalendarDiagnostic[]): string[] {
  return diagnostics.map(diagnosticMessage);
}
