import { vcfLimits } from '../../config/vcf';
import type { Contact, ContactAddress, ContactRawProperty, ContactTypedValue } from './model';

export type DuplicateConfidence = 'certain' | 'likely' | 'possible';

export type DuplicateReasonCode =
  | 'exact-contact'
  | 'same-uid'
  | 'same-email'
  | 'same-phone'
  | 'same-name'
  | 'similar-name'
  | 'same-organization'
  | 'same-address'
  | 'same-birthday'
  | 'conflicting-details';

export interface DuplicateReason {
  code: DuplicateReasonCode;
  label: string;
  weight: number;
}

export interface DuplicateCandidate {
  id: string;
  contactIds: [string, string];
  confidence: DuplicateConfidence;
  score: number;
  reasons: DuplicateReason[];
  exact: boolean;
}

export interface DuplicateGroup {
  id: string;
  contactIds: string[];
  candidates: DuplicateCandidate[];
  confidence: DuplicateConfidence;
  exact: boolean;
}

export interface DuplicateAnalysisDiagnostic {
  code:
    | 'DUPLICATE_BUCKET_TOO_LARGE'
    | 'DUPLICATE_CANDIDATE_LIMIT_REACHED'
    | 'DUPLICATE_GROUP_LIMIT_REACHED';
  message: string;
  signal?: string;
  bucketSize?: number;
}

export interface DuplicateAnalysisMetrics {
  contactCount: number;
  indexedValues: number;
  candidatePairs: number;
  scoredPairs: number;
  skippedWeakBuckets: number;
}

export interface DuplicateAnalysis {
  candidates: DuplicateCandidate[];
  groups: DuplicateGroup[];
  diagnostics: DuplicateAnalysisDiagnostic[];
  metrics: DuplicateAnalysisMetrics;
  exactDuplicateCopies: number;
  limited: boolean;
}

export interface DuplicateAnalysisOptions {
  maxCandidates?: number;
  maxWeakBucketSize?: number;
  maxStrongBucketSize?: number;
  maxGroupSize?: number;
  onStage?: (stage: DuplicateAnalysisStage) => void;
}

export type DuplicateAnalysisStage =
  'indexing-identifiers' | 'indexing-names' | 'comparing-candidates' | 'grouping-duplicates';

/** Compatibility options retained for integrations that still use the Run 5 API. */
export interface DuplicateRules {
  email: boolean;
  phone: boolean;
  similarName: boolean;
  organizationAndName: boolean;
}

interface PairSeed {
  left: number;
  right: number;
}

interface AnalysisLimits {
  maxCandidates: number;
  maxWeakBucketSize: number;
  maxStrongBucketSize: number;
  maxGroupSize: number;
}

const reasonLabels: Record<DuplicateReasonCode, string> = {
  'exact-contact': 'Semantically identical contact data',
  'same-uid': 'Same contact UID',
  'same-email': 'Same email address',
  'same-phone': 'Same phone number',
  'same-name': 'Same structured name',
  'similar-name': 'Similar name',
  'same-organization': 'Same organization',
  'same-address': 'Same postal address',
  'same-birthday': 'Same birthday',
  'conflicting-details': 'Conflicting contact details',
};

const confidenceRank: Record<DuplicateConfidence, number> = {
  possible: 1,
  likely: 2,
  certain: 3,
};

export function analyzeContactDuplicates(
  contacts: Contact[],
  options: DuplicateAnalysisOptions = {},
): DuplicateAnalysis {
  const limits: AnalysisLimits = {
    maxCandidates: options.maxCandidates ?? vcfLimits.maxDuplicateCandidates,
    maxWeakBucketSize: options.maxWeakBucketSize ?? vcfLimits.maxWeakBucketSize,
    maxStrongBucketSize: options.maxStrongBucketSize ?? vcfLimits.maxStrongBucketSize,
    maxGroupSize: options.maxGroupSize ?? vcfLimits.maxDuplicateGroupSize,
  };
  const diagnostics: DuplicateAnalysisDiagnostic[] = [];
  const pairKeys = new Set<string>();
  const pairs: PairSeed[] = [];
  let indexedValues = 0;
  let skippedWeakBuckets = 0;
  let limited = false;

  const addPairs = (index: Map<string, number[]>, signal: string, strong: boolean): void => {
    const bucketLimit = strong ? limits.maxStrongBucketSize : limits.maxWeakBucketSize;
    for (const bucket of index.values()) {
      if (bucket.length < 2) continue;
      if (bucket.length > bucketLimit) {
        diagnostics.push({
          code: 'DUPLICATE_BUCKET_TOO_LARGE',
          message: `${signal} comparison skipped a bucket of ${bucket.length.toLocaleString()} contacts to prevent a candidate explosion.`,
          signal,
          bucketSize: bucket.length,
        });
        if (!strong) skippedWeakBuckets += 1;
        continue;
      }
      for (let left = 0; left < bucket.length; left += 1) {
        for (let right = left + 1; right < bucket.length; right += 1) {
          const a = bucket[left]!;
          const b = bucket[right]!;
          const key = pairKey(a, b);
          if (pairKeys.has(key)) continue;
          if (pairs.length >= limits.maxCandidates) {
            limited = true;
            break;
          }
          pairKeys.add(key);
          pairs.push({ left: Math.min(a, b), right: Math.max(a, b) });
        }
        if (limited) break;
      }
      if (limited) break;
    }
  };

  options.onStage?.('indexing-identifiers');
  const uidIndex = buildIndex(contacts, (contact) => [normalizeUid(contact.uid)]);
  const emailIndex = buildIndex(contacts, (contact) =>
    contact.emails.map((item) => normalizeEmail(item.value)),
  );
  const phoneIndex = buildIndex(contacts, (contact) =>
    contact.phones.map((item) => normalizePhone(item.value)),
  );
  const exactIndex = buildIndex(contacts, (contact) => [exactContactSignature(contact)]);
  indexedValues += indexValueCount(uidIndex, emailIndex, phoneIndex, exactIndex);
  addPairs(exactIndex, 'exact contact', true);
  if (!limited) addPairs(uidIndex, 'UID', true);
  if (!limited) addPairs(emailIndex, 'email', true);
  if (!limited) addPairs(phoneIndex, 'phone', true);

  options.onStage?.('indexing-names');
  const nameIndex = buildIndex(contacts, (contact) => [normalizedContactName(contact)]);
  const addressIndex = buildIndex(contacts, (contact) => contact.addresses.map(normalizeAddress));
  const orgFamilyIndex = buildIndex(contacts, (contact) => {
    const organization = normalizeText(contact.organization);
    const family = normalizeName(contact.familyName);
    return organization && family ? [`${organization}\u0000${family}`] : [];
  });
  const birthdayFamilyIndex = buildIndex(contacts, (contact) => {
    const birthday = contact.birthday.trim();
    const family = normalizeName(contact.familyName);
    return birthday && family ? [`${birthday}\u0000${family}`] : [];
  });
  indexedValues += indexValueCount(nameIndex, addressIndex, orgFamilyIndex, birthdayFamilyIndex);
  if (!limited) addPairs(nameIndex, 'name', false);
  if (!limited) addPairs(addressIndex, 'address', false);
  if (!limited) addPairs(orgFamilyIndex, 'organization and family name', false);
  if (!limited) addPairs(birthdayFamilyIndex, 'birthday and family name', false);

  if (limited)
    diagnostics.push({
      code: 'DUPLICATE_CANDIDATE_LIMIT_REACHED',
      message: `Duplicate analysis stopped after ${limits.maxCandidates.toLocaleString()} candidate pairs. Refine or split unusually repetitive data before relying on complete results.`,
    });

  options.onStage?.('comparing-candidates');
  const candidates = pairs
    .map(({ left, right }) => scoreCandidate(contacts[left]!, contacts[right]!))
    .filter((candidate): candidate is DuplicateCandidate => candidate !== undefined)
    .sort(compareCandidates);

  options.onStage?.('grouping-duplicates');
  const groups = groupCandidates(contacts, candidates, limits.maxGroupSize, diagnostics);
  const exactDuplicateCopies = groups
    .filter((group) => group.exact)
    .reduce((total, group) => total + group.contactIds.length - 1, 0);
  return {
    candidates,
    groups,
    diagnostics,
    metrics: {
      contactCount: contacts.length,
      indexedValues,
      candidatePairs: pairs.length,
      scoredPairs: pairs.length,
      skippedWeakBuckets,
    },
    exactDuplicateCopies,
    limited,
  };
}

export function findDuplicateGroups(contacts: Contact[], _rules?: DuplicateRules): Contact[][] {
  void _rules;
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return analyzeContactDuplicates(contacts).groups.map((group) =>
    group.contactIds.map((id) => byId.get(id)!).filter(Boolean),
  );
}

export function contactsMatch(a: Contact, b: Contact, _rules?: DuplicateRules): boolean {
  void _rules;
  return scoreCandidate(a, b) !== undefined;
}

export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

export function normalizePhone(value: string): string {
  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase();
  const extensionMatch = normalized.match(/(?:ext\.?|extension|x)\s*(\d+)\s*$/i);
  const extension = extensionMatch?.[1] ?? '';
  const main = (extensionMatch ? normalized.slice(0, extensionMatch.index) : normalized)
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+');
  if (!/^\+?\d+$/.test(main) || main.replace(/\D/g, '').length < 5) return '';
  return `${main}${extension ? `x${extension}` : ''}`;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export function exactContactSignature(contact: Contact): string {
  const typed = (values: ContactTypedValue[]): unknown[] =>
    values
      .map((item) => ({
        value: normalizeText(item.value),
        types: [...item.types].map(normalizeText).sort(),
        preference: item.preference ?? null,
        parameters: normalizedParameters(item.parameters),
      }))
      .sort(compareJson);
  const addresses = contact.addresses
    .map((item) => ({
      value: normalizeAddress(item),
      types: [...item.types].map(normalizeText).sort(),
      preference: item.preference ?? null,
      parameters: normalizedParameters(item.parameters),
    }))
    .sort(compareJson);
  const vendor = vendorProperties(contact.rawProperties).map(propertySignature).sort();
  return JSON.stringify({
    formattedName: normalizeText(contact.formattedName),
    givenName: normalizeText(contact.givenName),
    additionalNames: contact.additionalNames.map(normalizeText),
    familyName: normalizeText(contact.familyName),
    honorificPrefixes: contact.honorificPrefixes.map(normalizeText),
    honorificSuffixes: contact.honorificSuffixes.map(normalizeText),
    organization: normalizeText(contact.organization),
    organizationUnits: contact.organizationUnits.map(normalizeText),
    title: normalizeText(contact.title),
    role: normalizeText(contact.role),
    emails: typed(contact.emails),
    phones: typed(contact.phones.map((item) => ({ ...item, value: normalizePhone(item.value) }))),
    addresses,
    urls: typed(contact.urls),
    birthday: contact.birthday.trim(),
    anniversary: contact.anniversary.trim(),
    categories: [...contact.categories].map(normalizeText).sort(),
    notes: [...contact.notes].map(normalizeText).sort(),
    nickname: normalizeText(contact.nickname),
    gender: normalizeText(contact.gender),
    uid: normalizeUid(contact.uid),
    kind: normalizeText(contact.kind),
    geo: contact.geo.trim(),
    timezone: contact.timezone.trim(),
    vendor,
  });
}

export function contactRichness(contact: Contact): number {
  return (
    Number(Boolean(contact.givenName || contact.familyName)) * 4 +
    Number(Boolean(contact.uid)) * 3 +
    Number(Boolean(contact.organization)) * 2 +
    Number(Boolean(contact.title)) * 2 +
    Number(Boolean(contact.birthday)) * 2 +
    Number(Boolean(contact.notes.length)) * 2 +
    Math.min(contact.emails.length, 3) * 2 +
    Math.min(contact.phones.length, 3) * 2 +
    Math.min(contact.addresses.length, 2) * 2 +
    Math.min(contact.urls.length, 2)
  );
}

function scoreCandidate(left: Contact, right: Contact): DuplicateCandidate | undefined {
  const reasons: DuplicateReason[] = [];
  const exact = exactContactSignature(left) === exactContactSignature(right);
  if (exact) reasons.push(reason('exact-contact', 200));

  const sameUid =
    Boolean(normalizeUid(left.uid)) && normalizeUid(left.uid) === normalizeUid(right.uid);
  if (sameUid) reasons.push(reason('same-uid', 90));

  const sharedEmails = intersection(
    left.emails.map((item) => normalizeEmail(item.value)),
    right.emails.map((item) => normalizeEmail(item.value)),
  );
  const nonGenericEmail = sharedEmails.some((email) => !isGenericEmail(email));
  if (sharedEmails.length) reasons.push(reason('same-email', nonGenericEmail ? 75 : 15));

  const sharedPhones = intersection(
    left.phones.map((item) => normalizePhone(item.value)).filter(Boolean),
    right.phones.map((item) => normalizePhone(item.value)).filter(Boolean),
  );
  const sharedWorkOnly =
    sharedPhones.length > 0 &&
    sharedPhones.every(
      (phone) =>
        phoneItems(left, phone).every(isWorkValue) && phoneItems(right, phone).every(isWorkValue),
    );
  if (sharedPhones.length) reasons.push(reason('same-phone', sharedWorkOnly ? 25 : 70));

  const leftName = normalizedContactName(left);
  const rightName = normalizedContactName(right);
  const similarity = nameSimilarity(leftName, rightName);
  if (leftName && leftName === rightName) reasons.push(reason('same-name', 25));
  else if (similarity >= 0.84) reasons.push(reason('similar-name', 15));

  const sameOrganization =
    Boolean(normalizeText(left.organization)) &&
    normalizeText(left.organization) === normalizeText(right.organization);
  if (sameOrganization) reasons.push(reason('same-organization', 15));

  const sameAddress = intersection(
    left.addresses.map(normalizeAddress),
    right.addresses.map(normalizeAddress),
  ).length;
  if (sameAddress) reasons.push(reason('same-address', 20));

  const sameBirthday =
    Boolean(left.birthday.trim()) && left.birthday.trim() === right.birthday.trim();
  if (sameBirthday) reasons.push(reason('same-birthday', 20));

  if (
    sharedWorkOnly &&
    similarity < 0.6 &&
    !sameUid &&
    !nonGenericEmail &&
    !sameBirthday &&
    !sameAddress
  )
    return undefined;

  const radicallyDifferent = hasRadicallyDifferentDetails(left, right, similarity);
  if (radicallyDifferent && sameUid) reasons.push(reason('conflicting-details', -35));

  const score = reasons.reduce((total, item) => total + item.weight, 0);
  const strongCount =
    Number(sameUid) + Number(nonGenericEmail) + Number(sharedPhones.length > 0 && !sharedWorkOnly);
  const supporting = reasons.some((item) =>
    ['same-name', 'similar-name', 'same-organization', 'same-address', 'same-birthday'].includes(
      item.code,
    ),
  );
  let confidence: DuplicateConfidence | undefined;
  if (exact) confidence = 'certain';
  else if (sameUid && !radicallyDifferent) confidence = 'certain';
  else if (strongCount >= 2) confidence = 'certain';
  else if (strongCount === 1 && (supporting || score >= 65)) confidence = 'likely';
  else if (strongCount === 1) confidence = 'possible';
  else if (score >= 45) confidence = 'likely';
  else if (score >= 30) confidence = 'possible';
  if (!confidence) return undefined;

  const ids = [left.id, right.id].sort() as [string, string];
  return {
    id: `${ids[0]}::${ids[1]}`,
    contactIds: ids,
    confidence,
    score,
    reasons,
    exact,
  };
}

function groupCandidates(
  contacts: Contact[],
  candidates: DuplicateCandidate[],
  maxGroupSize: number,
  diagnostics: DuplicateAnalysisDiagnostic[],
): DuplicateGroup[] {
  const idToIndex = new Map(contacts.map((contact, index) => [contact.id, index]));
  const parent = contacts.map((_contact, index) => index);
  const size = contacts.map(() => 1);
  const find = (value: number): number =>
    parent[value] === value ? value : (parent[value] = find(parent[value]!));
  for (const candidate of candidates) {
    const leftIndex = idToIndex.get(candidate.contactIds[0]);
    const rightIndex = idToIndex.get(candidate.contactIds[1]);
    if (leftIndex === undefined || rightIndex === undefined) continue;
    const leftRoot = find(leftIndex);
    const rightRoot = find(rightIndex);
    if (leftRoot === rightRoot) continue;
    if (size[leftRoot]! + size[rightRoot]! > maxGroupSize) {
      diagnostics.push({
        code: 'DUPLICATE_GROUP_LIMIT_REACHED',
        message: `A related-contact group was capped at ${maxGroupSize.toLocaleString()} records for safe review.`,
      });
      continue;
    }
    parent[rightRoot] = leftRoot;
    size[leftRoot] = size[leftRoot]! + size[rightRoot]!;
  }
  const groupedIds = new Map<number, string[]>();
  contacts.forEach((contact, index) => {
    const root = find(index);
    groupedIds.set(root, [...(groupedIds.get(root) ?? []), contact.id]);
  });
  return [...groupedIds.values()]
    .filter((contactIds) => contactIds.length > 1)
    .map((contactIds) => {
      const idSet = new Set(contactIds);
      const edges = candidates.filter(
        (candidate) => idSet.has(candidate.contactIds[0]) && idSet.has(candidate.contactIds[1]),
      );
      const confidence = edges.reduce<DuplicateConfidence>(
        (best, edge) =>
          confidenceRank[edge.confidence] > confidenceRank[best] ? edge.confidence : best,
        'possible',
      );
      const expectedPairs = (contactIds.length * (contactIds.length - 1)) / 2;
      const exact = edges.length === expectedPairs && edges.every((edge) => edge.exact);
      return {
        id: `group:${[...contactIds].sort().join('|')}`,
        contactIds,
        candidates: edges,
        confidence,
        exact,
      };
    })
    .sort((a, b) => confidenceRank[b.confidence] - confidenceRank[a.confidence]);
}

function buildIndex(
  contacts: Contact[],
  values: (contact: Contact) => string[],
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  contacts.forEach((contact, contactIndex) => {
    new Set(values(contact).filter(Boolean)).forEach((value) =>
      index.set(value, [...(index.get(value) ?? []), contactIndex]),
    );
  });
  return index;
}

function indexValueCount(...indexes: Map<string, number[]>[]): number {
  return indexes.reduce(
    (total, index) => total + [...index.values()].reduce((sum, values) => sum + values.length, 0),
    0,
  );
}

function pairKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function normalizedContactName(contact: Contact): string {
  const structured = [contact.givenName, ...contact.additionalNames, contact.familyName]
    .map(normalizeName)
    .filter(Boolean)
    .join(' ');
  return structured || normalizeName(contact.formattedName);
}

function normalizeAddress(address: ContactAddress): string {
  return [
    address.poBox,
    address.extended,
    address.street,
    address.locality,
    address.region,
    address.postalCode,
    address.country,
  ]
    .map(normalizeText)
    .join('|');
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeUid(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right.filter(Boolean));
  return [...new Set(left.filter((value) => value && rightSet.has(value)))];
}

function isGenericEmail(email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return /^(?:admin|contact|hello|help|info|office|sales|support|team|webmaster)$/.test(local);
}

function phoneItems(contact: Contact, normalized: string): ContactTypedValue[] {
  return contact.phones.filter((item) => normalizePhone(item.value) === normalized);
}

function isWorkValue(item: ContactTypedValue): boolean {
  return item.types.some((type) => ['work', 'office', 'main'].includes(type.toLocaleLowerCase()));
}

function hasRadicallyDifferentDetails(left: Contact, right: Contact, nameScore: number): boolean {
  const distinctEmails =
    left.emails.length > 0 &&
    right.emails.length > 0 &&
    !intersection(
      left.emails.map((item) => normalizeEmail(item.value)),
      right.emails.map((item) => normalizeEmail(item.value)),
    ).length;
  const distinctPhones =
    left.phones.length > 0 &&
    right.phones.length > 0 &&
    !intersection(
      left.phones.map((item) => normalizePhone(item.value)),
      right.phones.map((item) => normalizePhone(item.value)),
    ).length;
  return nameScore < 0.45 && distinctEmails && distinctPhones;
}

function reason(code: DuplicateReasonCode, weight: number): DuplicateReason {
  return { code, label: reasonLabels[code], weight };
}

function compareCandidates(left: DuplicateCandidate, right: DuplicateCandidate): number {
  return (
    confidenceRank[right.confidence] - confidenceRank[left.confidence] ||
    right.score - left.score ||
    left.id.localeCompare(right.id)
  );
}

function normalizedParameters(parameters: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([key]) => !['CHARSET', 'ENCODING'].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, [...values].map(normalizeText).sort()]),
  );
}

function vendorProperties(properties: ContactRawProperty[]): ContactRawProperty[] {
  const standard = new Set([
    'VERSION',
    'FN',
    'N',
    'ORG',
    'TITLE',
    'ROLE',
    'EMAIL',
    'TEL',
    'ADR',
    'URL',
    'BDAY',
    'ANNIVERSARY',
    'CATEGORIES',
    'NOTE',
    'NICKNAME',
    'GENDER',
    'UID',
    'KIND',
    'PHOTO',
    'LOGO',
    'GEO',
    'TZ',
    'PRODID',
    'REV',
  ]);
  return properties.filter((property) => !standard.has(property.name));
}

function propertySignature(property: ContactRawProperty): string {
  return JSON.stringify({
    group: property.group ?? '',
    name: property.name,
    value: property.value,
    parameters: normalizedParameters(property.parameters),
  });
}

function compareJson(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1)
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length]!;
}
