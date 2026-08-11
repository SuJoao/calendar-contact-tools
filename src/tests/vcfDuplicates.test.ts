import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeContactDuplicates,
  contactRichness,
  exactContactSignature,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../features/vcf/duplicateDetection';
import {
  applyContactMergePlan,
  combineOriginalContacts,
  createContactMergePlan,
  serializeResolvedContacts,
} from '../features/vcf/merge';
import type { Contact } from '../features/vcf/model';
import { parseVcf } from '../features/vcf/parser';
import {
  deriveResolvedContacts,
  emptyResolutionState,
  resetContactResolutions,
  resolveExactDuplicateGroups,
  setContactResolution,
  undoLastResolution,
} from '../features/vcf/resolutions';
import { foldVcfLine, serializeContact } from '../features/vcf/serializer';
import { shouldUseDuplicateWorker } from '../features/vcf/workers/client';
import { generatedVcf } from './helpers/contactFactory';

const duplicateFixture = (name: string): string =>
  readFileSync(resolve('src/tests/fixtures/vcf/duplicates', name), 'utf8');

const contacts = (name: string): Contact[] => parseVcf(duplicateFixture(name), name).contacts;

function withIdentity(contact: Contact, id: string): Contact {
  return { ...contact, id, originalIndex: Number(id.replace(/\D/g, '')) || 0 };
}

describe('indexed VCF duplicate analysis', () => {
  it('recognizes semantic exact duplicates despite source order/version differences', () => {
    const source = contacts('exact-duplicate.vcf');
    expect(exactContactSignature(source[0]!)).toBe(exactContactSignature(source[1]!));
    const analysis = analyzeContactDuplicates(source);
    expect(analysis.groups).toHaveLength(1);
    expect(analysis.groups[0]).toMatchObject({ exact: true, confidence: 'certain' });
    expect(analysis.exactDuplicateCopies).toBe(1);
  });

  it('treats matching non-generic email as an explainable strong signal', () => {
    const analysis = analyzeContactDuplicates(contacts('same-email.vcf'));
    expect(analysis.candidates[0]).toMatchObject({ confidence: 'likely' });
    expect(analysis.candidates[0]?.reasons.map((reason) => reason.code)).toContain('same-email');
  });

  it('matches formatted international phones while preserving country and extension', () => {
    expect(normalizePhone('+44 7700 900 101 ext 3')).toBe('+447700900101x3');
    expect(normalizePhone('+44-7700-900-101 x3')).toBe('+447700900101x3');
    expect(analyzeContactDuplicates(contacts('same-phone.vcf')).groups).toHaveLength(1);
  });

  it('does not equate a national number with an international number', () => {
    expect(normalizePhone('912345678')).not.toBe(normalizePhone('+351 912345678'));
  });

  it('keeps phone extensions meaningful', () => {
    expect(normalizePhone('+1 202 555 0100 x2')).not.toBe(normalizePhone('+1 202 555 0100 x3'));
  });

  it('normalizes email case/space but preserves provider-significant aliases and dots', () => {
    expect(normalizeEmail(' Person@Example.TEST ')).toBe('person@example.test');
    expect(normalizeEmail('person+news@example.test')).not.toBe(
      normalizeEmail('person@example.test'),
    );
    expect(normalizeEmail('first.last@example.test')).not.toBe(
      normalizeEmail('firstlast@example.test'),
    );
  });

  it('preserves apostrophes/hyphens while comparing accents case-insensitively', () => {
    expect(normalizeName(" Élise O'Connor-Smith ")).toBe("elise o'connor-smith");
  });

  it('does not propose same-name contacts with conflicting strong identifiers', () => {
    expect(
      analyzeContactDuplicates(contacts('same-name-different-person.vcf')).groups,
    ).toHaveLength(0);
  });

  it('does not propose unrelated employees sharing a work phone and organization', () => {
    expect(analyzeContactDuplicates(contacts('shared-company-phone.vcf')).groups).toHaveLength(0);
  });

  it('does not use a generic support email alone', () => {
    const base = contacts('same-name-different-person.vcf');
    const values = base.map((contact, index) => ({
      ...contact,
      id: `support-${index}`,
      formattedName: index ? 'Sales Department' : 'Support Department',
      fullName: index ? 'Sales Department' : 'Support Department',
      givenName: '',
      familyName: '',
      emails: [{ value: 'support@example.test', types: ['work'], parameters: {} }],
      phones: [],
    }));
    expect(analyzeContactDuplicates(values).groups).toHaveLength(0);
  });

  it('downgrades a conflicting same-UID pair and exposes the conflict reason', () => {
    const analysis = analyzeContactDuplicates(contacts('same-uid-conflict.vcf'));
    expect(analysis.candidates[0]?.confidence).toBe('possible');
    expect(analysis.candidates[0]?.reasons.map((reason) => reason.code)).toContain(
      'conflicting-details',
    );
  });

  it('uses supporting organization evidence for similar names without making it certain', () => {
    const analysis = analyzeContactDuplicates(contacts('similar-name.vcf'));
    expect(analysis.groups[0]?.confidence).toBe('possible');
    expect(analysis.candidates[0]?.reasons.map((reason) => reason.code)).toContain('similar-name');
  });

  it('keeps relatives sharing an address separate without another supporting signal', () => {
    expect(analyzeContactDuplicates(contacts('shared-address.vcf')).groups).toHaveLength(0);
  });

  it('treats a shared email and phone as certain while retaining different-UID conflicts', () => {
    expect(analyzeContactDuplicates(contacts('merge-conflicts.vcf')).groups[0]?.confidence).toBe(
      'certain',
    );
    const differentUid = contacts('different-uid.vcf');
    expect(analyzeContactDuplicates(differentUid).groups).toHaveLength(1);
    expect(createContactMergePlan(differentUid).conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'uid' })]),
    );
  });

  it('requires combined weak signals such as name and birthday', () => {
    const values = contacts('same-name-different-person.vcf').map((contact, index) => ({
      ...contact,
      id: `birthday-${index}`,
      formattedName: 'Taylor Reed',
      fullName: 'Taylor Reed',
      givenName: 'Taylor',
      familyName: 'Reed',
      birthday: '1990-04-12',
      title: index ? 'Researcher' : 'Analyst',
      emails: [],
      phones: [],
    }));
    const analysis = analyzeContactDuplicates(values);
    expect(analysis.groups[0]?.confidence).toBe('likely');
    expect(analysis.candidates[0]?.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(['same-name', 'same-birthday']),
    );
  });

  it('does not group accent-equivalent names or a common surname alone', () => {
    const base = contacts('same-name-different-person.vcf');
    const values = [
      {
        ...base[0]!,
        id: 'jose',
        formattedName: 'José Silva',
        fullName: 'José Silva',
        givenName: 'José',
        familyName: 'Silva',
        emails: [],
        phones: [],
      },
      {
        ...base[1]!,
        id: 'jose-plain',
        formattedName: 'Jose Silva',
        fullName: 'Jose Silva',
        givenName: 'Jose',
        familyName: 'Silva',
        emails: [],
        phones: [],
      },
      {
        ...base[1]!,
        id: 'other-silva',
        formattedName: 'Ana Silva',
        fullName: 'Ana Silva',
        givenName: 'Ana',
        familyName: 'Silva',
        emails: [],
        phones: [],
      },
    ];
    expect(analyzeContactDuplicates(values).groups).toHaveLength(0);
  });

  it('groups a strong/weak match chain without claiming every pair matched', () => {
    const base = contacts('same-email.vcf')[0]!;
    const values = [
      {
        ...base,
        id: 'a',
        formattedName: 'Record A',
        fullName: 'Record A',
        emails: [{ value: 'ab@example.test', types: [], parameters: {} }],
        phones: [],
      },
      {
        ...base,
        id: 'b',
        formattedName: 'Record B',
        fullName: 'Record B',
        emails: [{ value: 'ab@example.test', types: [], parameters: {} }],
        phones: [{ value: '+1 202 555 0100', types: ['cell'], parameters: {} }],
      },
      {
        ...base,
        id: 'c',
        formattedName: 'Record C',
        fullName: 'Record C',
        emails: [],
        phones: [{ value: '+1-202-555-0100', types: ['cell'], parameters: {} }],
      },
    ];
    const analysis = analyzeContactDuplicates(values);
    expect(analysis.groups).toHaveLength(1);
    expect(analysis.groups[0]?.contactIds).toHaveLength(3);
    expect(analysis.groups[0]?.candidates).toHaveLength(2);
    expect(analysis.groups[0]?.exact).toBe(false);
  });

  it('keeps disconnected duplicate clusters separate', () => {
    const first = contacts('same-email.vcf');
    const second = contacts('same-phone.vcf').map((contact, index) => ({
      ...contact,
      id: `phone-${index}`,
    }));
    expect(analyzeContactDuplicates([...first, ...second]).groups).toHaveLength(2);
  });

  it('builds a complete exact triangle deterministically', () => {
    const base = contacts('exact-duplicate.vcf')[0]!;
    const source = ['triangle-a', 'triangle-b', 'triangle-c'].map((id) =>
      withIdentity(structuredClone(base), id),
    );
    const group = analyzeContactDuplicates(source).groups[0]!;
    expect(group.contactIds).toHaveLength(3);
    expect(group.candidates).toHaveLength(3);
    expect(group.exact).toBe(true);
  });
});

describe('provenance-aware contact merging', () => {
  it('combines every readable source record while omitting malformed cards', () => {
    const parsed = parseVcf(
      readFileSync(resolve('src/tests/fixtures/vcf/malformed-contact.vcf'), 'utf8'),
      'malformed-contact.vcf',
    );
    const combined = combineOriginalContacts(parsed.contacts);
    expect(combined.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(combined).toContain('FN:Readable Before');
    expect(combined).toContain('FN:Readable After');
    expect(combined).not.toContain('THIS LINE HAS NO COLON');
  });

  it('records source provenance and proposes richness only as the default primary', () => {
    const source = contacts('merge-conflicts.vcf');
    const plan = createContactMergePlan(source);
    expect(plan.conflicts.find((conflict) => conflict.field === 'title')?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceFile: 'merge-conflicts.vcf', originalIndex: 0 }),
        expect.objectContaining({ sourceFile: 'merge-conflicts.vcf', originalIndex: 1 }),
      ]),
    );
    expect(
      contactRichness(source.find((contact) => contact.id === plan.primaryContactId)!),
    ).toBeGreaterThanOrEqual(contactRichness(source[0]!));
  });

  it('unions repeated fields and safely combines equivalent parameter metadata', () => {
    const source = contacts('merge-conflicts.vcf');
    const plan = createContactMergePlan(source, source[0]!.id);
    const merged = applyContactMergePlan(source, plan, { primaryContactId: source[0]!.id });
    expect(merged.emails.map((item) => item.value)).toEqual([
      'jane@example.test',
      'jane@work.example.test',
    ]);
    expect(merged.emails[0]?.types.sort()).toEqual(['home', 'work']);
    expect(merged.phones).toHaveLength(1);
    expect(merged.phones[0]?.types.sort()).toEqual(['cell', 'home']);
    expect(merged.phones[0]?.preference).toBeUndefined();
    expect(merged.warnings.some((warning) => warning.property === 'PREF')).toBe(true);
  });

  it('keeps addresses as whole repeated records and never creates hybrids', () => {
    const source = contacts('merge-conflicts.vcf');
    const merged = applyContactMergePlan(source, createContactMergePlan(source));
    expect(merged.addresses).toHaveLength(1);
    expect(merged.addresses[0]?.street).toBe('1 Fictional Street');
    expect(merged.addresses[0]?.locality).toBe('Lisbon');
  });

  it('requires explicit singular/note choices and follows the selected primary UID', () => {
    const source = contacts('merge-conflicts.vcf');
    const primary = source[1]!;
    const plan = createContactMergePlan(source, primary.id);
    const merged = applyContactMergePlan(source, plan, {
      primaryContactId: primary.id,
      singular: { title: source[0]!.id },
      notes: 'combine',
    });
    expect(merged.title).toBe('Senior Engineer');
    expect(merged.uid).toBe('desktop-jane@example.test');
    expect(merged.notes).toEqual(['Note from phone export.', 'Note from desktop export.']);
    expect(merged.organizationUnits).toEqual(['Research', 'Applied Systems']);
  });

  it('deduplicates identical notes but does not concatenate conflicts by default', () => {
    const source = contacts('merge-conflicts.vcf');
    const merged = applyContactMergePlan(source, createContactMergePlan(source, source[0]!.id));
    expect(merged.notes).toEqual(['Note from phone export.']);
  });

  it('preserves distinct vendor properties and omits binary media with diagnostics', () => {
    const source = contacts('merge-conflicts.vcf');
    source[0] = {
      ...source[0]!,
      photo: { kind: 'embedded', mediaType: 'image/jpeg', encoding: 'BASE64', estimatedBytes: 50 },
    };
    const merged = applyContactMergePlan(source, createContactMergePlan(source));
    expect(merged.rawProperties.filter((property) => property.name === 'X-CUSTOM')).toHaveLength(2);
    expect(merged.photo).toBeUndefined();
    expect(merged.warnings.some((warning) => warning.code === 'UNSUPPORTED_BINARY_FIELD')).toBe(
      true,
    );
  });

  it('deduplicates identical vendor properties and preserves uninterpreted conflicts', () => {
    const source = contacts('vendor-properties.vcf');
    const merged = applyContactMergePlan(source, createContactMergePlan(source));
    expect(merged.rawProperties.filter((property) => property.name === 'X-SHARED')).toHaveLength(1);
    expect(
      merged.rawProperties.filter((property) => property.name === 'X-FICTIONAL-ID'),
    ).toHaveLength(2);
  });

  it('unions missing and non-conflicting fields without synthesizing address hybrids', () => {
    const source = contacts('merge-fields.vcf');
    const merged = applyContactMergePlan(source, createContactMergePlan(source));
    expect(merged.emails).toHaveLength(2);
    expect(merged.phones).toHaveLength(2);
    expect(merged.addresses.map((address) => address.street)).toEqual([
      '8 Sample Road',
      '12 Fictional Avenue',
    ]);
    expect(merged.organization).toBe('Example Studio');
  });

  it('normalizes mixed input versions to vCard 4.0 and reparses modeled fields', () => {
    const source = contacts('mixed-versions.vcf');
    const merged = applyContactMergePlan(source, createContactMergePlan(source));
    const serialized = serializeContact(merged);
    expect(serialized).toContain('VERSION:4.0');
    const reparsed = parseVcf(serialized, 'roundtrip.vcf').contacts[0]!;
    expect(reparsed.formattedName).toBe('Renée Example');
    expect(reparsed.emails[0]?.value).toBe('renee@example.test');
    expect(reparsed.rawProperties.some((property) => property.name === 'X-ABLABEL')).toBe(true);
  });

  it('folds long Unicode lines to 75 octets and uses CRLF', () => {
    const source = contacts('merge-conflicts.vcf')[0]!;
    const serialized = serializeContact({ ...source, notes: [`${'é'.repeat(80)} 😀`] });
    const encoder = new TextEncoder();
    serialized
      .split('\r\n')
      .forEach((line) => expect(encoder.encode(line).byteLength).toBeLessThanOrEqual(75));
    expect(serialized).toContain('\r\n ');
    expect(foldVcfLine('FN:Short')).toEqual(['FN:Short']);
  });

  it('does not apply CSV formula protection to legitimate VCF text values', () => {
    const source = contacts('merge-conflicts.vcf')[0]!;
    expect(serializeContact({ ...source, title: '=Fictional title' })).toContain(
      'TITLE:=Fictional title',
    );
  });

  it('escapes hostile values and vendor payloads as inert serialized text', () => {
    const source = contacts('vendor-properties.vcf')[0]!;
    const serialized = serializeContact({
      ...source,
      formattedName: '<script>alert(1)</script>\r\nX-INJECTED:value',
      fullName: '<script>alert(1)</script>\r\nX-INJECTED:value',
      rawProperties: [
        {
          name: 'X-HTML',
          value: '<img src=x onerror=alert(1)>',
          rawValue: '<img src=x onerror=alert(1)>',
          parameters: {},
          line: 1,
        },
      ],
    });
    expect(serialized).toContain('FN:<script>alert(1)</script>\\nX-INJECTED:value');
    expect(serialized).toContain('X-HTML:<img src=x onerror=alert(1)>');
    expect(serialized).not.toContain('\r\nX-INJECTED:value');
  });
});

describe('derived duplicate resolution state', () => {
  it('derives exact resolution without mutating source contacts', () => {
    const source = contacts('exact-duplicate.vcf');
    const original = structuredClone(source);
    const analysis = analyzeContactDuplicates(source);
    const state = resolveExactDuplicateGroups(emptyResolutionState(), source, analysis.groups);
    expect(deriveResolvedContacts(source, analysis.groups, state)).toHaveLength(1);
    expect(source).toEqual(original);
  });

  it('supports keep, merge, undo, and reset as immutable state transitions', () => {
    const source = contacts('merge-conflicts.vcf');
    const analysis = analyzeContactDuplicates(source);
    const group = analysis.groups[0]!;
    const kept = setContactResolution(emptyResolutionState(), {
      groupId: group.id,
      type: 'keep-only',
      keptContactIds: [source[0]!.id],
    });
    expect(deriveResolvedContacts(source, analysis.groups, kept)).toHaveLength(1);
    const merged = setContactResolution(kept, {
      groupId: group.id,
      type: 'merge',
      mergedContactIds: source.map((contact) => contact.id),
      selections: { primaryContactId: source[1]!.id, notes: 'combine' },
    });
    expect(deriveResolvedContacts(source, analysis.groups, merged)).toHaveLength(1);
    expect(undoLastResolution(merged).resolutions[group.id]).toBeUndefined();
    expect(resetContactResolutions()).toEqual(emptyResolutionState());
  });

  it('serializes a derived export independently of UI state', () => {
    const source = contacts('exact-duplicate.vcf');
    const analysis = analyzeContactDuplicates(source);
    const state = resolveExactDuplicateGroups(emptyResolutionState(), source, analysis.groups);
    const serialized = serializeResolvedContacts(
      deriveResolvedContacts(source, analysis.groups, state),
    );
    expect(parseVcf(serialized).contacts).toHaveLength(1);
  });
});

describe('indexed duplicate scale and safeguards', () => {
  it('analyzes 1,000 unique contacts without all-pairs comparisons', () => {
    const source = parseVcf(generatedVcf(1_000), 'unique-1000.vcf').contacts;
    const analysis = analyzeContactDuplicates(source);
    expect(analysis.metrics.scoredPairs).toBeLessThan(100);
    expect(analysis.groups).toHaveLength(0);
    expect(shouldUseDuplicateWorker(source)).toBe(true);
  });

  it('analyzes 10,000 unique contacts without all-pairs comparisons', () => {
    const source = parseVcf(generatedVcf(10_000), 'unique.vcf').contacts;
    const analysis = analyzeContactDuplicates(source);
    expect(analysis.metrics.scoredPairs).toBeLessThan(100);
    expect(analysis.groups).toHaveLength(0);
    expect(shouldUseDuplicateWorker(source)).toBe(true);
  }, 30_000);

  it('finds 1,000 exact pairs inside 10,000 contacts using indexes', () => {
    const originals = parseVcf(generatedVcf(9_000), 'pairs.vcf').contacts.map((contact, index) =>
      withIdentity(contact, `original-${index}`),
    );
    const copies = originals
      .slice(0, 1_000)
      .map((contact, index) => withIdentity(structuredClone(contact), `copy-${index + 20_000}`));
    const analysis = analyzeContactDuplicates([...originals, ...copies]);
    expect(analysis.exactDuplicateCopies).toBe(1_000);
    expect(analysis.metrics.scoredPairs).toBe(1_000);
  }, 30_000);

  it('does not create millions of pairs for one organization', () => {
    const source = parseVcf(generatedVcf(5_000), 'organization.vcf').contacts.map(
      (contact, index) => ({
        ...contact,
        organization: 'One Fictional Organization',
        id: `org-${index}`,
      }),
    );
    expect(analyzeContactDuplicates(source).metrics.scoredPairs).toBe(0);
  }, 30_000);

  it('skips an enormous weak same-name bucket with a diagnostic', () => {
    const base = contacts('same-email.vcf')[0]!;
    const source = Array.from({ length: 2_000 }, (_unused, index) => ({
      ...base,
      id: `john-${index}`,
      formattedName: 'John Smith',
      fullName: 'John Smith',
      givenName: 'John',
      familyName: 'Smith',
      emails: [{ value: `john${index}@example.test`, types: [], parameters: {} }],
      phones: [],
      organization: '',
    }));
    const analysis = analyzeContactDuplicates(source);
    expect(analysis.metrics.scoredPairs).toBe(0);
    expect(analysis.metrics.skippedWeakBuckets).toBeGreaterThan(0);
    expect(
      analysis.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_BUCKET_TOO_LARGE'),
    ).toBe(true);
  });

  it('reports candidate cap truncation instead of silently stopping', () => {
    const base = contacts('same-email.vcf')[0]!;
    const source = Array.from({ length: 20 }, (_unused, index) => ({
      ...base,
      id: `cap-${index}`,
      emails: [{ value: 'shared@example.test', types: [], parameters: {} }],
      formattedName: `Unique ${index}`,
      fullName: `Unique ${index}`,
      givenName: `Unique ${index}`,
      familyName: `Family ${index}`,
    }));
    const analysis = analyzeContactDuplicates(source, { maxCandidates: 10 });
    expect(analysis.limited).toBe(true);
    expect(analysis.metrics.candidatePairs).toBe(10);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.code === 'DUPLICATE_CANDIDATE_LIMIT_REACHED',
      ),
    ).toBe(true);
  });
});
