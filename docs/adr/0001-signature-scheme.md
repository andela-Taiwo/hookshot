# 0001: Signature scheme

## Status

Accepted

## Context

Receivers need to know a webhook really came from us, was not changed, and is not an old
request replayed by someone who captured it. They also need to rotate secrets without a
window in which valid deliveries are rejected. Several public schemes exist; they agree on the
essentials: an HMAC over a timestamp and the raw body, sent in a header, compared in constant
time.

## Decision

- Header: `Hookshot-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`.
- Each `v1` is HMAC-SHA256, keyed by an endpoint secret, over `<delivery id>.<t>.<raw body>`.
  Including the delivery id binds the signature to one delivery.
- During rotation the request is signed with every active secret, so receivers accept either.
- Receivers reject timestamps more than 300 seconds from their clock in either direction.
- Unknown schemes in the header are ignored, so a `v2` can be added later beside `v1`.

## Consequences

- Receivers must verify against the raw body bytes, before any JSON parsing. The docs and
  sample receiver say so.
- The delivery id cannot contain `.`, `,`, `=` or whitespace.
- Clock skew over five minutes on a receiver will reject valid deliveries; the docs say how to
  diagnose it.
