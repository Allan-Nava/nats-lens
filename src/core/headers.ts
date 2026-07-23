// Parsing of user-typed NATS message headers. Pure module, unit-tested.

export interface ParsedHeaders {
  headers: Record<string, string[]>;
  errors: string[];
}

/**
 * Parses header lines in `k=v` or `k: v` form (first separator wins).
 * Blank lines are ignored; repeated keys accumulate into a multi-value array.
 * Lines without a separator, or with an empty/whitespace key, are reported in `errors`.
 */
export function parseHeaders(input: string): ParsedHeaders {
  const headers: Record<string, string[]> = {};
  const errors: string[] = [];

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const iEq = line.indexOf('=');
    const iColon = line.indexOf(':');
    const idx =
      iEq === -1 ? iColon : iColon === -1 ? iEq : Math.min(iEq, iColon);
    if (idx === -1) {
      errors.push(`no separator (use k=v or k: v): "${line}"`);
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key || /\s/.test(key)) {
      errors.push(`invalid header key: "${line}"`);
      continue;
    }

    (headers[key] ??= []).push(value);
  }

  return { headers, errors };
}
