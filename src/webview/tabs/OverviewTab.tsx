import * as React from 'react';
import type { DashboardModel } from '../../core/dashboard';
import { Card, CardTitle, CardValue } from '../components/ui/card';

export function OverviewTab({ model }: { model: DashboardModel }) {
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
