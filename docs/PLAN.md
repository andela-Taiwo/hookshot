# Plan

Hookshot is built in sessions, each with a clear success test. Later sessions build on
earlier ones.

| # | Session | Success |
|---|---|---|
| 1 | Schema, migrations and the event API (Fastify): applications, endpoints with event-type filters, events with idempotency keys, fan-out into deliveries, API keys | A repeated idempotency key creates one event; an event reaches exactly the subscribed endpoints; API keys are stored hashed; tests use a real Postgres |
| 2 | Delivery workers: claim deliveries from Postgres, send signed requests with timeouts, record every attempt, retry with backoff and `Retry-After` | Against a local test receiver, every delivery is attempted until success or its attempt limit; a worker killed mid-delivery leaves the delivery to be retried, not lost |
| 3 | Isolation: per-endpoint rate limits and concurrency, a circuit breaker for failing endpoints, and fair scheduling across customers | With one endpoint timing out on every request, other endpoints' delivery latency stays within a stated bound in tests |
| 4 | Dead letters, replay and secret rotation: inspect attempts, replay one delivery or a filtered set, rotate a secret with an overlap period | Replay never sends to an endpoint that has been disabled; during rotation receivers accept either secret; no secret ever appears in logs or API responses after creation |
| 5 | Security of outbound requests: block private and link-local addresses (including after DNS resolution and redirects), response size limits, header rules | Tests show requests to private ranges, metadata addresses and redirect tricks are refused |
| 6 | Dashboard and observability: endpoints, deliveries and attempts in a web UI, metrics, structured logs, and alerting rules | Playwright covers finding a failed delivery and replaying it; metrics match the database state in tests |
| 7 | Deployment and load: container image, compose file and Kubernetes manifests, a load test and a soak run with injected failures | A soak run with workers killed and an endpoint failing loses no delivery; benchmarks fail the build on regression |

## Rules

- Delivery is at least once. Receivers deduplicate with the delivery id, and the docs say so.
- Tests never call real third-party endpoints. A local receiver records what it gets.
- No secrets in logs, errors, URLs or the command line.
- Tests that need Postgres use a separate test database and never touch a developer's data.
