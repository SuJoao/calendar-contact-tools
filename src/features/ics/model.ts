export type CalendarTimeKind = 'utc' | 'zoned' | 'floating' | 'date';

/**
 * A calendar value keeps its wall-clock representation separate from any resolved
 * instant. Floating and date-only values intentionally have no instant.
 */
export interface CalendarTimeValue {
  kind: CalendarTimeKind;
  raw: string;
  value: string;
  tzid?: string;
  instant?: string;
}

export type CalendarDiagnosticSeverity = 'warning' | 'error';

export type CalendarDiagnosticCode =
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'CONFLICTING_VTIMEZONE'
  | 'DUPLICATE_CANDIDATE'
  | 'DUPLICATE_UID'
  | 'DUPLICATE_PROPERTY'
  | 'INVALID_DATE'
  | 'INVALID_RRULE'
  | 'LIMIT_EXCEEDED'
  | 'MALFORMED_EVENT'
  | 'MISSING_UID'
  | 'MISSING_RECURRENCE_MASTER'
  | 'MIXED_CALENDAR_METADATA'
  | 'NONEXISTENT_LOCAL_TIME'
  | 'RECURRENCE_TIMEZONE_WARNING'
  | 'DUPLICATE_RECURRENCE_MASTER'
  | 'DUPLICATE_RECURRENCE_OVERRIDE'
  | 'RECURRENCE_LIMIT_REACHED'
  | 'RECURRENCE_OVERRIDE_MISMATCH'
  | 'RECURRENCE_TIME_KIND_MISMATCH'
  | 'TIMEZONE_ASSIGNMENT_UNSAFE'
  | 'TIMEZONE_CONVERSION_UNSAFE'
  | 'TRUNCATED_COMPONENT'
  | 'UNSUPPORTED_RDATE_PERIOD'
  | 'UNSUPPORTED_RRULE_PART'
  | 'UNSUPPORTED_THISANDFUTURE'
  | 'UNKNOWN_TIMEZONE';

export interface CalendarDiagnostic {
  severity: CalendarDiagnosticSeverity;
  code: CalendarDiagnosticCode;
  message: string;
  eventUid?: string;
  eventTitle?: string;
  property?: string;
  sourceFile?: string;
  line?: number;
}

export interface CalendarRawProperty {
  name: string;
  value: string;
  parameters: Record<string, string | string[]>;
  raw: string;
}

/** The single normalized event representation used by all ICS features. */
export interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  startTime: CalendarTimeValue;
  endTime?: CalendarTimeValue;
  duration: string;
  allDay: boolean;
  timezone: string;
  timeKind: CalendarTimeKind;
  organizer: string;
  attendees: string[];
  status: string;
  rrule: string;
  rdates: CalendarTimeValue[];
  exdates: CalendarTimeValue[];
  recurrenceId?: CalendarTimeValue;
  recurrenceRange?: string;
  sequence?: number;
  created?: CalendarTimeValue;
  lastModified?: CalendarTimeValue;
  dtstamp?: CalendarTimeValue;
  categories: string[];
  url: string;
  geo: string;
  sourceFile: string;
  rawProperties: CalendarRawProperty[];
  diagnostics: CalendarDiagnostic[];
  raw: string;
}

export interface CalendarMetadata {
  prodid: string;
  version: string;
  method: string;
  calscale: string;
  name: string;
  description: string;
  timezone: string;
  refreshInterval: string;
  color: string;
  source: string;
  vendorProperties: string[];
  vtimezones: string[];
}

export interface IcsParseResult {
  events: CalendarEvent[];
  diagnostics: CalendarDiagnostic[];
  metadata: CalendarMetadata;
  raw: string;
  sourceFile: string;
}

export interface CalendarInput {
  name: string;
  text: string;
}

export function calendarTimeDisplay(value: CalendarTimeValue | undefined): string {
  if (!value) return '';
  return value.instant ?? value.value;
}
