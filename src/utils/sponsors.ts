import { siteConfig } from '../config/site';
import rawSponsors from '../data/sponsors.json';
import type { Placement, Sponsor } from '../types';

const placements = new Set<Placement>([
  'homepage',
  'ics-tools',
  'vcf-tools',
  'all-tools',
  'footer',
]);

const sponsorImagePattern = /^\/sponsors\/[a-z0-9][a-z0-9._-]*\.(?:png|webp|svg)$/i;

export type InventoryPlacement = 'homepage' | 'ics-tools' | 'vcf-tools';

export interface SponsorInventoryItem {
  placement: InventoryPlacement;
  label: string;
  active: number;
  total: number;
  available: number;
}

export function sponsorRecordErrors(value: unknown, index = 0): string[] {
  if (!value || typeof value !== 'object') return [`Sponsor ${index} must be an object.`];
  const item = value as Record<string, unknown>;
  const errors: string[] = [];
  const strings = ['id', 'name', 'description', 'image', 'url', 'startDate', 'endDate', 'label'];
  strings.forEach((key) => {
    if (typeof item[key] !== 'string' || !item[key].trim())
      errors.push(`Sponsor ${index}: invalid ${key}.`);
  });
  if (typeof item.isActive !== 'boolean')
    errors.push(`Sponsor ${index}: isActive must be boolean.`);
  if (
    !Array.isArray(item.placement) ||
    item.placement.length === 0 ||
    !item.placement.every((place) => placements.has(place as Placement))
  )
    errors.push(`Sponsor ${index}: invalid placement.`);
  const start = typeof item.startDate === 'string' ? item.startDate : '';
  const end = typeof item.endDate === 'string' ? item.endDate : '';
  if (!isIsoDate(start) || !isIsoDate(end) || start >= end)
    errors.push(`Sponsor ${index}: invalid date range.`);
  try {
    if (new URL(String(item.url)).protocol !== 'https:')
      errors.push(`Sponsor ${index}: URL must use HTTPS.`);
  } catch {
    errors.push(`Sponsor ${index}: invalid URL.`);
  }
  if (typeof item.image !== 'string' || !sponsorImagePattern.test(item.image))
    errors.push(
      `Sponsor ${index}: image must be a local PNG, WebP, or reviewed SVG in /sponsors/.`,
    );
  return errors;
}

export function sponsorDatasetErrors(values: unknown, knownImages?: ReadonlySet<string>): string[] {
  if (!Array.isArray(values)) return ['sponsors.json must contain an array.'];
  const errors = values.flatMap((value, index) => sponsorRecordErrors(value, index));
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') return;
    const id = String((value as Record<string, unknown>).id ?? '');
    if (id && seen.has(id)) errors.push(`Sponsor ${index}: duplicate id "${id}".`);
    seen.add(id);
    const image = String((value as Record<string, unknown>).image ?? '');
    if (knownImages && image && !knownImages.has(image))
      errors.push(`Sponsor ${index}: image file does not exist: ${image}.`);
  });
  return errors;
}

export function validateSponsor(value: unknown): value is Sponsor {
  return sponsorRecordErrors(value).length === 0;
}

export function activeSponsors(placement: Placement, now: Date = new Date()): Sponsor[] {
  return sponsorsForPlacement(rawSponsors as unknown[], placement, now);
}

export function sponsorsForPlacement(
  values: unknown[],
  placement: Placement,
  now: Date = new Date(),
): Sponsor[] {
  const day = now.toISOString().slice(0, 10);
  return values
    .filter(validateSponsor)
    .filter((sponsor) => isSponsorActive(sponsor, day))
    .filter((sponsor) => placementMatches(sponsor, placement));
}

export function isSponsorActive(sponsor: Sponsor, day: string): boolean {
  return sponsor.isActive && sponsor.startDate <= day && day < sponsor.endDate;
}

export function calculateSponsorInventory(
  values: unknown[] = rawSponsors as unknown[],
  now: Date = new Date(),
): SponsorInventoryItem[] {
  const capacities = siteConfig.sponsorPlacementCapacity;
  const definitions: { placement: InventoryPlacement; label: string; total: number }[] = [
    { placement: 'homepage', label: 'Homepage placements', total: capacities.homepage },
    { placement: 'ics-tools', label: 'Calendar tool placements', total: capacities['ics-tools'] },
    { placement: 'vcf-tools', label: 'Contact tool placements', total: capacities['vcf-tools'] },
  ];
  return definitions.map((definition) => {
    const active = Math.min(
      definition.total,
      sponsorsForPlacement(values, definition.placement, now).length,
    );
    return { ...definition, active, available: definition.total - active };
  });
}

function placementMatches(sponsor: Sponsor, placement: Placement): boolean {
  if (sponsor.placement.includes(placement)) return true;
  return (
    sponsor.placement.includes('all-tools') &&
    (placement === 'ics-tools' || placement === 'vcf-tools')
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
