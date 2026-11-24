// When to try a failed delivery again.
//
// Delays grow exponentially with "full jitter" (a random delay between zero and the
// exponential value), so many endpoints failing at once do not all retry at the same moment.
// The random source is passed in, so schedules are reproducible in tests.

export interface BackoffPolicy {
  /** Delay ceiling for the first retry, in milliseconds. */
  baseMs: number;
  /** Growth per attempt. */
  factor: number;
  /** No single delay is longer than this. */
  capMs: number;
  /** Total attempts including the first; after this the delivery is dead. */
  maxAttempts: number;
}

export const DEFAULT_POLICY: BackoffPolicy = {
  baseMs: 5_000,
  factor: 3,
  capMs: 6 * 60 * 60 * 1000,
  maxAttempts: 10,
};

export function checkPolicy(p: BackoffPolicy): void {
  if (!(p.baseMs > 0) || !(p.factor >= 1) || !(p.capMs >= p.baseMs)) {
    throw new RangeError("policy needs baseMs > 0, factor >= 1 and capMs >= baseMs");
  }
  if (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a whole number of at least 1");
  }
}

/** The jitter ceiling before retry number `retry` (1 is the first retry). */
export function ceilingMs(retry: number, p: BackoffPolicy = DEFAULT_POLICY): number {
  checkPolicy(p);
  if (!Number.isInteger(retry) || retry < 1) throw new RangeError("retry must be 1 or more");
  // Compare in log space so huge retry numbers cannot overflow to Infinity.
  if ((retry - 1) * Math.log(p.factor) >= Math.log(p.capMs / p.baseMs)) return p.capMs;
  return Math.min(p.capMs, p.baseMs * p.factor ** (retry - 1));
}

/**
 * Delay before the next attempt, given how many attempts have been made so far, or null
 * when the delivery has used all its attempts. `random` returns a number in [0, 1).
 */
export function nextDelayMs(
  attemptsMade: number,
  random: () => number,
  p: BackoffPolicy = DEFAULT_POLICY,
): number | null {
  checkPolicy(p);
  if (!Number.isInteger(attemptsMade) || attemptsMade < 1)
    throw new RangeError("attemptsMade must be 1 or more");
  if (attemptsMade >= p.maxAttempts) return null;
  const r = random();
  if (!(r >= 0 && r < 1)) throw new RangeError("random() must return a number in [0, 1)");
  return Math.floor(r * ceilingMs(attemptsMade, p));
}

/**
 * Read an HTTP Retry-After header (seconds or an HTTP date) as a delay in milliseconds.
 * Returns null when the header is missing or unreadable, so the caller uses its own backoff.
 * The result is clamped to [0, capMs] so a receiver cannot park a delivery for a year.
 */
export function retryAfterMs(header: string | undefined, nowMs: number, capMs: number): number | null {
  if (header === undefined) return null;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Math.min(capMs, Number(value) * 1000);
  if (!/[A-Za-z]/.test(value)) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.min(capMs, Math.max(0, at - nowMs));
}
