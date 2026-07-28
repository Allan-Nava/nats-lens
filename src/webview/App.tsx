import * as React from 'react';
import type { DashboardModel, InboundMessage, LiveMessage } from '../core/dashboard';
import { Card, CardTitle, CardValue } from './components/ui/card';
import { OverviewTab } from './tabs/OverviewTab';
import { PublishTab } from './tabs/PublishTab';
import { SubscribeTab } from './tabs/SubscribeTab';
import { InspectTab } from './tabs/InspectTab';

export type Send = (msg: InboundMessage) => void;

const TABS = ['Overview', 'Publish', 'Subscribe', 'Inspect'] as const;
type Tab = (typeof TABS)[number];

export function App({
  model,
  send,
  reply,
  messages,
  subscriptions,
  error,
}: {
  model: DashboardModel | null;
  send: Send;
  reply: string | null;
  messages: LiveMessage[];
  subscriptions: string[];
  error: string | null;
}) {
  const [tab, setTab] = React.useState<Tab>('Overview');

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${model?.connected ? 'bg-ok' : 'bg-warn'}`}
          aria-hidden
        />
        <h1 className="text-sm font-semibold">
          NATS Lens{model?.context ? ` — ${model.context}` : ''}
        </h1>
        <nav className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 ${
                tab === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-warn">{error}</div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {!model?.connected ? (
          <Card>
            <CardTitle>Non connesso</CardTitle>
            <CardValue className="text-base font-normal text-muted">
              Connettiti a un context per usare la dashboard.
            </CardValue>
          </Card>
        ) : tab === 'Overview' ? (
          <OverviewTab model={model} />
        ) : tab === 'Publish' ? (
          <PublishTab send={send} reply={reply} />
        ) : tab === 'Subscribe' ? (
          <SubscribeTab send={send} messages={messages} subscriptions={subscriptions} />
        ) : (
          <InspectTab />
        )}
      </main>
    </div>
  );
}
