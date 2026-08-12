// Pure helpers for the native tree view: rich tooltips (NL-30) and the
// client-side filter predicate (NL-31). No vscode imports — unit-tested.
import type { StreamSummary, ConsumerSummary } from './client';
import type { StreamRow } from './dashboard';

export type StreamSort = 'name' | 'messages';

/** Sorts streams by name (ascending) or message count (descending). Pure — returns a new array. */
export function sortStreams<T extends StreamRow>(rows: T[], by: StreamSort): T[] {
  const copy = [...rows];
  if (by === 'messages') copy.sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name));
  else copy.sort((a, b) => a.name.localeCompare(b.name));
  return copy;
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Markdown tooltip for a JetStream stream node. */
export function streamTooltip(s: StreamSummary): string {
  return [
    `**${s.name}**`,
    '',
    `- Messages: ${s.messages}`,
    `- Size: ${prettyBytes(s.bytes)}`,
    `- Consumers: ${s.consumers}`,
    `- Subjects: ${s.subjects.join(', ') || '—'}`,
  ].join('\n');
}

/** Markdown tooltip for a JetStream consumer node. */
export function consumerTooltip(c: ConsumerSummary): string {
  return [
    `**${c.name}** on \`${c.stream}\``,
    '',
    `- Pending: ${c.pending}`,
    `- Ack pending: ${c.ackPending}`,
    `- Delivered: ${c.delivered}`,
  ].join('\n');
}

/** Case-insensitive substring match; an empty query matches everything. */
export function matchesFilter(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q.length === 0 || text.toLowerCase().includes(q);
}
