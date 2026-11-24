import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signatureHeader, verifySignature } from "./signing.js";

const OLD = "whsec_old_0123456789abcdef";
const NEW = "whsec_new_fedcba9876543210";
const ID = "dlv_01J8ZK3";
const T = 1_767_225_600;
const BODY = '{"type":"order.paid","amount":4200}';

describe("signatureHeader", () => {
  it("is an HMAC-SHA256 over id, timestamp and body", () => {
    const expected = createHmac("sha256", OLD).update(`${ID}.${T}.${BODY}`).digest("hex");
    expect(signatureHeader([OLD], ID, T, BODY)).toBe(`t=${T},v1=${expected}`);
  });

  it("signs with every active secret during rotation", () => {
    const header = signatureHeader([OLD, NEW], ID, T, BODY);
    expect(header.match(/v1=/g)).toHaveLength(2);
  });

  it("signs bytes and the same text identically", () => {
    expect(signatureHeader([OLD], ID, T, Buffer.from(BODY))).toBe(signatureHeader([OLD], ID, T, BODY));
  });

  it.each([
    [[], ID, T],
    [["short"], ID, T],
    [[OLD], "", T],
    [[OLD], "a.b", T],
    [[OLD], ID, -1],
    [[OLD], ID, 1.5],
  ] as const)("refuses bad inputs %#", (secrets, id, t) => {
    expect(() => signatureHeader(secrets, id, t, BODY)).toThrow();
  });
});

describe("verifySignature", () => {
  const header = signatureHeader([OLD], ID, T, BODY);

  it("accepts a fresh, correct signature", () => {
    expect(verifySignature(header, [OLD], ID, BODY, T + 10)).toEqual({ ok: true });
  });

  it("accepts either secret while rotating", () => {
    const both = signatureHeader([OLD, NEW], ID, T, BODY);
    expect(verifySignature(both, [NEW], ID, BODY, T)).toEqual({ ok: true });
    expect(verifySignature(both, [OLD], ID, BODY, T)).toEqual({ ok: true });
  });

  it("rejects a changed body, id or secret", () => {
    expect(verifySignature(header, [OLD], ID, BODY + " ", T)).toEqual({ ok: false, reason: "no_match" });
    expect(verifySignature(header, [OLD], "dlv_other", BODY, T)).toEqual({ ok: false, reason: "no_match" });
    expect(verifySignature(header, [NEW], ID, BODY, T)).toEqual({ ok: false, reason: "no_match" });
  });

  it("rejects a changed timestamp even with the old signature", () => {
    const moved = header.replace(`t=${T}`, `t=${T + 1}`);
    expect(verifySignature(moved, [OLD], ID, BODY, T)).toEqual({ ok: false, reason: "no_match" });
  });

  it("rejects replays outside the tolerance, in both directions", () => {
    expect(verifySignature(header, [OLD], ID, BODY, T + 301)).toEqual({ ok: false, reason: "too_old" });
    expect(verifySignature(header, [OLD], ID, BODY, T - 301)).toEqual({ ok: false, reason: "in_future" });
    expect(verifySignature(header, [OLD], ID, BODY, T + 300)).toEqual({ ok: true });
  });

  it.each([
    "",
    "garbage",
    `v1=${"a".repeat(64)}`,
    `t=${T}`,
    `t=${T},v1=zz`,
    `t=abc,v1=${"a".repeat(64)}`,
    `t=${T},t=${T},v1=${"a".repeat(64)}`,
  ])("reports malformed headers without throwing: %s", (bad) => {
    expect(verifySignature(bad, [OLD], ID, BODY, T)).toEqual({ ok: false, reason: "malformed" });
  });

  it("ignores unknown schemes next to v1", () => {
    expect(verifySignature(`${header},v2=whatever`, [OLD], ID, BODY, T)).toEqual({ ok: true });
  });
});
