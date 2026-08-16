// Connection health derived from round-trip time (NL-40). Pure, unit-tested.

export type Health = 'good' | 'slow' | 'down';

/** Classifies RTT (ms): <0 = down, >100ms = slow, else good. */
export function rttHealth(rttMs: number, slowMs = 100): Health {
  if (rttMs < 0) return 'down';
  return rttMs > slowMs ? 'slow' : 'good';
}
