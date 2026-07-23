// Loads nats CLI contexts (~/.config/nats/context/*.json). Pure module —
// no vscode imports — so it can be unit-tested with plain Node.
// Secrets (password/token) are kept in memory for connecting but NEVER
// surfaced by redactedLabel().
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface NatsContext {
  name: string;
  description: string;
  url: string;
  user?: string;
  password?: string;
  token?: string;
  /** Path to a .creds file (JWT auth). */
  creds?: string;
  /** File the context was loaded from. */
  source: string;
  /** True if this is the nats CLI's currently selected context. */
  selected: boolean;
}

export function defaultContextsDir(): string {
  return path.join(os.homedir(), '.config', 'nats', 'context');
}

function selectedContextName(dir: string): string | null {
  // The nats CLI stores the selection in ../context.txt.
  const file = path.join(path.dirname(dir), 'context.txt');
  try {
    return fs.readFileSync(file, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function loadContexts(dir?: string): NatsContext[] {
  const base = dir && dir.length ? dir : defaultContextsDir();
  if (!fs.existsSync(base)) return [];
  const selected = selectedContextName(base);
  const contexts: NatsContext[] = [];
  for (const entry of fs.readdirSync(base).sort()) {
    if (!entry.endsWith('.json')) continue; // skip .bak and friends
    const full = path.join(base, entry);
    try {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
      const name = path.basename(entry, '.json');
      contexts.push({
        name,
        description: String(raw['description'] ?? ''),
        url: String(raw['url'] ?? ''),
        user: str(raw['user']),
        password: str(raw['password']),
        token: str(raw['token']),
        creds: str(raw['creds']),
        source: full,
        selected: name === selected,
      });
    } catch {
      // Unparsable context files are skipped silently.
    }
  }
  return contexts;
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : undefined;
}

/** Human label that never leaks credentials. */
export function redactedLabel(ctx: NatsContext): string {
  const auth = ctx.creds ? 'creds' : ctx.token ? 'token' : ctx.user ? `user ${ctx.user}` : 'no auth';
  return `${ctx.url} (${auth})`;
}
