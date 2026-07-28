// Pure view-model + message protocol for the webview dashboard (NL-24).
// No vscode/react imports here so it can be unit-tested and shared by both
// the extension host and the webview bundle.
import type { ConnState } from './client';

export interface DashboardTotals {
  streams: number;
  kvBuckets: number;
  osBuckets: number;
  subscriptions: number;
}

export interface DashboardModel {
  connected: boolean;
  context: string | null;
  totals: DashboardTotals;
}

export interface DashboardInput {
  connectionState: ConnState;
  context: string | null;
  streams?: number;
  kvBuckets?: number;
  osBuckets?: number;
  subscriptions?: number;
}

/** Normalizes raw connection/count data into the dashboard's view-model. */
export function buildDashboardModel(input: DashboardInput): DashboardModel {
  return {
    connected: input.connectionState === 'connected',
    context: input.context,
    totals: {
      streams: input.streams ?? 0,
      kvBuckets: input.kvBuckets ?? 0,
      osBuckets: input.osBuckets ?? 0,
      subscriptions: input.subscriptions ?? 0,
    },
  };
}

// --- Typed message bridge: extension host <-> webview -----------------------

/** Messages the webview sends to the extension host. */
export type InboundMessage = { type: 'ready' } | { type: 'refresh' };

/** Messages the extension host sends to the webview. */
export type OutboundMessage = { type: 'model'; model: DashboardModel };
