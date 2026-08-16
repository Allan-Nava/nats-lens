import * as React from 'react';
import type { Send } from '../App';
import type { LiveMessage } from '../../core/dashboard';
import { messageRate } from '../../core/stats';
import { Button, Input, Label } from '../components/ui/controls';
import { Card, CardTitle } from '../components/ui/card';

export function SubscribeTab({
  send,
  messages,
  subscriptions,
}: {
  send: Send;
  messages: LiveMessage[];
  subscriptions: string[];
}) {
  const [subject, setSubject] = React.useState('');
  const [filter, setFilter] = React.useState('');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Subject (wildcards * and &gt;)</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.>" />
        </div>
        <div className="flex-1">
          <Label>Filter (optional)</Label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="orders.*.created" />
        </div>
        <Button
          disabled={!subject.trim()}
          onClick={() => send({ type: 'subscribe', subject: subject.trim(), filter: filter.trim() || undefined })}
        >
          Subscribe
        </Button>
      </div>

      {subscriptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {subscriptions.map((s) => (
            <span key={s} className="flex items-center gap-2 rounded border border-border px-2 py-0.5 text-sm">
              {s}
              <button className="text-muted hover:text-fg" onClick={() => send({ type: 'unsubscribe', subject: s })}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <Card className="min-h-0 flex-1">
        <div className="flex items-center justify-between">
          <CardTitle>Live messages</CardTitle>
          <span className="text-xs text-muted">
            {messageRate(messages.map((m) => Date.parse(m.ts)), 1000, Date.now())} msg/s
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {messages.length === 0 ? (
            <span className="text-muted">In attesa di messaggi…</span>
          ) : (
            messages.map((m, i) => (
              <div key={i} className="border-t border-border py-1">
                <span className="text-muted">{m.ts.slice(11, 19)} </span>
                {m.valid !== undefined && (
                  <span className={m.valid ? 'text-ok' : 'text-warn'}>{m.valid ? '✓' : '✗'} </span>
                )}
                <span className="text-accent">{m.subject}</span> {m.body}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
