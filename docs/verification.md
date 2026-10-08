# Full-product verification evidence

Recorded **2026-10-09 Taipei** with Bun **1.4.0**, Node **22.22.0**, actual Cloudflare
workerd/D1 and Chromium **156.0.8078.4**. This verifies the full supplied specification
plus the optional GenAI OpenTelemetry exporter, not just the earlier baseline MVP.
Local checks, live runtime, measurements and remote CI are distinct kinds of evidence.

## Current verified release

| Check                               | Actual result                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen installation                 | `bun install --frozen-lockfile` passed; 655 installs / 856 packages, no lock changes                                                                                           |
| Format / lint / strict TypeScript   | Whole-workspace checks passed; root scripts/E2E and all eight workspace typecheck commands included                                                                            |
| Unit tests                          | **168/168**, 14 files, **2.16s**; SDK 72 + real OTel 22, analytics/money/contracts/sanitizer/registry and migration compatibility                                              |
| Actual Worker/D1 integration        | **73/73**, five files, **9.91s**; real migrations, auth/tenant/key/ingestion/analytics/pricing/cleanup/rollback                                                                |
| Workspace production build          | SDK/shared/database declarations, optional exporter, Next and API Worker dry-run passed                                                                                        |
| OpenNext build                      | Next16.3.8 / OpenNext1.20.9 compiled and bundled successfully; no node_modules patch                                                                                           |
| Isolated public-package consumers   | Bun1.4.0 and Node22.22.0 runtime, strict public types with skipLibCheck=false, licenses/README and no private workspace runtime reference passed                               |
| Native Bun Next E2E                 | **17/17**, **1.6m**, with CI=1 and no retries                                                                                                                                  |
| Built OpenNext / actual workerd E2E | **17/17**, **42.2s**, after the native suite, with an isolated registry namespace                                                                                              |
| Live HTTPS E2E                      | **17/17**, **55.8s**, against the deployed web/API                                                                                                                             |
| Real SDK + OTel → Worker → D1       | Three stored operations; original result/error identity, genuine span IDs, safe summary, priced subtotal, dedup/revocation/cleanup passed                                      |
| Remote migration / registry         | Reviewed additive `0002` applied; columns, all three guards and migration record queried; two officially sourced snapshots explicitly imported and read back                   |
| Demo / screenshot                   | Existing 10,000-row simulated demo retained without remote reseeding; current loaded 30-day dashboard screenshot captured                                                      |
| Secret / scope review               | Tracked/new source, static bundles and public tarball contents reviewed; no real credentials, broad permissions or raw-error default capture found                             |
| Published-source GitHub Actions     | **Passed** for full-product source `70dd1a9`; [actual run](https://github.com/Metricra-code/traceai/actions/runs/37840304644), verify job **4m31s**, all required checks green |

The runtime versions are API **`8171f54a-127c-4982-b378-161868735bcc`** and web
**`1305011c-4719-4f64-99c6-a347dfbc6459`**. [Live demo](https://traceai-web.traceai-api.workers.dev/demo),
[API health](https://traceai-api.traceai-api.workers.dev/health). The [acceptance ledger](acceptance.md)
tracks all original requirements and the completed release gates. Runtime source revision is
[`70dd1a97f82beb57d381358aa6aa12a07974aa26`](https://github.com/Metricra-code/traceai/commit/70dd1a97f82beb57d381358aa6aa12a07974aa26).
The evidence-documentation follow-up does not change deployed runtime source. No earlier baseline
CI, health-only check or generated test file is substituted for the actual full-product verification.

The published-source Actions run used Ubuntu24.04, Bun1.4.0 and Node22.23.3. It passed all168 unit
and73 actual Worker/D1 cases, both packed consumers, native17/17 (**1.6m**) and built-workerd17/17
(**39.8s**). The table's local suite timings and Node22.22.0 are retained as separate observations;
CI does not deploy or run the production HTTPS suite.

## What the browser evidence actually covers

Original journeys still exercise real account registration/login → owned project → one-time key →
actual SDK → persisted analytics → fixed-range refresh → trace detail → rotation/revocation → deletion.
Security journeys reject missing/foreign Origin, unapproved BFF paths, demo writes, oversized bodies
and another owner's resources, and render escaped long project text on mobile.

Expanded journeys compare Average/P95/chart/model/meter values with the **real API**; exercise each
provider/model/status/time/exact-ID filter, both sort directions and cursor navigation; use keyboard
menu/Escape, persisted theme across route/reload, project rename/selector, clipboard success and denied
fallback; and inspect real explicit summaries, capture policy and simulated pricing provenance.
Loaded-content overflow checks cover nine critical routes at **320/390/768/1440px**.

The aggregate422 fallback and loading/500/retry/429/network/empty presentation tests are **explicitly
route-mocked UI scenarios**, not fabricated production responses. Their trace queries remain real where
stated. Actual API row-cap/error/auth semantics are covered separately by Worker/D1 integration.

Three axe cases scan public Overview/Models/Traces/detail in both themes, mobile login/register/401,
and authenticated Projects/Settings, open account menu and one-time key. Private scans include 390/1440px,
keyboard Tab between named code regions and actual ArrowRight scrolling. No rules are excluded or
violations ignored. Automated AA-tag scans and these keyboard checks are **not complete WCAG
certification**, human screen-reader testing or every imaginable viewport/content combination.

## Real deployed ingestion proof

`bun run verify:deployment` created a disposable account/project/key with production Secure,
HttpOnly/SameSite cookies. Two actual SDK operations retained their original success/error identities;
a real `BasicTracerProvider` exported a third already-ended GenAI span with its actual trace/span IDs.
No paid provider call occurred. Read-back checks confirmed:

- Three persisted operations, one failure; unknown grand-total price remains null.
- One priced `openai/gpt-4.1-mini` operation, 1,000 input / 500 output tokens,
  **1,200,000 nanoUSD ($0.0012)** known subtotal and official source/billing provenance.
- Explicit summary `Mock operation failed; token=[redacted]`; no raw original error, private prompt,
  raw span name or sample secret in responses.
- Replay accepted with zero new rows / one duplicate; revoked key rejected 401.
- Project/keys/traces deleted and session logged out. Test account records remain because account deletion
  is deliberately not implemented. Never publish live Playwright traces containing disposable credentials.

## Measured performance — current deployed release

Safe aggregate output, timestamps, individual browser samples and all SDK repeats are retained in
[performance.json](assets/performance.json). These are client-observed samples, **not an SLA**.
Developer Taipei/macOS path, AppleM2/8 logical CPUs/16GiB; unthrottled network and CPU.

### Dashboard initial usability

At **2026-10-08T20:18:27.628Z**, 1440×1040 Chromium, default seven-day simulated view of the
10,000-row demo. Usable means Total/P95 visible, six panels sized and five SVG charts rendered.

| Browser cache                  | Samples | Individual usable times |    P50 | Nearest-rank P95 | Below 3s |
| ------------------------------ | ------: | ----------------------- | -----: | ---------------: | -------- |
| Fresh isolated contexts        |       3 | 2222 /1550 /1584ms      | 1584ms |           2222ms | 3/3      |
| Same-context repeat HTTP visit |       3 | 1102 /1063 /953ms       | 1063ms |           1102ms | 3/3      |

A fresh browser cache does not force a cold Cloudflare isolate. This includes network, hydration and
API waterfall; no mobile-network/CPU throttling, universal geography or cold-edge claim is made.
Browser readiness is not inferred from API timing.

### Analytics API

At **2026-10-08T20:19:30.846Z**, fixed 30-day window containing 10,000 persisted simulated traces,
**20 timed samples per endpoint after one excluded warm-up**. Round-trip includes network and JSON;
D1 served from APAC/NRT, not measured Worker CPU/provider latency.

| Endpoint |   P50 |   P95 | Maximum |
| -------- | ----: | ----: | ------: |
| Overview | 200ms | 244ms |   306ms |
| Metrics  | 187ms | 212ms |   281ms |
| Models   | 178ms | 280ms |   301ms |
| Traces   | 135ms | 145ms |   153ms |

These observed P95s met the 500ms target for this bounded warm-client sample, not every production workload.

A separate modest-traffic observation at **2026-10-08T20:20:29.258Z** rotated the four endpoints,
30 sequential requests at 2-second start intervals over 58,208ms. **30/30 HTTP 200**, P50 190ms,
P95 435ms, maximum 455ms; first/failed samples are not excluded. Approximately one minute is **not** a
production soak, peak-concurrency/CPU test or sustained capacity guarantee.

### SDK overhead

The [SDK benchmark](sdk.md#repeatable-overhead-benchmark) reports equal 1,000-operation warm-up,
10,000 operations × five repeats at concurrency 1/50/1,000. Each repeat acknowledged 10,000 events
in 200 batches with zero drops. Stub transport/no provider/network: median added mean 0.02153 /
0.02047 /0.01085ms; wrapped sample P95 0.01496 /0.63483 /13.659ms. Concurrent P95 includes wave
scheduling delay, not one call's CPU overhead. The run overlapped local browser work; results are not
cherry-picked or presented as production delivery capacity.

## Regressions caught, not bypassed

- **Remote D1 migration:** local SQLite accepted bare `SELECT CASE ... END` in trigger bodies, but remote
  `/query` failed with `incomplete input: SQLITE_ERROR [7500]`. Read-only checks proved full rollback
  before any new API deployment. Parenthesizing the four CASE expressions preserved every immutable/
  overlap/abort guard. Two syntax/splitter regressions and actual D1 semantics passed; the corrected
  migration then applied remotely, and columns/three guards/tracking were queried. No manual migration
  marking, disabled guard, dependency patch or unexplained retry. [Cloudflare report](https://github.com/cloudflare/workers-sdk/issues/4727),
  [workaround](https://github.com/cloudflare/workers-sdk/issues/4326).
- **Accessibility:** real scans caught light simulated-tag contrast, inline links, hidden mobile auth heading,
  unfocusable horizontally scrolling SDK code and modal-account-menu aria-hidden focus. Fixes changed
  rendering/semantics; scans remained enabled. Account navigation uses Radix's genuine nonmodal menu.
- **SDK concurrency / timing:** the copied active-operation Set caused O(N²) bookkeeping; a 10,000-active
  callback regression now uses a counter/barrier. Exact fractional ordering rejects reversed 1ns intervals
  before API millisecond canonicalization; fractional duration remains available.
- **Refresh:** core E2E preserves the fixed custom-query URL and asserts a backdated insert changes the
  total from 2 to 3 after Refresh, rather than only changing the date range to conceal stale cache.
- **Next/OpenNext compatibility:** the earlier Next16.4 bundle built but failed dynamic requests with
  `Unexpected loadManifest(/.next/server/preview-props.json) call!`. Next16.3.8/OpenNext1.20.9 is pinned;
  built-workerd checks catch adapter issues that dev/build alone misses. [Upstream fix](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356).
- **CI registry lifecycle:** force-killed dev servers left stale Miniflare service discovery. Each managed
  E2E run now uses a unique `WRANGLER_REGISTRY_PATH` shared by its children; no global deletion or retries.
  The earlier [baseline runtime CI](https://github.com/Metricra-code/traceai/actions/runs/37831615087)
  confirmed the fix, but is not proof of the expanded source. [Playwright lifecycle](https://playwright.dev/docs/test-webserver).

## Repeatable commands

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run test:packages
bun run db:migrate
bun run db:pricing --local
bun run db:seed
bunx --no-install playwright install chromium
bun run --filter @traceai/web build:cloudflare
CI=1 bun run test:e2e
CI=1 bun run test:e2e:workers
bun run verify:deployment
TRACEAI_E2E_BASE_URL=https://traceai-web.traceai-api.workers.dev \
TRACEAI_E2E_API_URL=https://traceai-api.traceai-api.workers.dev bun run test:e2e
TRACEAI_DASHBOARD_URL=https://traceai-web.traceai-api.workers.dev/demo bun run benchmark:dashboard
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun run benchmark:api
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun run benchmark:sustained
```

Live smoke/E2E write only disposable private test projects, not the public demo. Read-only benchmarks
still consume Free quota; keep their sample caps, inspect [operations](operations.md), and never remote
reseed or enable paid resources merely to manufacture a green benchmark. CI runs locally without
automatic deployment and uploads failure artifacts only from disposable local environments.
