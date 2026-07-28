import * as React from 'react';
import type { Send } from '../App';
import { Button, Input, Label, Textarea } from '../components/ui/controls';
import { Card, CardTitle } from '../components/ui/card';

export function PublishTab({ send, reply }: { send: Send; reply: string | null }) {
  const [subject, setSubject] = React.useState('');
  const [payload, setPayload] = React.useState('');
  const [headers, setHeaders] = React.useState('');

  const disabled = !subject.trim();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.new" />
      </div>
      <div>
        <Label>Payload</Label>
        <Textarea rows={6} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='{"id": 1}' />
      </div>
      <div>
        <Label>Headers (one per line, k=v or k: v)</Label>
        <Textarea rows={3} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="trace-id: abc" />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={disabled}
          onClick={() => send({ type: 'publish', subject: subject.trim(), payload, headers })}
        >
          Publish
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => send({ type: 'request', subject: subject.trim(), payload })}
        >
          Request
        </Button>
      </div>
      {reply !== null && (
        <Card>
          <CardTitle>Reply / ack</CardTitle>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-sm">{reply}</pre>
        </Card>
      )}
    </div>
  );
}
