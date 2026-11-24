// Webhook signatures.
//
// Every delivery carries a header such as
//
//   Hookshot-Signature: t=1767225600,v1=5257a869...,v1=9d1c4b...
//
// Each v1 value is a hex HMAC-SHA256, keyed by an endpoint secret, over
// "<delivery id>.<timestamp>.<raw body>". Several v1 values let an endpoint rotate its secret
// without dropping deliveries. The timestamp lets receivers refuse replays of old requests.

import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TOLERANCE_S = 300;

export type VerifyResult =
  { ok: true } | { ok: false; reason: "malformed" | "too_old" | "in_future" | "no_match" };

function mac(secret: string, id: string, timestamp: number, body: string | Uint8Array): Buffer {
  const h = createHmac("sha256", secret);
  h.update(`${id}.${timestamp}.`);
  h.update(body);
  return h.digest();
}

function checkInputs(id: string, timestamp: number): void {
  if (!id || /[.,=\s]/.test(id))
    throw new Error("delivery id must be non-empty with no '.', ',', '=' or spaces");
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("timestamp must be whole seconds");
}

/** Build the signature header for a delivery, signing with every active secret. */
export function signatureHeader(
  secrets: readonly string[],
  id: string,
  timestamp: number,
  body: string | Uint8Array,
): string {
  checkInputs(id, timestamp);
  if (secrets.length === 0 || secrets.some((s) => s.length < 16)) {
    throw new Error("at least one secret is needed, each at least 16 characters");
  }
  const parts = secrets.map((s) => `v1=${mac(s, id, timestamp, body).toString("hex")}`);
  return [`t=${timestamp}`, ...parts].join(",");
}

/** Verify a signature header as a receiver would. Never throws on bad input. */
export function verifySignature(
  header: string,
  secrets: readonly string[],
  id: string,
  body: string | Uint8Array,
  nowS: number,
  toleranceS: number = DEFAULT_TOLERANCE_S,
): VerifyResult {
  let timestamp: number | undefined;
  const candidates: Buffer[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) return { ok: false, reason: "malformed" };
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (timestamp !== undefined || !/^\d{1,15}$/.test(value)) return { ok: false, reason: "malformed" };
      timestamp = Number(value);
    } else if (key === "v1") {
      if (!/^[0-9a-f]{64}$/.test(value)) return { ok: false, reason: "malformed" };
      candidates.push(Buffer.from(value, "hex"));
    }
    // Unknown schemes are ignored so new versions can be added alongside v1.
  }
  if (timestamp === undefined || candidates.length === 0) return { ok: false, reason: "malformed" };
  if (nowS - timestamp > toleranceS) return { ok: false, reason: "too_old" };
  if (timestamp - nowS > toleranceS) return { ok: false, reason: "in_future" };
  for (const secret of secrets) {
    const expected = mac(secret, id, timestamp, body);
    if (candidates.some((c) => timingSafeEqual(c, expected))) return { ok: true };
  }
  return { ok: false, reason: "no_match" };
}
