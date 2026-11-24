import { describe, expect, it } from "vitest";
import { type BackoffPolicy, ceilingMs, DEFAULT_POLICY, nextDelayMs, retryAfterMs } from "./backoff.js";

const POLICY: BackoffPolicy = { baseMs: 1000, factor: 2, capMs: 60_000, maxAttempts: 5 };

function seeded(seed: number): () => number {
  // mulberry32: small, deterministic, good enough for jitter tests.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ceilingMs", () => {
  it("grows exponentially, then stops at the cap", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => ceilingMs(n, POLICY))).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000,
    ]);
  });

  it("never overflows for huge retry numbers", () => {
    expect(ceilingMs(10_000, POLICY)).toBe(60_000);
  });

  it("rejects bad policies and retry numbers", () => {
    expect(() => ceilingMs(0, POLICY)).toThrow(RangeError);
    expect(() => ceilingMs(1, { ...POLICY, factor: 0.5 })).toThrow(RangeError);
    expect(() => ceilingMs(1, { ...POLICY, capMs: 10 })).toThrow(RangeError);
  });
});

describe("nextDelayMs", () => {
  it("stays within [0, ceiling) for every attempt", () => {
    const random = seeded(7);
    for (let attempts = 1; attempts < POLICY.maxAttempts; attempts++) {
      for (let i = 0; i < 500; i++) {
        const delay = nextDelayMs(attempts, random, POLICY);
        expect(delay).not.toBeNull();
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(ceilingMs(attempts, POLICY));
      }
    }
  });

  it("spreads retries out rather than bunching them", () => {
    const random = seeded(1);
    const delays = Array.from({ length: 2000 }, () => nextDelayMs(3, random, POLICY) ?? 0);
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
    expect(mean).toBeGreaterThan(1700); // full jitter: mean is half the 4000 ms ceiling
    expect(mean).toBeLessThan(2300);
    expect(new Set(delays).size).toBeGreaterThan(1500);
  });

  it("is reproducible with the same random source", () => {
    const a = [1, 2, 3, 4].map((n) => nextDelayMs(n, seeded(42), POLICY));
    const b = [1, 2, 3, 4].map((n) => nextDelayMs(n, seeded(42), POLICY));
    expect(a).toEqual(b);
  });

  it("gives up after the last attempt", () => {
    expect(nextDelayMs(5, () => 0.5, POLICY)).toBeNull();
    expect(nextDelayMs(DEFAULT_POLICY.maxAttempts, () => 0.5)).toBeNull();
  });

  it("rejects a random source outside [0, 1)", () => {
    expect(() => nextDelayMs(1, () => 1, POLICY)).toThrow(RangeError);
    expect(() => nextDelayMs(1, () => Number.NaN, POLICY)).toThrow(RangeError);
  });
});

describe("retryAfterMs", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs("120", now, 3_600_000)).toBe(120_000);
    expect(retryAfterMs("Thu, 01 Jan 2026 00:05:00 GMT", now, 3_600_000)).toBe(300_000);
  });

  it("clamps to the cap and never goes negative", () => {
    expect(retryAfterMs("999999", now, 3_600_000)).toBe(3_600_000);
    expect(retryAfterMs("Wed, 31 Dec 2025 23:00:00 GMT", now, 3_600_000)).toBe(0);
  });

  it("returns null for missing or unreadable values", () => {
    expect(retryAfterMs(undefined, now, 1000)).toBeNull();
    expect(retryAfterMs("soon", now, 1000)).toBeNull();
    expect(retryAfterMs("-5", now, 1000)).toBeNull();
    expect(retryAfterMs("1.5", now, 1000)).toBeNull();
  });
});
