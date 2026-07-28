// Pure view-model + message protocol for the webview dashboard (NL-24/25/26/28).
// No imports here (fully standalone) so it can be unit-tested and shared by
// both the extension host and the DOM-only webview bundle.
export type ConnState = 'connected' | 'reconnecting' | 'closed';

export interface StreamRow {
  name: string;
  messages: number;
}

export interface DashboardTotals {
  streams: number;
  kvBuckets: number;
  osBuckets: number;
  subscriptions: number;
}

export interface DashboardModel {
  connected: boolean;
  context: string | null;
  streams: StreamRow[];
  kvBuckets: string[];
  osBuckets: string[];
  totals: DashboardTotals;
}

export interface DashboardInput {
  connectionState: ConnState;
  context: string | null;
  streams?: StreamRow[];
  kvBuckets?: string[];
  osBuckets?: string[];
  subscriptions?: number;
}

/** Normalizes raw connection/list data into the dashboard's view-model. */
export function buildDashboardModel(input: DashboardInput): DashboardModel {
  const streams = input.streams ?? [];
  const kvBuckets = input.kvBuckets ?? [];
  const osBuckets = input.osBuckets ?? [];
  return {
    connected: input.connectionState === 'connected',
    context: input.context,
    streams,
    kvBuckets,
    osBuckets,
    totals: {
      streams: streams.length,
      kvBuckets: kvBuckets.length,
      osBuckets: osBuckets.length,
      subscriptions: input.subscriptions ?? 0,
    },
  };
}

// --- Typed message bridge: extension host <-> webview -----------------------

/** Messages the webview sends to the extension host. */
export type InboundMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'publish'; subject: string; payload: string; headers?: string }
  | { type: 'request'; subject: string; payload: string }
  | { type: 'subscribe'; subject: string; filter?: string }
  | { type: 'unsubscribe'; subject: string };

/** A live message forwarded to the webview's Subscribe tab. */
export interface LiveMessage {
  subject: string;
  ts: string;
  body: string;
}

/** Messages the extension host sends to the webview. */
export type OutboundMessage =
  | { type: 'model'; model: DashboardModel }
  | { type: 'subscriptions'; subjects: string[] }
  | { type: 'message'; message: LiveMessage }
  | { type: 'reply'; ok: boolean; text: string }
  | { type: 'error'; message: string };
