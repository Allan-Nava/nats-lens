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
  headers?: Iterable<[string, string[]]>,
  maxChars = 4000
): string {
  const ts = new Date().toISOString();
  const { text, kind } = previewPayload(data, maxChars);
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

/**
 * Tests whether `subject` matches a NATS subscription `pattern`.
 * `*` matches exactly one token; `>` (must be last) matches one or more
 * trailing tokens. Used to filter a live subscription's Output client-side.
 */
export function subjectMatches(pattern: string, subject: string): boolean {
  const p = pattern.split('.');
  const s = subject.split('.');
  for (let i = 0; i < p.length; i++) {
    const tok = p[i];
    if (tok === '>') return s.length > i;
    if (i >= s.length) return false;
    if (tok === '*') continue;
    if (tok !== s[i]) return false;
  }
  return p.length === s.length;
}

/**
 * Renders a payload bounded to `maxChars` for the Output channel, so a huge
 * message never floods it. Binary payloads are already compact and pass through.
 */
export function previewPayload(
  data: Uint8Array,
  maxChars = 2000
): { text: string; truncated: boolean; kind: 'json' | 'text' | 'binary' } {
  const { text, kind } = renderPayload(data);
  if (kind === 'binary' || text.length <= maxChars) {
    return { text, truncated: false, kind };
  }
  return {
    text: `${text.slice(0, maxChars)}\n… (troncato, ${data.byteLength} byte totali)`,
    truncated: true,
    kind,
  };
}

/** Builds a title + rendered body for a stored JetStream message (NL-33). */
export function formatStoredMessage(msg: {
  subject: string;
  seq: number;
  time: string;
  data: Uint8Array;
  headers?: [string, string[]][];
}): { title: string; body: string } {
  const hdr = msg.headers?.map(([k, v]) => `${k}=${v.join(',')}`).join(' ') ?? '';
  const title = `${msg.subject} · seq ${msg.seq} · ${msg.time}${hdr ? ` · {${hdr}}` : ''}`;
  return { title, body: renderPayload(msg.data).text };
}

/** Base64 encoding of a raw payload (inspector view, NL-21). */
export function toBase64(data: Uint8Array): string {
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  if (typeof btoa === 'function') return btoa(bin);
  // Node fallback without referencing the Buffer type, so this pure module
  // still typechecks under the DOM-only webview config.
  const g = globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  return g.Buffer ? g.Buffer.from(bin, 'binary').toString('base64') : bin;
}

/** Lowercase hex encoding of a raw payload (inspector view, NL-21). */
export function toHex(data: Uint8Array): string {
  let out = '';
  for (const b of data) out += b.toString(16).padStart(2, '0');
  return out;
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
