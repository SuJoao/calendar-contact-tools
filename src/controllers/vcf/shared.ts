import type { Contact, VcfDiagnostic } from '../../features/vcf/model';
import { parseContactInputs } from '../../features/vcf/workers/client';
import { readFileText } from '../../utils/files';

export interface LoadedContacts {
  contacts: Contact[];
  diagnostics: VcfDiagnostic[];
  skippedContacts: number;
}

export async function loadContacts(files: File[]): Promise<LoadedContacts> {
  const inputs = await Promise.all(
    files.map(async (file) => ({ name: file.name, text: await readFileText(file) })),
  );
  const parsed = await parseContactInputs(inputs);
  const contacts = parsed.flatMap((item, sourceIndex) =>
    item.contacts.map((contact) => ({
      ...contact,
      sourceIndex,
      id: stableContactId(contact, sourceIndex),
    })),
  );
  const diagnostics = parsed.flatMap((item) => item.diagnostics);
  if (!contacts.length)
    throw new Error(
      diagnostics[0]?.message ?? 'The selected files do not contain a readable contact.',
    );
  return {
    contacts,
    diagnostics,
    skippedContacts: parsed.reduce((total, item) => total + item.skippedContacts, 0),
  };
}

function stableContactId(contact: Contact, sourceIndex: number): string {
  const identity = contact.uid.trim() || contact.formattedName.trim() || 'unnamed';
  return `${sourceIndex}:${contact.originalIndex}:${identity}`;
}

export function vcfDiagnosticMessages(diagnostics: VcfDiagnostic[]): string[] {
  const seen = new Set<string>();
  return diagnostics
    .map((item) => {
      const location = [item.sourceFile, item.line ? `line ${item.line}` : '']
        .filter(Boolean)
        .join(', ');
      return `${item.message}${location ? ` (${location})` : ''}`;
    })
    .filter((message) => {
      if (seen.has(message)) return false;
      seen.add(message);
      return true;
    });
}
