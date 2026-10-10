# Implementation and release milestones

The goal is the **full original product**, not a reduced MVP. Requirements remain unchanged in
[product-spec.md](product-spec.md); [acceptance.md](acceptance.md) is the section-by-section ledger.
A checked implementation item below means source exists with corresponding tests/documentation,
**not by itself** a claim of passing CI or live deployment verification; those actual results are recorded below.

## Implemented product scope

- [x] Independent Bun workspace: strict TypeScript, Next/OpenNext, React Query/TanStack Table/Recharts,
      Hono, Drizzle/D1 migrations and shared Zod boundaries.
- [x] Standalone SDK: original async result/error identity, explicit usage, bounded queue including
      in-flight events, count/UTF-8-byte batching, transient-only full-jitter retries, bounded Retry-After,
      timeout, singleflight flush and deterministic shutdown. Concurrent callback tracking is constant-state.
- [x] SDK privacy and adapters: failure-only opt-in sanitized summary, scalar metadata snapshots,
      strict completed-event recording and actual HTTP-acknowledged/drop receipts. No automatic raw errors.
- [x] Core persistence: owned-key atomic ingestion, project-scoped deduplication, rollback, rate/body/token
      bounds, exact fractional UTC validation and integer nanodollar pricing.
- [x] Indexed analytics: UTC half-open windows, 31-day/20,000-row cap, nearest-rank P50/P95/P99,
      zero-filled buckets, model comparisons, exact server filters and stable keyset cursors.
- [x] Management/security: private native-scrypt Durable Object, secure expiring sessions, Origin/ownership
      checks, projects/descriptions, raw keys once, rotation/revocation and confirmed project deletion.
- [x] Usable dashboard: Average and P95 KPIs, request/latency/token/priced-cost/provider/model visualizations,
      traces/detail, server filtering/sorting/pagination, identity/theme/project controls and settings.
      Loading/error/empty states, exact-filter fallback, clipboard fallback and mobile navigation are implemented.
- [x] Safe debugging/provenance: explicit marked error summaries, truthful single-operation timing and sourced
      pricing details; legacy unmarked raw errors stay private. Unknown/incomplete cost is null, not zero.
- [x] Sourced pricing registry: validated operator-only import, immutable versions/effective windows,
      verification/source/billing provenance and historical cost preservation; fictional demo prices are isolated.
- [x] Public read-only demo: deterministic 10,000 simulated operations over 30 days, visibly simulated,
      anonymous reads without project writes or paid AI credentials.
- [x] Bounded expired-session/rate-counter maintenance and explicit no-hidden-trace-expiry policy.
- [x] Engineering artifacts: architecture/API/SDK/deployment/pricing/operator/troubleshooting documentation,
      unit/real Worker-D1/browser test sources, accessibility checks and CI without automatic deployment.

## Optional post-first-version integration — now implemented

- [x] Separate `@traceai/opentelemetry` GenAI `SpanExporter`, preserving genuine completed span IDs,
      high-resolution timestamps/duration and validated allowlisted usage attributes.
- [x] Privacy-safe mapping, byte/queue/admission bounds, honest export callbacks, forceFlush/shutdown,
      real OTel SDK tests and a no-credential in-memory provider example.
- [x] Bun-packed public SDK/adapter artifacts, MIT license files, isolated strict public-type checks and
      actual Bun/Node runtime consumers. No private workspace runtime dependency. Core SDK
      `@akai_80percent/traceai-sdk@0.1.0` is published; the optional adapter remains **unpublished**.
- [x] Repeatable concurrent SDK benchmark with equal warm-up, hardware/runtime/sample/loss reporting;
      public API/browser/modest-traffic measurement scripts document what they do and do not measure.

The SDK/adapter's focused tests, typechecks, builds and packed consumers have local passing evidence
in [SDK](sdk.md) and [OpenTelemetry](opentelemetry.md). The expanded whole-product local and live
results are recorded in [verification](verification.md), alongside the separate passing published-source CI.

## Historical expanded-release gates (2026-10-09)

Current recorded results are in [verification](verification.md) and the detailed [acceptance ledger](acceptance.md).

- [x] Requirement/source/security review; original non-goals and privacy/cost invariants preserved.
- [x] Frozen install, format/lint/strict TypeScript,168 unit and73 actual Worker/D1 tests.
- [x] Workspace/OpenNext builds and isolated Bun/Node packed consumers on current source.
- [x]17 native Next and17 built-workerd journeys, loaded-content mobile/keyboard and automated AA checks.
- [x] Authorized additive migration and real-price import; private backup and prior Worker IDs retained.
- [x] Current API/web deployed; three real SDK/OTel operations, exact price/privacy/key checks,
      and17 live-browser journeys passed. No remote demo reseed.
- [x] Actual [GitHub Actions](https://github.com/Metricra-code/traceai/actions/runs/37840304644) passed
      for expanded runtime source `70dd1a9`; earlier baseline CI is not substituted.
- [x] Final documentation/secret/scope reconciliation after that dated run; later follow-up gates below are separate.

Next remains pinned to **16.3.8** until a compatible adapter release passes actual workerd dynamic routes.
Source implementation, locally green checks, a deployed health route and a passing published-source CI
are separate evidence; do not collapse them into a completion claim.

## Boundaries after release

- No exactly-once/durable SDK queue, unlimited analytics, enterprise SLA or model-quality inference.
- No OTLP collector/receiver, metrics/log backend, automatic provider patching or invented distributed span tree.
- No automatic trace deletion or unbounded paid load testing. Quotas, user-controlled deletion and
  measured sample scope are documented in [operations](operations.md).
- Further provider instrumentation or additional signals require separate real instrumentation and explicit
  scope. They are not missing original requirements and must not silently enlarge this portfolio.

For a short, evidence-led presentation, use [interview-guide.md](interview-guide.md).

## Continuous-improvement follow-up (2026-10-10)

The verified release above remains a dated baseline. A new local slice improves investigation
continuity, query cancellation/refresh efficiency, cursor compatibility, linear provider aggregation
and runnable OTel deadlines. Focused checks and the remaining current-source gates are recorded
under [continued strengthening](verification.md#continued-strengthening--local-work-2026-10-10).
This slice was subsequently pushed as `ff26876`, passed its new CI and was manually deployed on
2026-10-11. The credential-free, same-source non-cloud checkout preserves the original cloud
checkout because placeholders can be evicted again. The first full live suite was **20/25**, not
a passing acceptance release. The subsequent cache rollout below passed the expanded live suite;
the initial result and resource/transport limitations remain in [verification](verification.md#published-source-rollout-and-first-live-results-2026-10-11-taipei).

## Current shell-cache follow-up gates (2026-10-11)

- [x] Minimal read-only static-assets cache/interception and guarded build-time population implemented;
      no private API caching, R2, revalidation queue/tag cache, paid-plan change or npm republish.
- [x] Actual configuration/BFF contracts: **4/4** after recorded RED; full unit suite **373/373**.
- [x] Old compiled cache-hit regression reproduced; new guarded artifact **26/26 built-workerd** passed,
      including HTML/RSC/segment-tree cache hits and private 401/no-store behavior.
- [x] New native **26/26**, full typecheck/lint/format and **75 actual Worker-D1** tests passed.
- [x] Exact source `f140c06` [new CI passed](https://github.com/Metricra-code/traceai/actions/runs/38070087528),
      then the authorized exact-artifact web deployment; API/data/bindings were retained.
- [x] Full live **26/26** and repeated three-operation SDK/OTel smoke passed; bounded three-sample
      cold/warm browser measurements recorded, with the first **20/25** result retained.
- [x] README/acceptance/deployment/verification and safe measurement evidence reconciled with
      dated runtime-source CI, active versions and explicit operational limitations.

[Latest live evidence](verification.md#shell-cache-rollout--live-acceptance-2026-10-11-taipei) is a
bounded passing acceptance run, not proof of the earlier resource cause, permanent Error 1102
resolution, a CPU-savings claim or an SLA. Original cloud Git status can still stall. The core npm
SDK remains `@akai_80percent/traceai-sdk@0.1.0`; the optional OTel package remains unpublished.

## Real public entry with a separate simulated Demo (2026-10-11)

- [x] Owner-approved five-field projection of the three real Gemini SDK operations, checked by
      scoped read-only D1 read-back; private project sharing, keys, content and identifiers excluded.
- [x] Main `/showcase` page, actual per-call metrics, server filtering/sorting and explicit read-only
      recorded/small-sample/non-live labels; separate `/demo` and two-way source switch retained.
- [x] Strict isolated public GET endpoint with no D1/session/private BFF/provider access at runtime;
      no schema/API Worker/SDK/lockfile changes or additional paid/model calls.
- [x] Meaningful RED/GREEN, **418 unit / 75 actual Worker-D1**, strict types/lint/format locally green.
- [x] Full native **30/30** and guarded built-workerd **30/30** journeys, including recorded-real
      server filters/source switch/privacy/responsive/AA and cached shell regression.
- [ ] Published-source CI.
- [ ] CI-gated exact web deployment, repeated live acceptance and final evidence reconciliation.

This public snapshot is real historical workflow evidence, not simulated traffic or a model benchmark.
Future private operations are not published automatically; each update needs an explicit reviewed
allowlist projection and deployment. [Scope](demo.md#recorded-real-measurements--separate-public-entry).
