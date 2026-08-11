export interface TimezoneIssue {
  line: number;
  property: string;
  value: string;
  kind: 'floating' | 'unknown' | 'ambiguous' | 'nonexistent';
}

export interface WallTimeResolution {
  status: 'valid' | 'ambiguous' | 'nonexistent';
  instants: Date[];
}

const wallTimeCache = new Map<string, WallTimeResolution>();

export function isSupportedTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function inspectTimezones(text: string): { zones: string[]; issues: TimezoneIssue[] } {
  const zones = new Set<string>();
  const issues: TimezoneIssue[] = [];
  text
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const match = /^(DTSTART|DTEND)((?:;[^:]*)*):(\d{8}T\d{6}Z?)$/i.exec(line);
      if (!match) return;
      const zoneMatch = /;TZID=(?:"([^"]+)"|([^;:]+))/i.exec(match[2]!);
      const zone = zoneMatch?.[1] ?? zoneMatch?.[2];
      const value = match[3]!;
      if (zone) {
        zones.add(zone);
        if (!isSupportedTimezone(zone)) {
          issues.push({
            line: index + 1,
            property: match[1]!,
            value,
            kind: 'unknown',
          });
          return;
        }
        const resolution = resolveWallTime(value, zone);
        if (resolution.status !== 'valid') {
          issues.push({
            line: index + 1,
            property: match[1]!,
            value,
            kind: resolution.status,
          });
        }
      } else if (!value.endsWith('Z')) {
        issues.push({
          line: index + 1,
          property: match[1]!,
          value,
          kind: 'floating',
        });
      } else {
        zones.add('UTC');
      }
    });
  return { zones: [...zones], issues };
}

export function assignFloatingTimezone(text: string, timezone: string): string {
  if (!isSupportedTimezone(timezone))
    throw new Error(`“${timezone}” is not recognized by this browser.`);
  return text.replace(
    /^(DTSTART|DTEND)(?![^:]*TZID=)([^:]*):(\d{8}T\d{6})(?=\r?$)/gim,
    `$1;TZID=${timezone}$2:$3`,
  );
}

export function convertTimezone(text: string, fromZone: string, toZone: string): string {
  if (!isSupportedTimezone(fromZone) || !isSupportedTimezone(toZone))
    throw new Error('Choose recognized IANA timezones, such as Europe/Lisbon or America/New_York.');
  return text.replace(
    /^(DTSTART|DTEND)((?:;[^:]*)*):(\d{8}T\d{6})(Z?)(?=\r?$)/gim,
    (line, property: string, params: string, value: string, zulu: string) => {
      const zoneMatch = /;TZID=(?:"([^"]+)"|([^;:]+))/i.exec(params);
      const source = zulu ? 'UTC' : (zoneMatch?.[1] ?? zoneMatch?.[2] ?? fromZone);
      if (source !== 'UTC' && !isSupportedTimezone(source)) return line;
      const instant = source === 'UTC' ? basicUtcToDate(value) : wallTimeToDate(value, source);
      const remainingParams = params.replace(/;TZID=(?:"[^"]+"|[^;:]*)/i, '');
      if (toZone === 'UTC')
        return `${property}${remainingParams}:${dateToBasicInZone(instant, 'UTC')}Z`;
      return `${property};TZID=${toZone}${remainingParams}:${dateToBasicInZone(instant, toZone)}`;
    },
  );
}

/**
 * Resolves a named-zone wall time without guessing through DST gaps or folds.
 * Ambiguous times return both possible instants; nonexistent times return none.
 */
export function resolveWallTime(value: string, timeZone: string): WallTimeResolution {
  if (!isSupportedTimezone(timeZone)) return { status: 'nonexistent', instants: [] };
  const cacheKey = `${timeZone}|${value}`;
  const cached = wallTimeCache.get(cacheKey);
  if (cached) return cached;
  const wanted = parseBasic(value);
  if (!validParts(wanted)) return { status: 'nonexistent', instants: [] };
  const nominal = Date.UTC(
    wanted.year,
    wanted.month - 1,
    wanted.day,
    wanted.hour,
    wanted.minute,
    wanted.second,
  );
  const instants: Date[] = [];
  // IANA offsets are bounded by ±14 hours and may include 15-minute increments.
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = new Date(nominal - offsetMinutes * 60_000);
    if (sameParts(zonedParts(candidate, timeZone), wanted)) instants.push(candidate);
  }
  const unique = [...new Map(instants.map((date) => [date.getTime(), date])).values()].sort(
    (a, b) => a.getTime() - b.getTime(),
  );
  const result: WallTimeResolution = {
    status: unique.length === 0 ? 'nonexistent' : unique.length > 1 ? 'ambiguous' : 'valid',
    instants: unique,
  };
  if (wallTimeCache.size > 10_000) wallTimeCache.clear();
  wallTimeCache.set(cacheKey, result);
  return result;
}

export function wallTimeToDate(value: string, timeZone: string): Date {
  const resolution = resolveWallTime(value, timeZone);
  if (resolution.status === 'ambiguous')
    throw new Error(`“${value}” is ambiguous in ${timeZone} because the clock repeats.`);
  if (resolution.status === 'nonexistent')
    throw new Error(`“${value}” does not exist in ${timeZone} because the clock changes.`);
  return resolution.instants[0]!;
}

export function basicUtcToDate(value: string): Date {
  const p = parseBasic(value);
  if (!validParts(p)) throw new Error(`“${value}” is not a valid calendar date-time.`);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

export function basicDateTimeText(value: string): string {
  const p = parseBasic(value);
  if (!validParts(p)) return value;
  return `${p.year.toString().padStart(4, '0')}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

export function basicDateText(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function parseBasic(
  value: string,
): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number> {
  return {
    year: +value.slice(0, 4),
    month: +value.slice(4, 6),
    day: +value.slice(6, 8),
    hour: +value.slice(9, 11),
    minute: +value.slice(11, 13),
    second: +value.slice(13, 15),
  };
}

function validParts(parts: ReturnType<typeof parseBasic>): boolean {
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 60
  )
    return false;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

function sameParts(a: ReturnType<typeof parseBasic>, b: ReturnType<typeof parseBasic>): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function zonedParts(date: Date, timeZone: string): ReturnType<typeof parseBasic> {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: +map.year!,
    month: +map.month!,
    day: +map.day!,
    hour: +map.hour!,
    minute: +map.minute!,
    second: +map.second!,
  };
}

export function dateToBasicInZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}
