import type { CalendarEvent, CalendarTimeValue } from './model';

export type DuplicateConfidence = 'certain' | 'likely' | 'possible';

export interface DuplicateCandidate {
  eventA: number;
  eventB: number;
  confidence: DuplicateConfidence;
  reasons: string[];
  exact: boolean;
}

interface CandidateSeed {
  key: string;
  confidence: DuplicateConfidence;
  reasons: string[];
}

/** UID identity includes RECURRENCE-ID so a recurring master and its overrides stay distinct. */
export function eventDuplicateKey(event: CalendarEvent): string {
  const uid = normalize(event.uid);
  if (uid)
    return `uid:${uid}|${event.recurrenceId ? `override:${timeKey(event.recurrenceId)}` : 'master'}`;
  return `heuristic:${eventSignature(event)}`;
}

/**
 * Produces a bounded, index-driven review list. Each bucket compares later events
 * with its first member, avoiding a quadratic all-pairs scan.
 */
export function findDuplicateCandidates(events: readonly CalendarEvent[]): DuplicateCandidate[] {
  const output: DuplicateCandidate[] = [];
  const seenPairs = new Set<string>();
  const buckets = new Map<string, number>();

  for (const [index, event] of events.entries()) {
    for (const seed of candidateSeeds(event)) {
      const prior = buckets.get(seed.key);
      if (prior === undefined) {
        buckets.set(seed.key, index);
        continue;
      }
      if (prior === index) continue;
      const pairKey = `${prior}|${index}`;
      if (seenPairs.has(pairKey)) continue;
      const first = events[prior]!;
      if (differentRecurrenceInstances(first, event)) continue;
      seenPairs.add(pairKey);
      output.push({
        eventA: prior,
        eventB: index,
        confidence: seed.confidence,
        reasons: seed.reasons,
        exact: exactEventMatch(first, event),
      });
      // A stronger bucket has already classified this pair.
      break;
    }
  }
  return output;
}

/** Compatibility helper: returns the later event from each review candidate. */
export function findEventDuplicates(events: readonly CalendarEvent[]): Set<number> {
  return new Set(findDuplicateCandidates(events).map((candidate) => candidate.eventB));
}

function candidateSeeds(event: CalendarEvent): CandidateSeed[] {
  const seeds: CandidateSeed[] = [];
  const uid = normalize(event.uid);
  if (uid) {
    seeds.push({
      key: `certain:${eventDuplicateKey(event)}`,
      confidence: 'certain',
      reasons: ['Same non-empty UID and same recurrence instance'],
    });
  }
  const title = normalize(event.title);
  const start = timeKey(event.startTime);
  const end = event.endTime ? timeKey(event.endTime) : `duration:${event.duration}`;
  const location = normalize(event.location);
  if (title && start) {
    seeds.push({
      key: `likely:${title}|${start}|${end}|${location}`,
      confidence: 'likely',
      reasons: ['Matching title', 'Matching start and end', 'Matching location'],
    });
    seeds.push({
      key: `possible:${title}|${start}`,
      confidence: 'possible',
      reasons: ['Matching title and start'],
    });
  }
  return seeds;
}

function differentRecurrenceInstances(first: CalendarEvent, second: CalendarEvent): boolean {
  if (!first.uid || normalize(first.uid) !== normalize(second.uid)) return false;
  const firstId = first.recurrenceId ? timeKey(first.recurrenceId) : 'master';
  const secondId = second.recurrenceId ? timeKey(second.recurrenceId) : 'master';
  return firstId !== secondId;
}

function eventSignature(event: CalendarEvent): string {
  return [
    normalize(event.title),
    timeKey(event.startTime),
    event.endTime ? timeKey(event.endTime) : `duration:${event.duration}`,
    normalize(event.location),
  ].join('|');
}

function exactEventMatch(first: CalendarEvent, second: CalendarEvent): boolean {
  return (
    eventSignature(first) === eventSignature(second) &&
    normalize(first.description) === normalize(second.description) &&
    normalize(first.organizer) === normalize(second.organizer) &&
    first.rrule === second.rrule &&
    first.status === second.status
  );
}

function timeKey(value: CalendarTimeValue): string {
  if (value.kind === 'date') return `date:${value.raw}`;
  if (value.kind === 'floating') return `floating:${value.raw}`;
  if (value.instant) return `instant:${value.instant}`;
  return `zoned-wall:${normalize(value.tzid ?? '')}:${value.raw}`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
