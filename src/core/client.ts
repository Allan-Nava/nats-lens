// Thin wrapper around the nats.js client: one active connection, JetStream
// introspection, pub/sub/request. Pure module (no vscode imports) so the
// integration test can drive it against a throwaway nats-server.
import {
  connect,
  credsAuthenticator,
  Events,
  headers as natsHeaders,
  MsgHdrs,
  NatsConnection,
  Subscription,
  StringCodec,
} from 'nats';
import * as fs from 'fs';
import { NatsContext } from './contexts';

const sc = StringCodec();

function toMsgHdrs(h: Record<string, string[]>): MsgHdrs {
  const mh = natsHeaders();
  for (const [k, values] of Object.entries(h)) {
    for (const v of values) mh.append(k, v);
  }
  return mh;
}

export interface StreamSummary {
  name: string;
  subjects: string[];
  messages: number;
  bytes: number;
  consumers: number;
  retention: 'limits' | 'interest' | 'workqueue';
  storage: 'file' | 'memory';
}

export interface StreamConfigInput {
  name: string;
  subjects: string[];
  retention?: 'limits' | 'interest' | 'workqueue';
  storage?: 'file' | 'memory';
  maxMsgs?: number;
  maxBytes?: number;
  maxAgeMs?: number;
}

export interface ConsumerSummary {
  name: string;
  stream: string;
  pending: number;
  delivered: number;
  ackPending: number;
}

export interface KvBucketSummary {
  bucket: string;
  values: number;
  bytes: number;
}

export interface OsBucketSummary {
  bucket: string;
  bytes: number;
}

export interface ObjectSummary {
  name: string;
  size: number;
}

export interface NewConsumer {
  durableName: string;
  ackPolicy?: 'explicit' | 'none' | 'all';
  deliverPolicy?: 'all' | 'new' | 'last';
  filterSubject?: string;
}

export interface StoredMessage {
  seq: number;
  subject: string;
  time: string;
  data: Uint8Array;
  headers?: [string, string[]][];
}

export type ConnState = 'connected' | 'reconnecting' | 'closed';

export class NatsClient {
  private nc: NatsConnection | null = null;
  context: NatsContext | null = null;
  private state: ConnState = 'closed';
  private statusListener?: (state: ConnState, detail?: string) => void;

  get connected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }

  /** Live connection state, driven by nats.js status events (see NL-7). */
  get connectionState(): ConnState {
    return this.state;
  }

  /** Registers a single listener notified on every connection-state change. */
  onStatus(cb: (state: ConnState, detail?: string) => void): void {
    this.statusListener = cb;
  }

  private setState(state: ConnState, detail?: string): void {
    if (state === this.state) return;
    this.state = state;
    this.statusListener?.(state, detail);
  }

  async connectTo(
    ctx: NatsContext,
    timeoutMs = 5000,
    reconnect?: { maxReconnectAttempts?: number; reconnectTimeWait?: number }
  ): Promise<void> {
    await this.disconnect();
    const nc = await connect({
      servers: ctx.url,
      user: ctx.user,
      pass: ctx.password,
      token: ctx.token,
      authenticator: ctx.creds && fs.existsSync(ctx.creds)
        ? credsAuthenticator(fs.readFileSync(ctx.creds))
        : undefined,
      timeout: timeoutMs,
      maxReconnectAttempts: reconnect?.maxReconnectAttempts,
      reconnectTimeWait: reconnect?.reconnectTimeWait,
      name: 'nats-lens (vscode)',
    });
    this.nc = nc;
    this.context = ctx;
    this.setState('connected');
    void this.watchStatus(nc);
    // When this connection closes for good (reconnect attempts exhausted, or
    // an explicit close), flip to `closed` — unless a newer connection replaced it.
    void nc.closed().then(() => {
      if (this.nc === nc) {
        this.nc = null;
        this.context = null;
        this.setState('closed');
      }
    });
  }

  /** Consumes the connection's status stream and mirrors it into `state`. */
  private async watchStatus(nc: NatsConnection): Promise<void> {
    for await (const s of nc.status()) {
      if (nc !== this.nc) return; // superseded by a newer connection
      if (s.type === Events.Disconnect) this.setState('reconnecting', String(s.data ?? ''));
      else if (s.type === Events.Reconnect) this.setState('connected', String(s.data ?? ''));
    }
  }

  async disconnect(): Promise<void> {
    const nc = this.nc;
    this.nc = null;
    this.context = null;
    if (nc && !nc.isClosed()) await nc.close();
    this.setState('closed');
  }

  async rtt(): Promise<number> {
    this.assertConnected();
    return this.nc!.rtt();
  }

  serverInfo(): { server: string; version: string } | null {
    const info = this.nc?.info;
    if (!info) return null;
    return { server: info.server_name ?? '', version: info.version ?? '' };
  }

  publish(subject: string, payload: string, headers?: Record<string, string[]>): void {
    this.assertConnected();
    const opts =
      headers && Object.keys(headers).length ? { headers: toMsgHdrs(headers) } : undefined;
    this.nc!.publish(subject, sc.encode(payload), opts);
  }

  async request(subject: string, payload: string, timeoutMs = 3000): Promise<string> {
    this.assertConnected();
    const reply = await this.nc!.request(subject, sc.encode(payload), { timeout: timeoutMs });
    return sc.decode(reply.data);
  }

  subscribe(
    subject: string,
    onMessage: (subject: string, data: Uint8Array, headers?: Iterable<[string, string[]]>) => void
  ): Subscription {
    this.assertConnected();
    const sub = this.nc!.subscribe(subject);
    void (async () => {
      for await (const msg of sub) {
        onMessage(msg.subject, msg.data, msg.headers ?? undefined);
      }
    })();
    return sub;
  }

  async streams(): Promise<StreamSummary[]> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const result: StreamSummary[] = [];
    for await (const si of jsm.streams.list()) {
      result.push({
        name: si.config.name,
        subjects: si.config.subjects ?? [],
        messages: si.state.messages,
        bytes: si.state.bytes,
        consumers: si.state.consumer_count,
        retention: String(si.config.retention ?? 'limits') as StreamSummary['retention'],
        storage: String(si.config.storage ?? 'file') as StreamSummary['storage'],
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async addStream(cfg: StreamConfigInput): Promise<StreamSummary> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    await jsm.streams.add({
      name: cfg.name,
      subjects: cfg.subjects,
      retention: cfg.retention as never,
      storage: cfg.storage as never,
      max_msgs: cfg.maxMsgs,
      max_bytes: cfg.maxBytes,
      max_age: cfg.maxAgeMs === undefined ? undefined : cfg.maxAgeMs * 1_000_000,
    });
    const created = (await this.streams()).find((stream) => stream.name === cfg.name);
    if (!created) throw new Error(`stream ${cfg.name} was not created`);
    return created;
  }

  async updateStream(name: string, changes: Omit<Partial<StreamConfigInput>, 'name'>): Promise<StreamSummary> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const info = await jsm.streams.info(name);
    const config = { ...info.config };
    if (changes.subjects !== undefined) config.subjects = changes.subjects;
    if (changes.retention !== undefined) config.retention = changes.retention as never;
    if (changes.storage !== undefined) config.storage = changes.storage as never;
    if (changes.maxMsgs !== undefined) config.max_msgs = changes.maxMsgs;
    if (changes.maxBytes !== undefined) config.max_bytes = changes.maxBytes;
    if (changes.maxAgeMs !== undefined) config.max_age = changes.maxAgeMs * 1_000_000;
    await jsm.streams.update(name, config);
    const updated = (await this.streams()).find((stream) => stream.name === name);
    if (!updated) throw new Error(`stream ${name} was not updated`);
    return updated;
  }

  async deleteStream(name: string): Promise<boolean> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    return jsm.streams.delete(name);
  }

  async consumers(stream: string): Promise<ConsumerSummary[]> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const result: ConsumerSummary[] = [];
    for await (const ci of jsm.consumers.list(stream)) {
      result.push({
        name: ci.name,
        stream,
        pending: ci.num_pending,
        delivered: ci.delivered.consumer_seq,
        ackPending: ci.num_ack_pending,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Deletes all messages from a stream. Returns the number purged. */
  async purgeStream(name: string): Promise<number> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const res = await jsm.streams.purge(name);
    return res.purged;
  }

  /** Creates a durable consumer on a stream and returns its summary (NL-13). */
  async addConsumer(stream: string, cfg: NewConsumer): Promise<ConsumerSummary> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    await jsm.consumers.add(stream, {
      durable_name: cfg.durableName,
      ack_policy: (cfg.ackPolicy ?? 'explicit') as never,
      deliver_policy: (cfg.deliverPolicy ?? 'all') as never,
      filter_subject: cfg.filterSubject,
    });
    const created = (await this.consumers(stream)).find((c) => c.name === cfg.durableName);
    if (!created) throw new Error(`consumer ${cfg.durableName} was not created`);
    return created;
  }

  /**
   * Updates mutable fields of an existing durable consumer (NL-22). Returns the
   * effective `maxDeliver` and `ackWaitMs` after the change.
   */
  async updateConsumer(
    stream: string,
    name: string,
    changes: { maxDeliver?: number; ackWaitMs?: number }
  ): Promise<{ maxDeliver: number; ackWaitMs: number }> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const info = await jsm.consumers.info(stream, name);
    const cfg = { ...info.config };
    if (changes.maxDeliver !== undefined) cfg.max_deliver = changes.maxDeliver;
    if (changes.ackWaitMs !== undefined) cfg.ack_wait = changes.ackWaitMs * 1_000_000; // ms → ns
    const updated = await jsm.consumers.update(stream, name, cfg);
    return {
      maxDeliver: updated.config.max_deliver ?? -1,
      ackWaitMs: (updated.config.ack_wait ?? 0) / 1_000_000,
    };
  }

  /** Deletes a consumer from a stream. Returns true on success. */
  async deleteConsumer(stream: string, name: string): Promise<boolean> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    return jsm.consumers.delete(stream, name);
  }

  /**
   * Fetches a stored message from a stream, either by sequence number or the
   * last message on a given subject (NL-12). Throws if no such message exists.
   */
  async getStreamMessage(
    stream: string,
    selector: { seq: number } | { lastBySubject: string }
  ): Promise<StoredMessage> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const query = 'seq' in selector ? { seq: selector.seq } : { last_by_subj: selector.lastBySubject };
    const m = await jsm.streams.getMessage(stream, query);
    const hdrs = m.header ? [...m.header] : [];
    return {
      seq: m.seq,
      subject: m.subject,
      time: m.time.toISOString(),
      data: m.data,
      headers: hdrs.length ? hdrs : undefined,
    };
  }

  /** Lists Key-Value buckets (JetStream streams with the `KV_` prefix) — NL-10. */
  async kvBuckets(): Promise<KvBucketSummary[]> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const out: KvBucketSummary[] = [];
    for await (const si of jsm.streams.list()) {
      if (!si.config.name.startsWith('KV_')) continue;
      out.push({ bucket: si.config.name.slice(3), values: si.state.messages, bytes: si.state.bytes });
    }
    return out.sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /** Lists the keys in a KV bucket. */
  async kvKeys(bucket: string): Promise<string[]> {
    this.assertConnected();
    const kv = await this.nc!.jetstream().views.kv(bucket);
    const keys: string[] = [];
    for await (const k of await kv.keys()) keys.push(k);
    return keys.sort();
  }

  /** Reads the latest value of a KV key, or null if absent. */
  async kvGet(bucket: string, key: string): Promise<{ value: string; revision: number } | null> {
    this.assertConnected();
    const kv = await this.nc!.jetstream().views.kv(bucket);
    const e = await kv.get(key);
    if (!e) return null;
    return { value: sc.decode(e.value), revision: e.revision };
  }

  /** Writes a KV key and returns the new revision. Creates the bucket if missing. */
  async kvPut(bucket: string, key: string, value: string): Promise<number> {
    this.assertConnected();
    const kv = await this.nc!.jetstream().views.kv(bucket);
    return kv.put(key, sc.encode(value));
  }

  /** Lists Object Store buckets (JetStream streams with the `OBJ_` prefix) — NL-23. */
  async osBuckets(): Promise<OsBucketSummary[]> {
    this.assertConnected();
    const jsm = await this.nc!.jetstreamManager();
    const out: OsBucketSummary[] = [];
    for await (const si of jsm.streams.list()) {
      if (!si.config.name.startsWith('OBJ_')) continue;
      out.push({ bucket: si.config.name.slice(4), bytes: si.state.bytes });
    }
    return out.sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /** Lists the objects in an Object Store bucket. */
  async osList(bucket: string): Promise<ObjectSummary[]> {
    this.assertConnected();
    const os = await this.nc!.jetstream().views.os(bucket);
    const infos = await os.list();
    return infos.map((o) => ({ name: o.name, size: o.size })).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Reads an object's bytes, or null if absent. */
  async osGet(bucket: string, name: string): Promise<Uint8Array | null> {
    this.assertConnected();
    const os = await this.nc!.jetstream().views.os(bucket);
    return os.getBlob(name);
  }

  /** Writes an object and returns its name and stored size. Creates the bucket if missing. */
  async osPut(bucket: string, name: string, data: Uint8Array): Promise<ObjectSummary> {
    this.assertConnected();
    const os = await this.nc!.jetstream().views.os(bucket);
    const info = await os.putBlob({ name }, data);
    return { name: info.name, size: info.size };
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error('not connected to any NATS server');
  }
}
