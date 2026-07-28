import * as React from 'react';
import type { DashboardModel } from '../core/dashboard';
import { Card, CardTitle, CardValue } from './components/ui/card';

export function App({ model, onRefresh }: { model: DashboardModel | null; onRefresh: () => void }) {
  const totals = model?.totals;
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${model?.connected ? 'bg-ok' : 'bg-warn'}`}
            aria-hidden
          />
          <h1 className="text-base font-semibold">
            NATS Lens{model?.context ? ` — ${model.context}` : ''}
          </h1>
        </div>
        <button
          className="rounded border border-border bg-accent px-3 py-1 text-accent-fg hover:bg-accent-hover"
          onClick={onRefresh}
        >
          Refresh
        </button>
      </header>

      {!model?.connected ? (
        <p className="text-muted">Non connesso. Connettiti a un context per vedere la dashboard.</p>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardTitle>Streams</CardTitle>
            <CardValue>{totals?.streams ?? 0}</CardValue>
          </Card>
          <Card>
            <CardTitle>KV buckets</CardTitle>
            <CardValue>{totals?.kvBuckets ?? 0}</CardValue>
          </Card>
          <Card>
            <CardTitle>Object Store</CardTitle>
            <CardValue>{totals?.osBuckets ?? 0}</CardValue>
          </Card>
          <Card>
            <CardTitle>Subscriptions</CardTitle>
            <CardValue>{totals?.subscriptions ?? 0}</CardValue>
          </Card>
        </section>
      )}
    </div>
  );
}
