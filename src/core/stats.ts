// Live message statistics (NL-42). Pure, unit-tested.

/** Counts timestamps (ms) that fall within `windowMs` before `now`. */
export function messageRate(timestamps: number[], windowMs: number, now: number): number {
  const cutoff = now - windowMs;
  let count = 0;
  for (const t of timestamps) if (t >= cutoff && t <= now) count++;
  return count;
}
