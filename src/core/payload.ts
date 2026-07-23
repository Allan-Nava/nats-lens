// Payload rendering helpers. Pure module, unit-tested.

/** Decodes a message payload: pretty JSON when possible, plain text otherwise. */
export function renderPayload(data: Uint8Array): { text: string; kind: 'json' | 'text' | 'binary' } {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), kind: 'json' };
    } catch {
      /* fall through */
    }
  }
  // Heuristic: lots of replacement chars → binary.
  const bad = (text.match(/�/g) || []).length;
  if (text.length > 0 && bad / text.length > 0.1) {
    return { text: `<binary ${data.byteLength} bytes>`, kind: 'binary' };
  }
  return { text, kind: 'text' };
}

/** One log line for a received message. */
export function formatMessageLine(
  subject: string,
  data: Uint8Array,
  headers?: Iterable<[string, string[]]>
): string {
  const ts = new Date().toISOString();
  const { text, kind } = renderPayload(data);
  const hdr = headers
    ? [...headers].map(([k, v]) => `${k}=${v.join(',')}`).join(' ')
    : '';
  const head = `[${ts}] ${subject}${hdr ? `  {${hdr}}` : ''}`;
  return kind === 'json' ? `${head}\n${indent(text)}` : `${head}  ${text}`;
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
}

/** Validates a NATS subject (tokens separated by dots, * and > wildcards). */
export function isValidSubject(subject: string, allowWildcards = true): boolean {
  if (!subject.length || /\s/.test(subject)) return false;
  const tokens = subject.split('.');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.length) return false;
    if (t === '*') {
      if (!allowWildcards) return false;
    } else if (t === '>') {
      if (!allowWildcards || i !== tokens.length - 1) return false;
    } else if (/[*>]/.test(t)) {
      return false;
    }
  }
  return true;
}
