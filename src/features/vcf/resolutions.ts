import { contactRichness, type DuplicateGroup } from './duplicateDetection';
import {
  applyContactMergePlan,
  createContactMergePlan,
  type ContactMergeSelections,
} from './merge';
import type { Contact } from './model';

export type ContactResolution =
  | { groupId: string; type: 'keep-all' }
  | { groupId: string; type: 'keep-only'; keptContactIds: string[] }
  | {
      groupId: string;
      type: 'merge';
      mergedContactIds: string[];
      selections: ContactMergeSelections;
    };

export interface ContactResolutionState {
  resolutions: Record<string, ContactResolution>;
  history: string[];
}

export function emptyResolutionState(): ContactResolutionState {
  return { resolutions: {}, history: [] };
}

export function setContactResolution(
  state: ContactResolutionState,
  resolution: ContactResolution,
): ContactResolutionState {
  return {
    resolutions: { ...state.resolutions, [resolution.groupId]: resolution },
    history: [...state.history.filter((id) => id !== resolution.groupId), resolution.groupId],
  };
}

export function undoLastResolution(state: ContactResolutionState): ContactResolutionState {
  const groupId = state.history.at(-1);
  if (!groupId) return state;
  const resolutions = { ...state.resolutions };
  delete resolutions[groupId];
  return { resolutions, history: state.history.slice(0, -1) };
}

export function resetContactResolutions(): ContactResolutionState {
  return emptyResolutionState();
}

export function resolveExactDuplicateGroups(
  state: ContactResolutionState,
  contacts: Contact[],
  groups: DuplicateGroup[],
): ContactResolutionState {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return groups
    .filter((group) => group.exact)
    .reduce((current, group) => {
      const primary = group.contactIds
        .map((id) => byId.get(id))
        .filter((contact): contact is Contact => Boolean(contact))
        .sort(
          (left, right) =>
            contactRichness(right) - contactRichness(left) ||
            left.sourceIndex - right.sourceIndex ||
            left.originalIndex - right.originalIndex,
        )[0];
      return primary
        ? setContactResolution(current, {
            groupId: group.id,
            type: 'keep-only',
            keptContactIds: [primary.id],
          })
        : current;
    }, state);
}

export function deriveResolvedContacts(
  sourceContacts: Contact[],
  groups: DuplicateGroup[],
  state: ContactResolutionState,
): Contact[] {
  const groupByContact = new Map<string, DuplicateGroup>();
  groups.forEach((group) =>
    group.contactIds.forEach((contactId) => groupByContact.set(contactId, group)),
  );
  const sourceById = new Map(sourceContacts.map((contact) => [contact.id, contact]));
  const emittedGroups = new Set<string>();
  const output: Contact[] = [];
  for (const contact of sourceContacts) {
    const group = groupByContact.get(contact.id);
    if (!group) {
      output.push(contact);
      continue;
    }
    if (emittedGroups.has(group.id)) continue;
    emittedGroups.add(group.id);
    const groupContacts = group.contactIds
      .map((id) => sourceById.get(id))
      .filter((item): item is Contact => Boolean(item));
    const resolution = state.resolutions[group.id];
    if (!resolution || resolution.type === 'keep-all') {
      output.push(...groupContacts);
      continue;
    }
    if (resolution.type === 'keep-only') {
      const kept = new Set(resolution.keptContactIds);
      output.push(...groupContacts.filter((item) => kept.has(item.id)));
      continue;
    }
    const mergedIds = new Set(resolution.mergedContactIds);
    const selected = groupContacts.filter((item) => mergedIds.has(item.id));
    const unselected = groupContacts.filter((item) => !mergedIds.has(item.id));
    if (selected.length > 1) {
      const plan = createContactMergePlan(selected, resolution.selections.primaryContactId);
      output.push(applyContactMergePlan(selected, plan, resolution.selections));
    } else output.push(...selected);
    output.push(...unselected);
  }
  return output;
}

export function resolvedGroupCount(state: ContactResolutionState): number {
  return Object.keys(state.resolutions).length;
}
