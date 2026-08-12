import * as React from 'react';
import type { DashboardModel } from '../../core/dashboard';
import type { Send } from '../App';
import { Card, CardTitle, CardValue } from '../components/ui/card';
import { Button, Input, Label } from '../components/ui/controls';

function ReadMessage({ model, send }: { model: DashboardModel; send: Send }) {
  const [stream, setStream] = React.useState(model.streams[0]?.name ?? '');
  const [mode, setMode] = React.useState<'seq' | 'subj'>('seq');
  const [seq, setSeq] = React.useState('1');
  const [subject, setSubject] = React.useState('');

  const go = () => {
    if (!stream) return;
    if (mode === 'seq') send({ type: 'readMessage', stream, seq: Number(seq) || 1 });
    else send({ type: 'readMessage', stream, lastBySubject: subject.trim() });
  };

  return (
    <Card>
      <CardTitle>Read stream message</CardTitle>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <Label>Stream</Label>
          <select
            className="rounded border border-input-border bg-input px-2 py-1 text-input-fg"
            value={stream}
            onChange={(e) => setStream(e.target.value)}
          >
            {model.streams.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>By</Label>
          <select
            className="rounded border border-input-border bg-input px-2 py-1 text-input-fg"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'seq' | 'subj')}
          >
            <option value="seq">sequence</option>
            <option value="subj">last by subject</option>
          </select>
        </div>
        {mode === 'seq' ? (
          <div className="w-28">
            <Label>Seq</Label>
            <Input value={seq} onChange={(e) => setSeq(e.target.value)} />
          </div>
        ) : (
          <div className="flex-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.new" />
          </div>
        )}
        <Button onClick={go} disabled={!stream}>
          Read
        </Button>
      </div>
    </Card>
  );
}

export function OverviewTab({
  model,
  send,
  messageDoc,
}: {
  model: DashboardModel;
  send: Send;
  messageDoc: { title: string; body: string } | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardTitle>Streams</CardTitle>
          <CardValue>{model.totals.streams}</CardValue>
        </Card>
        <Card>
          <CardTitle>KV buckets</CardTitle>
          <CardValue>{model.totals.kvBuckets}</CardValue>
        </Card>
        <Card>
          <CardTitle>Object Store</CardTitle>
          <CardValue>{model.totals.osBuckets}</CardValue>
        </Card>
        <Card>
          <CardTitle>Subscriptions</CardTitle>
          <CardValue>{model.totals.subscriptions}</CardValue>
        </Card>
      </section>

      {model.streams.length > 0 && <ReadMessage model={model} send={send} />}

      {messageDoc && (
        <Card>
          <CardTitle>{messageDoc.title}</CardTitle>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-sm">{messageDoc.body}</pre>
        </Card>
      )}

      {model.streams.length > 0 && (
        <Card>
          <CardTitle>Streams</CardTitle>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {model.streams.map((s) => (
                <tr key={s.name} className="border-t border-border">
                  <td className="py-1">{s.name}</td>
                  <td className="py-1 text-right text-muted">{s.messages} msg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {model.kvBuckets.length > 0 && (
          <Card>
            <CardTitle>KV buckets</CardTitle>
            <ul className="mt-2 text-sm">
              {model.kvBuckets.map((b) => (
                <li key={b} className="border-t border-border py-1">
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {model.osBuckets.length > 0 && (
          <Card>
            <CardTitle>Object Store</CardTitle>
            <ul className="mt-2 text-sm">
              {model.osBuckets.map((b) => (
                <li key={b} className="border-t border-border py-1">
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
