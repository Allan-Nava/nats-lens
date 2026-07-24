// Serialize/parse the set of active subscription subjects for persistence
// (NL-8) and export/import (NL-18). Pure module, unit-tested.
import { isValidSubject } from './payload';

export interface SubscriptionsFile {
  version: 1;
  subjects: string[];
}

/** Serializes subjects to a versioned JSON document (sorted, deduped). */
export function serializeSubscriptions(subjects: string[]): string {
  const unique = [...new Set(subjects)].sort();
  const doc: SubscriptionsFile = { version: 1, subjects: unique };
  return JSON.stringify(doc, null, 2);
}

/**
 * Parses a subscriptions file. Keeps only valid NATS subjects (wildcards
 * allowed), deduped and sorted; invalid ones are reported in `errors`.
 */
export function parseSubscriptions(text: string): { subjects: string[]; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { subjects: [], errors: ['file is not valid JSON'] };
  }
  const list = (raw as { subjects?: unknown })?.subjects;
  if (!Array.isArray(list)) {
    return { subjects: [], errors: ['missing "subjects" array'] };
  }

  const subjects: string[] = [];
  const errors: string[] = [];
  for (const item of list) {
    const s = typeof item === 'string' ? item.trim() : '';
    if (s && isValidSubject(s, true)) subjects.push(s);
    else errors.push(`invalid subject: ${JSON.stringify(item)}`);
  }
  return { subjects: [...new Set(subjects)].sort(), errors };
}
