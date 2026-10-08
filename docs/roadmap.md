# Implementation and acceptance milestones

Checkmarks mean the described scope is implemented with the stated evidence, not an enterprise SLA.
The original product specification remains unchanged in [product-spec.md](product-spec.md).

## Implemented

- [x] Independent Bun workspace; strict TS, Next/OpenNext, Hono, Drizzle/D1 migrations and shared schemas.
- [x] Core telemetry: real persisted SDK operation, atomic/idempotent ingestion, versioned pricing and rate limits.
- [x] Standalone SDK: original results/errors, bounded batch/queue including in-flight, jitter/retry/timeout,
      privacy, explicit usage, flush/shutdown; 58 reliability tests and independent package consumption.
- [x] Analytics: scoped indexes, 31-day/20k bounds, nearest-rank P95, exact nanodollars, UTC zero-filled buckets,
      model comparison, exact search and stable keyset cursors; 28 unit and 23 real D1 integration tests.
- [x] Management APIs: private native-scrypt DO, sessions, Origin checks, owned projects, raw keys once,
      atomic rotation/revocation and deletion confirmation; dedicated Worker integration slices.
- [x] API-backed dashboard screens: overview/charts, models, traces/detail, account/project/settings flows,
      loading/error/empty states and responsive controls.
- [x] Public read-only demo routes, 10,000 deterministic simulated traces and fictional pricing isolation.
- [x] Engineering artifacts: architecture/API/SDK/deployment docs, Vitest/Worker tests, Playwright journeys
      and GitHub Actions with no automatic deployment.

## Acceptance evidence and outstanding gates

- [x] Complete MVP: 103 unit tests, 59 actual Worker/D1 integration cases, lint/typecheck/formatting passed.
- [x] Built OpenNext/workerd: all seven Playwright management/demo/mobile/security cases passed.
- [x] [Public demo](https://traceai-web.traceai-api.workers.dev/demo) and API HTTP 200 after compatibility fix.
- [x] Real deployed session/password DO → SDK → D1 → duplicate replay → revoked-key rejection → cleanup smoke.
- [x] Fixed 30-day/10k API sample: 20 measurements/endpoint, observed warm-client P95 174–343ms.
- [x] All seven live-browser journeys passed on deployed HTTPS, including management/SDK and security.
- [x] Latest native Bun Next16.3.8 development E2E: seven journeys passed; final workspace build passed.
- [x] Fractional/UTC timestamp pricing regressions verified in the final 59-case Worker/D1 suite.
- [x] [GitHub Actions](https://github.com/Metricra-code/traceai/actions/runs/37831615087) passed for published runtime revision `3d3c184`, including both E2E modes.
- [ ] Sustained traffic/CPU/quota observations, cold/page-load measurements and retention policy.

Next is pinned to 16.3.8 while the adapter's [16.4 manifest fix](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356)
remains unreleased. The first frontend publication exposed a dynamic-route failure despite a green build;
actual workerd E2E and live service-binding checks caught and verified the fix without dependency-source patches.

Sustained operational observations remain follow-up work, not an enterprise SLA claim. See [verification](verification.md) for current
sample/environment evidence and [deployment](deployment.md) for manual configuration/rollback.

## After v1 acceptance

1. OpenTelemetry adapter mapping the existing operation model; preserve privacy, usage and lifecycle semantics.
2. Provider-specific optional usage adapters and nested spans only with genuine instrumentation.
3. Retention/operational monitoring, password recovery/email verification/MFA and abuse hardening as needed.

No billing, teams, collectors, queues or model-quality claims are required for this portfolio MVP.
