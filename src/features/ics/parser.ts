import ICAL from 'ical.js';
import { calendarLimits } from '../../config/calendar';
import type { CalendarDiagnostic, CalendarEvent, CalendarMetadata, IcsParseResult } from './model';
import { normalizeEventComponent } from './normalizeEvent';

interface ComponentBlock {
  text: string;
  line: number;
}

export interface ParseIcsOptions {
  maxEvents?: number;
  maxPropertyLength?: number;
  maxAttendeesPerEvent?: number;
}

export function unfoldIcs(text: string): string {
  return normalizeLineEndings(text).replace(/\r\n[ \t]/g, '');
}

/** The canonical entry point for every ICS route and worker. */
export function parseIcs(
  text: string,
  sourceFile = 'calendar.ics',
  options: ParseIcsOptions = {},
): IcsParseResult {
  if (!/BEGIN:VCALENDAR/i.test(text))
    throw new Error(`${sourceFile} is not an ICS calendar (BEGIN:VCALENDAR is missing).`);

  const limits = {
    maxEvents: options.maxEvents ?? calendarLimits.maxEvents,
    maxPropertyLength: options.maxPropertyLength ?? calendarLimits.maxPropertyLength,
    maxAttendeesPerEvent: options.maxAttendeesPerEvent ?? calendarLimits.maxAttendeesPerEvent,
  };
  const unfolded = unfoldIcs(text);
  const diagnostics: CalendarDiagnostic[] = [];
  const metadata = readMetadata(unfolded);
  if (count(unfolded, /^BEGIN:VCALENDAR$/gim) !== count(unfolded, /^END:VCALENDAR$/gim)) {
    diagnostics.push({
      severity: 'warning',
      code: 'TRUNCATED_COMPONENT',
      message: 'The calendar wrapper is truncated; complete event records were recovered.',
      sourceFile,
    });
  }

  const oversizedLines = unfolded
    .split('\r\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.length > limits.maxPropertyLength);
  oversizedLines.forEach(({ number }) =>
    diagnostics.push({
      severity: 'error',
      code: 'LIMIT_EXCEEDED',
      message: `A property exceeds the ${limits.maxPropertyLength.toLocaleString()} character safety limit.`,
      sourceFile,
      line: number,
    }),
  );

  const events: CalendarEvent[] = [];
  const calendarBlocks = extractBalancedBlocks(unfolded, 'VCALENDAR');
  const calendarDiagnosticStart = diagnostics.length;
  let parsedAsCalendars = calendarBlocks.length > 0 && oversizedLines.length === 0;
  if (parsedAsCalendars) {
    for (const block of calendarBlocks) {
      try {
        const root = new ICAL.Component(ICAL.parse(block.text));
        const eventBlocks = extractBalancedBlocks(block.text, 'VEVENT');
        for (const [index, component] of root.getAllSubcomponents('vevent').entries()) {
          if (events.length >= limits.maxEvents) break;
          addEvent(
            component,
            sourceFile,
            block.line + (eventBlocks[index]?.line ?? 1) - 1,
            limits.maxAttendeesPerEvent,
            events,
            diagnostics,
          );
        }
      } catch {
        parsedAsCalendars = false;
        events.length = 0;
        diagnostics.splice(calendarDiagnosticStart);
        break;
      }
    }
  }

  if (!parsedAsCalendars) {
    diagnostics.push({
      severity: 'warning',
      code: 'MALFORMED_EVENT',
      message: 'The calendar is partially malformed; complete events were parsed independently.',
      sourceFile,
    });
    const scan = scanEventBlocks(unfolded, sourceFile, limits.maxEvents);
    diagnostics.push(...scan.diagnostics);
    for (const block of scan.blocks) {
      if (block.text.split('\r\n').some((line) => line.length > limits.maxPropertyLength)) continue;
      try {
        const wrapped = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          ...metadata.vtimezones,
          block.text,
          'END:VCALENDAR',
        ].join('\r\n');
        const component = new ICAL.Component(ICAL.parse(wrapped)).getFirstSubcomponent('vevent');
        if (!component) throw new Error('VEVENT was not readable.');
        addEvent(
          component,
          sourceFile,
          block.line,
          limits.maxAttendeesPerEvent,
          events,
          diagnostics,
        );
      } catch {
        if (/^RRULE(?:;[^:]*)?:/im.test(block.text))
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_RRULE',
            message: 'The event contains an invalid recurrence rule and was skipped.',
            property: 'RRULE',
            sourceFile,
            line: block.line,
          });
        diagnostics.push({
          severity: 'error',
          code: 'MALFORMED_EVENT',
          message: 'An event could not be parsed and was skipped.',
          sourceFile,
          line: block.line,
        });
      }
    }
  }

  if (count(unfolded, /^BEGIN:VEVENT$/gim) > limits.maxEvents) {
    diagnostics.push({
      severity: 'error',
      code: 'LIMIT_EXCEEDED',
      message: `Only the first ${limits.maxEvents.toLocaleString()} events were processed.`,
      sourceFile,
    });
  }
  if (!events.length && !diagnostics.some((item) => item.code === 'MALFORMED_EVENT')) {
    diagnostics.push({
      severity: 'warning',
      code: 'MALFORMED_EVENT',
      message: 'No readable events were found.',
      sourceFile,
    });
  }
  return { events, diagnostics: dedupeDiagnostics(diagnostics), metadata, raw: text, sourceFile };
}

function addEvent(
  component: ICAL.Component,
  sourceFile: string,
  line: number,
  maxAttendees: number,
  events: CalendarEvent[],
  diagnostics: CalendarDiagnostic[],
): void {
  try {
    const event = normalizeEventComponent(component, sourceFile, line, maxAttendees);
    events.push(event);
    diagnostics.push(...event.diagnostics);
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'MALFORMED_EVENT',
      message: error instanceof Error ? error.message : 'An event was malformed and was skipped.',
      sourceFile,
      line,
    });
  }
}

function readMetadata(text: string): CalendarMetadata {
  const rootProperties = calendarPropertyLines(text);
  return {
    prodid: firstValue(text, 'PRODID'),
    version: firstValue(text, 'VERSION') || '2.0',
    method: firstValue(text, 'METHOD'),
    calscale: firstValue(text, 'CALSCALE'),
    name: unescapeCalendarText(firstRootValue(rootProperties, ['NAME', 'X-WR-CALNAME'])),
    description: unescapeCalendarText(
      firstRootValue(rootProperties, ['DESCRIPTION', 'X-WR-CALDESC']),
    ),
    timezone: firstRootValue(rootProperties, ['X-WR-TIMEZONE']),
    refreshInterval: firstRootValue(rootProperties, ['REFRESH-INTERVAL', 'X-PUBLISHED-TTL']),
    color: firstRootValue(rootProperties, ['COLOR', 'X-APPLE-CALENDAR-COLOR']),
    source: firstRootValue(rootProperties, ['SOURCE']),
    vendorProperties: rootProperties.filter(
      (line) =>
        /^X-/i.test(line) &&
        !/^(X-WR-CALNAME|X-WR-CALDESC|X-WR-TIMEZONE|X-PUBLISHED-TTL|X-APPLE-CALENDAR-COLOR)(?:;|:)/i.test(
          line,
        ),
    ),
    vtimezones: extractBalancedBlocks(text, 'VTIMEZONE').map((block) => block.text),
  };
}

function calendarPropertyLines(text: string): string[] {
  const lines = text.split('\r\n');
  const properties: string[] = [];
  let depth = 0;
  for (const line of lines) {
    if (/^BEGIN:/i.test(line)) {
      depth += 1;
      continue;
    }
    if (/^END:/i.test(line)) {
      depth -= 1;
      continue;
    }
    if (depth === 1 && line.includes(':')) properties.push(line);
  }
  return properties;
}

function firstRootValue(lines: string[], names: string[]): string {
  for (const name of names) {
    const match = lines.find((line) => new RegExp(`^${name}(?:;[^:]*)?:`, 'i').test(line));
    if (match) return match.slice(match.indexOf(':') + 1).trim();
  }
  return '';
}

function unescapeCalendarText(value: string): string {
  return value.replace(/\\[nN]/g, '\n').replace(/\\([\\,;])/g, '$1');
}

function firstValue(text: string, property: string): string {
  return new RegExp(`^${property}(?:;[^:]*)?:(.*)$`, 'im').exec(text)?.[1]?.trim() ?? '';
}

function extractBalancedBlocks(text: string, component: string): ComponentBlock[] {
  const lines = text.split('\r\n');
  const blocks: ComponentBlock[] = [];
  let start = -1;
  lines.forEach((line, index) => {
    if (line.toUpperCase() === `BEGIN:${component}` && start < 0) start = index;
    if (line.toUpperCase() === `END:${component}` && start >= 0) {
      blocks.push({ text: lines.slice(start, index + 1).join('\r\n'), line: start + 1 });
      start = -1;
    }
  });
  return blocks;
}

function scanEventBlocks(
  text: string,
  sourceFile: string,
  maxEvents: number,
): { blocks: ComponentBlock[]; diagnostics: CalendarDiagnostic[] } {
  const lines = text.split('\r\n');
  const blocks: ComponentBlock[] = [];
  const diagnostics: CalendarDiagnostic[] = [];
  let current: { lines: string[]; line: number } | undefined;
  lines.forEach((line, index) => {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      if (current)
        diagnostics.push({
          severity: 'error',
          code: 'TRUNCATED_COMPONENT',
          message:
            'An event began before the previous event ended; the previous event was skipped.',
          sourceFile,
          line: current.line,
        });
      current = { lines: [line], line: index + 1 };
      return;
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (!current) {
        diagnostics.push({
          severity: 'error',
          code: 'MALFORMED_EVENT',
          message: 'An unmatched END:VEVENT marker was ignored.',
          sourceFile,
          line: index + 1,
        });
        return;
      }
      current.lines.push(line);
      if (blocks.length < maxEvents)
        blocks.push({ text: current.lines.join('\r\n'), line: current.line });
      current = undefined;
      return;
    }
    current?.lines.push(line);
  });
  if (current)
    diagnostics.push({
      severity: 'error',
      code: 'TRUNCATED_COMPONENT',
      message: 'A truncated event without END:VEVENT was skipped.',
      sourceFile,
      line: current.line,
    });
  return { blocks, diagnostics };
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?|\n/g, '\r\n');
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function dedupeDiagnostics(diagnostics: CalendarDiagnostic[]): CalendarDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}|${diagnostic.line ?? ''}|${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseIcsBlocks(text: string): {
  headers: string[];
  events: string[];
  malformed: number;
} {
  const normalized = unfoldIcs(text);
  const events = extractBalancedBlocks(normalized, 'VEVENT').map((block) => block.text);
  const firstEvent = normalized.search(/^BEGIN:VEVENT$/im);
  const before = firstEvent >= 0 ? normalized.slice(0, firstEvent) : normalized;
  const headers = before.split('\r\n').filter((line) => line && !/^BEGIN:VCALENDAR$/i.test(line));
  const begins = count(normalized, /^BEGIN:VEVENT$/gim);
  const ends = count(normalized, /^END:VEVENT$/gim);
  return { headers, events, malformed: Math.abs(begins - ends) };
}
