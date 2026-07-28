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
  toBase64,
  toHex,
} from '../src/core/payload';
import { parseHeaders } from '../src/core/headers';
import { serializeSubscriptions, parseSubscriptions } from '../src/core/subscriptions';
import { validateJson, JsonSchema } from '../src/core/schema';
import { buildDashboardModel } from '../src/core/dashboard';
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

await test('subscriptions: serialize is versioned, sorted and deduped (NL-18)', () => {
  const text = serializeSubscriptions(['b.>', 'a.*', 'b.>']);
  const parsed = JSON.parse(text);
  assert.strictEqual(parsed.version, 1);
  assert.deepStrictEqual(parsed.subjects, ['a.*', 'b.>']);
});

await test('subscriptions: parse validates subjects and reports errors (NL-18)', () => {
  const ok = parseSubscriptions('{"version":1,"subjects":["a.*","logs.>"]}');
  assert.deepStrictEqual(ok.subjects, ['a.*', 'logs.>']);
  assert.strictEqual(ok.errors.length, 0);

  const bad = parseSubscriptions('{"version":1,"subjects":["ok.subj","bad subject","a.>.b"]}');
  assert.deepStrictEqual(bad.subjects, ['ok.subj']);
  assert.strictEqual(bad.errors.length, 2);

  assert.ok(parseSubscriptions('not json').errors.length > 0);
});

await test('schema: validateJson checks type, required, enum, items (NL-17)', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['a'],
    properties: { a: { type: 'string' }, n: { type: 'number' } },
  };
  assert.strictEqual(validateJson({ a: 'x', n: 1 }, schema).length, 0);
  assert.ok(validateJson({ n: 1 }, schema).some((e) => e.path === '$.a' && /required/.test(e.message)));
  assert.ok(validateJson({ a: 5 }, schema).some((e) => e.path === '$.a'));

  assert.strictEqual(validateJson('z', { type: 'string', enum: ['x', 'y'] }).length, 1);
  assert.strictEqual(validateJson([1, 'a'], { type: 'array', items: { type: 'number' } }).length, 1);
  assert.strictEqual(validateJson(3, { type: 'integer' }).length, 0);
  assert.strictEqual(validateJson(3.5, { type: 'integer' }).length, 1);
});

await test('payload: base64 and hex inspector encodings (NL-21)', () => {
  assert.strictEqual(toBase64(new TextEncoder().encode('hi')), 'aGk=');
  assert.strictEqual(toHex(new Uint8Array([0, 255, 16])), '00ff10');
  assert.strictEqual(toHex(new Uint8Array([])), '');
  assert.strictEqual(toBase64(new Uint8Array([])), '');
});

await test('dashboard: view-model carries lists and derives totals (NL-24/NL-28)', () => {
  const live = buildDashboardModel({
    connectionState: 'connected',
    context: 'prod',
    streams: [
      { name: 'ORDERS', messages: 12 },
      { name: 'EVENTS', messages: 3 },
    ],
    kvBuckets: ['CONFIG', 'FLAGS'],
    osBuckets: ['ASSETS'],
    subscriptions: 4,
  });
  assert.strictEqual(live.connected, true);
  assert.strictEqual(live.context, 'prod');
  assert.deepStrictEqual(live.streams.map((s) => s.name), ['ORDERS', 'EVENTS']);
  assert.deepStrictEqual(live.kvBuckets, ['CONFIG', 'FLAGS']);
  assert.deepStrictEqual(live.osBuckets, ['ASSETS']);
  assert.deepStrictEqual(live.totals, { streams: 2, kvBuckets: 2, osBuckets: 1, subscriptions: 4 });

  const down = buildDashboardModel({ connectionState: 'reconnecting', context: 'prod' });
  assert.strictEqual(down.connected, false);
  assert.deepStrictEqual(down.streams, []);
  assert.deepStrictEqual(down.totals, { streams: 0, kvBuckets: 0, osBuckets: 0, subscriptions: 0 });
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

  await test('integration: read stream message by seq and last-by-subject (NL-12)', async () => {
    client.publish('lens.js.event', 'e2'); // captured by LENS (lens.js.>) as seq 2
    await new Promise((r) => setTimeout(r, 300));

    const first = await client.getStreamMessage('LENS', { seq: 1 });
    assert.strictEqual(first.subject, 'lens.js.event');
    assert.strictEqual(new TextDecoder().decode(first.data), 'e1');

    const last = await client.getStreamMessage('LENS', { lastBySubject: 'lens.js.event' });
    assert.strictEqual(new TextDecoder().decode(last.data), 'e2');
    assert.ok(last.seq > first.seq, 'last-by-subject must return the newer sequence');
  });

  await test('integration: purge stream and delete consumer (NL-9)', async () => {
    const purged = await client.purgeStream('LENS');
    assert.ok(purged >= 1, 'expected at least one message purged');
    const streams = await client.streams();
    assert.strictEqual(streams.find((s) => s.name === 'LENS')!.messages, 0);

    const deleted = await client.deleteConsumer('LENS', 'worker');
    assert.strictEqual(deleted, true);
    assert.strictEqual((await client.consumers('LENS')).length, 0);
  });

  await test('integration: create a durable consumer (NL-13)', async () => {
    const created = await client.addConsumer('LENS', {
      durableName: 'reader',
      ackPolicy: 'explicit',
      deliverPolicy: 'all',
    });
    assert.strictEqual(created.name, 'reader');
    const names = (await client.consumers('LENS')).map((c) => c.name);
    assert.ok(names.includes('reader'), 'new consumer must appear in the list');
  });

  await test('integration: update a consumer config (NL-22)', async () => {
    const updated = await client.updateConsumer('LENS', 'reader', { maxDeliver: 5, ackWaitMs: 2000 });
    assert.strictEqual(updated.maxDeliver, 5);
    assert.strictEqual(updated.ackWaitMs, 2000);
  });

  await test('integration: KV bucket put/get/keys/list (NL-10)', async () => {
    const rev = await client.kvPut('CONFIG', 'greeting', 'ciao');
    assert.ok(rev >= 1, 'put must return a revision');
    const got = await client.kvGet('CONFIG', 'greeting');
    assert.strictEqual(got?.value, 'ciao');
    assert.strictEqual(got?.revision, rev);

    await client.kvPut('CONFIG', 'lang', 'it');
    const keys = await client.kvKeys('CONFIG');
    assert.deepStrictEqual(keys.sort(), ['greeting', 'lang']);

    const buckets = (await client.kvBuckets()).map((b) => b.bucket);
    assert.ok(buckets.includes('CONFIG'), 'bucket must be listed');
    assert.strictEqual(await client.kvGet('CONFIG', 'missing'), null);
  });

  await test('integration: Object Store put/get/list/buckets (NL-23)', async () => {
    const data = new TextEncoder().encode('blob-data');
    const info = await client.osPut('ASSETS', 'file.txt', data);
    assert.strictEqual(info.name, 'file.txt');
    assert.ok(info.size >= data.length);

    const got = await client.osGet('ASSETS', 'file.txt');
    assert.strictEqual(new TextDecoder().decode(got!), 'blob-data');

    const names = (await client.osList('ASSETS')).map((o) => o.name);
    assert.ok(names.includes('file.txt'));

    const buckets = (await client.osBuckets()).map((b) => b.bucket);
    assert.ok(buckets.includes('ASSETS'), 'bucket must be listed');
    assert.strictEqual(await client.osGet('ASSETS', 'missing'), null);
  });

  await test('integration: request gets an error without a responder', async () => {
    await assert.rejects(() => client.request('lens.nobody.home', 'ping', 500));
  });

  // NL-7: killing the server must flip the client off "connected" and, once
  // the (bounded) reconnect attempts are exhausted, settle on "closed".
  // Kept last: it takes the throwaway server down.
  await test('integration: server drop → reconnecting → closed (NL-7)', async () => {
    await client.connectTo(
      { name: 'test', description: '', url: `nats://127.0.0.1:${port}`, source: '(test)', selected: false },
      5000,
      { maxReconnectAttempts: 3, reconnectTimeWait: 150 }
    );
    const events: string[] = [];
    client.onStatus((s) => events.push(s));
    assert.strictEqual(client.connectionState, 'connected');

    const waitFor = async (pred: () => boolean, ms = 6000) => {
      for (let i = 0; i < ms / 50 && !pred(); i++) await new Promise((r) => setTimeout(r, 50));
    };

    server!.kill('SIGKILL');
    await waitFor(() => client.connectionState === 'reconnecting');
    assert.strictEqual(client.connectionState, 'reconnecting');
    assert.ok(events.includes('reconnecting'), 'expected a reconnecting status event');

    await waitFor(() => client.connectionState === 'closed');
    assert.strictEqual(client.connectionState, 'closed', 'must settle on closed after reconnects fail');
    assert.ok(events.includes('closed'), 'expected a closed status event');
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
