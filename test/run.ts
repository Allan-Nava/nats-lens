// Unit tests (pure core) + integration test against a throwaway local
// nats-server (skipped when the binary is not available).
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { connect } from 'nats';
import { loadContexts, redactedLabel } from '../src/core/contexts';
import {
  renderPayload,
  formatMessageLine,
  isValidSubject,
  subjectMatches,
  previewPayload,
} from '../src/core/payload';
import { parseHeaders } from '../src/core/headers';
import { NatsClient } from '../src/core/client';

let failures = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok   ${name}`))
    .catch((err) => {
      failures++;
      console.error(`FAIL ${name}\n     ${err}`);
    });
}

async function main(): Promise<void> {
// --- contexts ----------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'natslens-'));
const ctxDir = path.join(tmp, 'context');
fs.mkdirSync(ctxDir, { recursive: true });
fs.writeFileSync(
  path.join(ctxDir, 'prod.json'),
  JSON.stringify({ description: 'prod cluster', url: 'nats://10.0.0.1:4222', user: 'svc', password: 'hunter2' })
);
fs.writeFileSync(path.join(ctxDir, 'local.json'), JSON.stringify({ url: 'nats://127.0.0.1:4222' }));
fs.writeFileSync(path.join(ctxDir, 'broken.json'), '{not json');
fs.writeFileSync(path.join(ctxDir, 'old.json.bak'), '{}');
fs.writeFileSync(path.join(tmp, 'context.txt'), 'prod\n');

await test('contexts: parse, selection, skip broken and .bak', () => {
  const ctxs = loadContexts(ctxDir);
  assert.strictEqual(ctxs.length, 2);
  const prod = ctxs.find((c) => c.name === 'prod')!;
  assert.strictEqual(prod.selected, true);
  assert.strictEqual(prod.user, 'svc');
});

await test('contexts: redacted label never leaks the password', () => {
  const prod = loadContexts(ctxDir).find((c) => c.name === 'prod')!;
  const label = redactedLabel(prod);
  assert.ok(!label.includes('hunter2'), 'password leaked!');
  assert.ok(label.includes('user svc'));
});

// --- payload -----------------------------------------------------------------
await test('payload: JSON pretty-printed, text passthrough, binary detected', () => {
  const enc = new TextEncoder();
  assert.strictEqual(renderPayload(enc.encode('{"a":1}')).kind, 'json');
  assert.strictEqual(renderPayload(enc.encode('hello')).kind, 'text');
  assert.strictEqual(renderPayload(new Uint8Array([0xff, 0xfe, 0x00, 0x81, 0x83, 0x90])).kind, 'binary');
});

await test('payload: message line contains subject and timestamp', () => {
  const line = formatMessageLine('foo.bar', new TextEncoder().encode('x'));
  assert.ok(line.includes('foo.bar'));
  assert.ok(/\[\d{4}-\d{2}-\d{2}T/.test(line));
});

await test('subjects: validation rules', () => {
  assert.ok(isValidSubject('a.b.c'));
  assert.ok(isValidSubject('a.*.c'));
  assert.ok(isValidSubject('a.b.>'));
  assert.ok(!isValidSubject('a.>.c'));
  assert.ok(!isValidSubject('a..c'));
  assert.ok(!isValidSubject('a b'));
  assert.ok(!isValidSubject('a.*', false));
});

// --- headers (NL-14) ---------------------------------------------------------
await test('headers: parse k=v and k: v, multi-value, skip blanks, report errors', () => {
  const { headers, errors } = parseHeaders('X-Trace = abc\nRole: admin\nRole: ops\n\n= bad\nnosep');
  assert.deepStrictEqual(headers['X-Trace'], ['abc']);
  assert.deepStrictEqual(headers['Role'], ['admin', 'ops']);
  assert.strictEqual(errors.length, 2); // '= bad' (empty key) + 'nosep' (no separator)
});

// --- subject matching (NL-15) ------------------------------------------------
await test('subjects: wildcard matching (* and >)', () => {
  assert.ok(subjectMatches('a.b.c', 'a.b.c'));
  assert.ok(subjectMatches('a.*.c', 'a.x.c'));
  assert.ok(!subjectMatches('a.*.c', 'a.x.y'));
  assert.ok(subjectMatches('a.>', 'a.b.c.d'));
  assert.ok(!subjectMatches('a.>', 'a')); // '>' needs at least one trailing token
  assert.ok(!subjectMatches('a.b', 'a.b.c'));
  assert.ok(subjectMatches('>', 'anything.here'));
});

// --- payload preview (NL-16) -------------------------------------------------
await test('payload: preview truncates large payloads with size note', () => {
  const small = previewPayload(new TextEncoder().encode('hello'));
  assert.strictEqual(small.truncated, false);
  assert.strictEqual(small.text, 'hello');
  const big = previewPayload(new TextEncoder().encode('x'.repeat(5000)), 100);
  assert.ok(big.truncated);
  assert.ok(big.text.length < 5000);
  assert.ok(/5000/.test(big.text)); // total byte size noted in the preview
});

await test('payload: message line bounds large payloads (NL-16)', () => {
  const line = formatMessageLine('big.subj', new TextEncoder().encode('y'.repeat(9000)), undefined, 100);
  assert.ok(line.includes('troncato'));
  assert.ok(line.length < 9000);
});

// --- integration: throwaway nats-server --------------------------------------
const bin = process.env.NATS_SERVER_BIN || 'nats-server';
let server: ChildProcess | null = null;
const port = 42000 + Math.floor(Math.random() * 1000);

async function waitForPort(p: number, tries = 50): Promise<boolean> {
  const net = await import('net');
  for (let i = 0; i < tries; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ port: p, host: '127.0.0.1' }, () => {
        sock.end();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

try {
  server = spawn(bin, ['-p', String(port), '-js', '-sd', path.join(tmp, 'js')], { stdio: 'ignore' });
  const up = await waitForPort(port);
  if (!up) throw new Error('nats-server did not start');

  const client = new NatsClient();
  await test('integration: connect + rtt + server info', async () => {
    await client.connectTo({
      name: 'test',
      description: '',
      url: `nats://127.0.0.1:${port}`,
      source: '(test)',
      selected: false,
    });
    assert.ok(client.connected);
    assert.ok((await client.rtt()) >= 0);
    assert.ok(client.serverInfo()!.version.length > 0);
  });

  await test('integration: pub/sub roundtrip', async () => {
    const received: string[] = [];
    client.subscribe('lens.test.*', (subj, data) => {
      received.push(`${subj}:${new TextDecoder().decode(data)}`);
    });
    await new Promise((r) => setTimeout(r, 100));
    client.publish('lens.test.a', 'hello');
    client.publish('lens.test.b', '{"n":1}');
    await new Promise((r) => setTimeout(r, 300));
    assert.deepStrictEqual(received.sort(), ['lens.test.a:hello', 'lens.test.b:{"n":1}']);
  });

  await test('integration: publish carries headers (NL-14)', async () => {
    const seen: Record<string, string[]> = {};
    client.subscribe('lens.hdr', (_s, _d, h) => {
      if (h) for (const [k, v] of h) seen[k] = v;
    });
    await new Promise((r) => setTimeout(r, 100));
    client.publish('lens.hdr', 'x', { 'X-Trace': ['abc'] });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepStrictEqual(seen['X-Trace'], ['abc']);
  });

  await test('integration: JetStream streams + consumers listing', async () => {
    const nc = await connect({ servers: `nats://127.0.0.1:${port}` });
    const jsm = await nc.jetstreamManager();
    await jsm.streams.add({ name: 'LENS', subjects: ['lens.js.>'] });
    await jsm.consumers.add('LENS', { durable_name: 'worker', ack_policy: 'explicit' as never });
    const js = nc.jetstream();
    await js.publish('lens.js.event', new TextEncoder().encode('e1'));
    await nc.close();

    const streams = await client.streams();
    assert.strictEqual(streams.length, 1);
    assert.strictEqual(streams[0].name, 'LENS');
    assert.strictEqual(streams[0].messages, 1);
    const consumers = await client.consumers('LENS');
    assert.strictEqual(consumers[0].name, 'worker');
    assert.strictEqual(consumers[0].pending, 1);
  });

  await test('integration: request gets an error without a responder', async () => {
    await assert.rejects(() => client.request('lens.nobody.home', 'ping', 500));
  });

  await client.disconnect();
} catch (err) {
  console.log(`skip integration tests (${err})`);
} finally {
  server?.kill();
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures > 0) {
  console.error(`\n${failures} test failed`);
  process.exit(1);
}
console.log('\nall tests passed');
}

void main();
