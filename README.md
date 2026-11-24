# Hookshot

A webhook delivery service. Other services hand it events; it delivers them to customers'
endpoints, signed, retried, rate-limited per customer, and replayable, so one slow or broken
endpoint never holds up anyone else's.

> **Status: foundation only.** The project layout, tooling, signature scheme and retry
> backoff exist and are tested. The schema, API, delivery workers, rate limits, dead letters,
> replay, dashboard and deployment are not built yet. See [the plan](docs/PLAN.md).

## What it will do

- **Accept events** through an API with idempotency keys, fan them out to every endpoint
  subscribed to the event type, and store each delivery.
- **Deliver** with signed requests (`Hookshot-Signature`), timeouts, and retries with jittered
  backoff that honours `Retry-After`.
- **Isolate customers**: per-endpoint rate limits and concurrency, and a circuit breaker that
  pauses an endpoint that keeps failing, so one bad endpoint cannot slow the rest.
- **Dead letters and replay**: deliveries that run out of attempts are kept with every attempt's
  status and response, and can be replayed singly or in bulk.
- **Secrets**: rotate an endpoint's secret with an overlap period, and never log or return a
  secret after it is created.
- **Operate**: a dashboard of endpoints and deliveries, metrics, and a deployment that survives
  workers being killed mid-delivery.

## What exists today

| Module | What it does |
|---|---|
| `src/signing.ts` | Signs deliveries with HMAC-SHA256 over id, timestamp and body, with several secrets during rotation, and verifies signatures with a replay window and constant-time comparison |
| `src/backoff.ts` | Exponential backoff with full jitter and a cap, attempt limits, and `Retry-After` parsing |

## Quickstart

Requires Node 22 or newer. Later sessions need PostgreSQL 14 or newer.

```bash
make setup   # install locked dependencies
make check   # format check, type check and tests
make help    # list every target
```

## Licence

MIT. See [LICENSE](LICENSE).
