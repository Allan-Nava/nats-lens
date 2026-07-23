// Thin wrapper around the nats.js client: one active connection, JetStream
// introspection, pub/sub/request. Pure module (no vscode imports) so the
// integration test can drive it against a throwaway nats-server.
import {
  connect,
  credsAuthenticator,
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
}

export interface ConsumerSummary {
  name: string;
  stream: string;
  pending: number;
  delivered: number;
  ackPending: number;
}

export class NatsClient {
  private nc: NatsConnection | null = null;
  context: NatsContext | null = null;

  get connected(): boolean {
    return this.nc !== null && !this.nc.isClosed();
  }

  async connectTo(ctx: NatsContext, timeoutMs = 5000): Promise<void> {
    await this.disconnect();
    this.nc = await connect({
      servers: ctx.url,
      user: ctx.user,
      pass: ctx.password,
      token: ctx.token,
      authenticator: ctx.creds && fs.existsSync(ctx.creds)
        ? credsAuthenticator(fs.readFileSync(ctx.creds))
        : undefined,
      timeout: timeoutMs,
      name: 'nats-lens (vscode)',
    });
    this.context = ctx;
  }

  async disconnect(): Promise<void> {
    if (this.nc && !this.nc.isClosed()) await this.nc.close();
    this.nc = null;
    this.context = null;
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
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
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

  private assertConnected(): void {
    if (!this.connected) throw new Error('not connected to any NATS server');
  }
}
