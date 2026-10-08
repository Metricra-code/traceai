# Implementation milestones

Acceptance means verified behavior, not just files existing.

- [x] Foundation: isolated Bun workspace, Next + Worker, D1 migration, shared contracts; install/typecheck/build and health check.
- [x] Core telemetry: actual SDK operation persisted in D1; SDK reliability tests and API authentication/idempotency tests.
- [ ] Analytics: indexed bounded windows, nearest-rank P95, keyset pagination and filters; integration evidence.
- [ ] Dashboard: API-backed charts, model comparisons, trace drilldown, user/project/key management.
- [ ] Demo: 10,000 deterministic simulated operations, read-only routes, no paid AI requests.
- [ ] Engineering: Vitest, Worker integration tests, Playwright, GitHub Actions, architecture/API/SDK/deployment docs.
- [ ] Publish: Metricra-code/traceai repository; verified public Cloudflare deployment. Requires correct GitHub login and Cloudflare account authorization.
- [ ] Later: OpenTelemetry integration AFTER MVP acceptance.

See the original requirements in product-spec.md. No core requirement is silently considered complete.
