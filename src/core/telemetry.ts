export const TELEMETRY_EVENTS = ['connect', 'publish', 'request', 'subscribe', 'dashboard'] as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
export type TelemetryCounts = Partial<Record<TelemetryEvent, number>>;

const allowedEvents = new Set<string>(TELEMETRY_EVENTS);

export function aggregateTelemetry(events: readonly string[]): TelemetryCounts {
  const counts: TelemetryCounts = {};
  for (const event of events) {
    if (!allowedEvents.has(event)) continue;
    const name = event as TelemetryEvent;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  ) as TelemetryCounts;
}

export function telemetryPayload(version: string, events: TelemetryCounts): {
  version: string;
  events: TelemetryCounts;
} {
  return { version, events };
}
