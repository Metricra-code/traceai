# Full-product verification evidence

Recorded **2026-10-09 Taipei** with Bun **1.4.0**, Node **22.22.0**, actual Cloudflare
workerd/D1 and Chromium **156.0.8078.4**. This verifies the full supplied specification
plus the optional GenAI OpenTelemetry exporter, not just the earlier baseline MVP.
Local checks, live runtime, measurements and remote CI are distinct kinds of evidence.

## Verified full-product baseline (2026-10-09)

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

## Continued strengthening — local work, 2026-10-10

The earlier release/CI evidence is historical evidence for its recorded revisions, **not proof of
these uncommitted changes**. This slice has not been published, pushed or deployed. The public
SDK remains the separately verified npm `0.1.0`; no real model calls or additional production/provider
credential creation were performed in this slice. Browser tests create only disposable local keys.

### Evidence-led changes

- **Investigation continuity:** validated UTC window, trace filters, sort and current cursor in
  dashboard URLs. Detail / All traces, browser Back, reload and shared views retain the query.
  Trace filters apply to the trace explorer; Overview / Models use the selected UTC window.
  Cursor predecessors live only in the frame, bounded to four scopes / 40 recent entries per scope.
  A shared cursor without known history shows `Current page` and `First page`, not invented page
  numbers. Filter/window changes reset the cursor. No credentials or permanent browser storage.
- **Current reads only:** all 12 query functions consume the query signal. Intentional aborts do
  not become offline alerts. This cancels obsolete browser transport; it does **not** prove that
  an already-started Worker/D1 query stops. Preset refresh does not also refetch the old snapshot;
  custom refresh keeps its exact window and URL.
- **Cursor compatibility:** the former 2,048-character cap could reject the API's own cursor after
  JSON-escaping valid labels. The canonical v1 maximum is derived as 3,608 characters, with
  over-budget input rejected before decoding. Existing project/filter/sort scope checks remain.
- **OTel demo deadline alignment:** both provider force-flush and processor export deadlines use
  90s for the tiny two-event demo. Raising only the processor deadline still timed out at the
  provider's default 30s. These are not universal multi-batch/drain guarantees. Core SDK published
  vs unpublished optional adapter documentation is reconciled.
- **Linear provider aggregation:** one Map pass replaces a nested model-list scan, preserving
  first-seen order, zero totals, prototype-like provider labels and immutable inputs. Offline
  assertions on actual helper source show identical output at 1,000 distinct providers with
  1,000 label reads vs 1,001,000 for the previous expression; the 20,000-item case reads each
  provider once. These are algorithmic-work observations, not measured UI/network speedups.
- **Related continuity edges:** the inline model-comparison link retains the snapshot, and
  shared exact provider/model values stay visible even when suggestions contain no matching group.
- **History editor reset:** unapplied custom-date drafts/errors are cleared when browser history
  restores another URL snapshot; the persistent frame, query cache and pagination history remain.
- **Native trace-ID validation:** JSX requires one literal backslash in the HTML pattern. The old
  double backslash was invalid under the browser's `v` regex flag and let `bad/id` submit silently.
  The browser regression also checks legal hyphens/underscores and clearing the search.
- **Clean-checkout type boundary:** the real OTel demo entrypoint regression exposes the adapter's
  own public import during typechecking. A type-only source alias resolves it before `dist` exists;
  package exports, runtime imports and npm versions are unchanged.

### Actually completed focused checks

- API cancellation boundary: **5/5** focused Vitest tests passed after a real failing abort-identity
  regression; native QueryObserver unsubscribe is exercised with stub transport.
- URL/history helper: **14/14** focused cases passed; invalid/duplicate boundaries, canonical
  dates, cursor cap, isolated scopes and bounded history are covered.
- Analytics query boundary: **22/22** focused unit cases passed. Real Worker/D1 newest/oldest
  continuation regressions failed with HTTP 400 before the fix; **75/75** actual integration cases
  passed afterwards. No migrations, pricing imports, quota increases or remote writes.
- Runnable OTel entrypoint: real BasicTracerProvider / BatchSpanProcessor plus source exporter,
  fake time and stub HTTP `429 → 202` passed the deadline regression. The focused SDK/OTel/Gemini
  offline suite was **157/157**, adapter **23/23**. It proves two HTTP-acknowledged events, not D1
  storage or paid-provider traffic.
- Actual native Playwright report at **2026-10-10 05:12 Taipei** confirms **2/2**, no retries,
  failures or skips: investigation continuity and refresh request counts. The first uses real
  read-only local demo endpoints; the private refresh scenario explicitly mocks its API responses.
  The newer inline-link / missing-suggestion / cancellation cases were not part of that earlier
  2/2 result; later current-source runs are recorded below.
- The custom-editor/history case was subsequently reproduced at the native browser seam:
  Back expected `7` but received `custom`. The surgical reset then passed the strengthened
  **1/1** case, including invalid draft/error, Back/Forward and reseeding from the restored URL.
- Native trace-ID regression failed with `patternMismatch: false` for `bad/id` before the fix.
  After the fix, trace validation and actual obsolete-request cancellation passed **2/2** in
  the same-source non-cloud copy. Cancellation requires `net::ERR_ABORTED` before route cleanup.
- A clean frozen-install typecheck exposed **TS2307** in the OTel actual-entrypoint test.
  The focused adapter/demo checks passed with `dist` still absent after the type-only fix;
  the subsequent full workspace typecheck passed.
- Current full native first run was **22 passed / 2 failed**, not a release pass. The management
  fixture now explicitly proves the pre-ingestion query cutoff keeps the count at zero, then Refresh
  advances the cutoff while preserving a 24h preset and exposes two real SDK events; the revised
  full management journey passed **1/1**. The error/retry fixture must keep its injected 503 until
  the explicit retry, rather than consume it on React's canceled development probe; the corrected
  named loading/error/retry/empty-state journey passed **1/1** without weakening its assertions.
- Final full browser runs passed **24/24 native Next** (2.2m) and **24/24 built-workerd** (41.0s,
  `CI=1`, Node22.22.0, normal command without debug). They include the new regressions, real local
  SDK ingestion, key rotation/revocation, mobile widths and automated AA checks. Explicitly mocked
  loading/error/empty/422 scenarios remain identified as such; they are not real provider traffic.
  An earlier local Node24 startup attempt exited before any tests. A diagnostic run then passed
  24/24, followed by the normal Node22 full run above. The first startup failure's cause was not
  established; no assertion was weakened and no permanent startup-flake fix is claimed.
- Scoped frontend ESLint and explicit-file formatting passed. Additional pure provider-aggregation
  assertions passed using Node22.22.0 type stripping while normal workspace commands were blocked;
  this is **not substituted** for the pending full Bun-orchestrated checks / Vitest tests.

### Baseline measurement and remaining gates

The read-only production seven-day demo benchmark at **2026-10-09T21:07:17.754Z** measured
fresh-context usability **1,752 / 1,636 / 1,577ms** (P95 1,752ms), and same-context visits
**1,517 / 1,009 / 969ms**. Desktop Chromium156 / 1440×1040, unthrottled, three samples per mode.
This is a before observation, not a new-release result, cold-edge proof, mobile-network benchmark
or SLA. No after-deployment acceleration percentage is claimed.

Finder Download Now restored the three exact placeholder files: original bytes were read and
Foundation reported `NSURLUbiquitousItemDownloadingStatusCurrent`. The original workspace then
passed frozen install, full format/lint/types, **369 unit / 75 actual Worker-D1** tests. macOS later
evicted `packages/config/tsconfig.base.json` again; original dev-route reads and Git status stalled.
An accepted download is not a permanent residency guarantee. No unread placeholder was overwritten,
ignore/type rule removed, unrelated file deleted, or system File Provider service restarted.

Continued checks on **2026-10-11 Taipei** use a credential-free verification checkout at
`/private/tmp/traceai-verify-20261011-frj688e7/traceai`. Its baseline is exact published source
`2fddb959fc4439f5dfc45108d3e94f45d773c7b9`, overlaid with current changed/new source files. SHA-256
comparisons against the original files are recorded in its ignored source manifest; no private
`.local/gemini.env`, actual `.env` or `.dev.vars` was copied. This is same-source **local** evidence,
not a new CI or deployed release. The unchanged baseline ignore/strict-type rules remain intact.
Only disposable local databases/accounts/keys are used; migrations, pricing imports and demo seed
operate locally, with no real provider calls or production writes.

- [x] Original placeholder bytes restored and inspected; scoped original `git diff --check` passed.
      Original full Git status can still stall; inspect it again before any commit/push.
- [x] Frozen Bun install, whole-workspace format/lint/types, **369 unit / 75 Worker-D1** tests in
      the non-cloud copy after the implementation fixes. Intermediate clean-typecheck failure is
      recorded above rather than treated as a pass.
- [x] Public SDK/adapter builds and isolated strict types, MIT license and actual Bun1.4 / Node22
      and Node24 packed consumers passed. These local tarballs were not published.
- [x] All workspace builds, API dry-run bundle, OpenNext build and compiled environment guard passed.
- [x] Full current native and built-workerd browser suites: **24/24 + 24/24**, including new
      regressions and AA. Build success alone is not substituted for runtime verification.
- [x] Reproduce/fix the unapplied custom-editor/history case at the actual browser seam.
- [x] Independent current-source review and changed-file/manifest scope reconciliation. No new
      runtime/security blocker found; common provider-token/private-key scans found no matches in
      changed source. No credential files, package versions, public exports, lockfile or CI workflow
      were changed. This is bounded review evidence, not a universal secret/privacy guarantee.

The original full Git status still timed out, including a bounded tracked-only probe. Scoped original
diff checks and readable changed-source hashes passed, and full status/diff checks passed in the
same-source verification copy. Preserve the original checkout and inspect full status before any
commit/push; do not infer that its cloud residency problem is fixed. The current local slice remains
uncommitted and undeployed: published-source CI, manual deployment and live after-measurement are
separate future steps, not checked gates for this local improvement.

No older CI result or health check proves these locally verified changes. Production health was separately
observed HTTP200 during the follow-up; the live product was not replaced by this unverified slice.

## Trace-start window clarity — local validation (2026-10-11 Taipei)

The continued slice now makes the applied investigation window visible. Boundaries use exact UTC
milliseconds and actual `<time datetime>` values: trace `startedAt` is **from-inclusive / to-exclusive**,
not filtered by ingestion time. A fixed query window is not a frozen set of rows: later-ingested or
backfilled traces within it can appear on refetch. No polling, timer or extra query was added.

- Preset Refresh sets the cutoff to now; it may move a future-dated shared window backwards.
- Custom Refresh reloads the same window. Settings/detail retain the analytics window for navigation,
  but explicitly say it does not filter that page; their Refresh does not move its cutoff.
- The date selector and Refresh describe their behavior through the same accessible note. Visible
  milliseconds preserve the demo's `anchor + 1ms` exclusive boundary, including at 320px.
- Current/local screenshots and the matched Better Stack time-filter reference are in ignored
  `.lazyweb/design-improve/snapshot-cutoff-2026-10-11/report.html`; no private dashboard was uploaded.

The new browser case first failed because the named window region was absent. An intermediate
assertion incorrectly compared a noncanonical incoming URL with the canonical return URL, and a
new Settings assertion used the wrong heading; those test-fixture mistakes were corrected to match
the actual navigation contract. A strict noUncheckedIndexedAccess test error was also corrected.
These attempts are not counted as passes, and no product assertion was bypassed.

Final same-source local checks passed: full format/lint/types, **369 unit / 75 actual Worker-D1**,
all workspace builds, guarded OpenNext build, isolated Bun1.4/Node24 packed consumers, **25/25 native
Next** (1.7m) and **25/25 built-workerd** (43.6s, Node22.22.0, normal `CI=1` command). Browser checks
include automated AA in both themes, 320/390/768/1440 layouts, genuine local SDK storage, ownership,
keys and explicit mock scenarios. The new/extended window journeys also passed **6/6** independently.
The 35-file source manifest matches the original checkout; published SDK core/version/exports,
lockfile, CI workflow and deployment configuration are unchanged.

One bounded read-only Git probe established that original tracked refresh was blocked reading
`.gitignore`: its own open handle and stack were in `refresh_index -> read_in_full -> read` while
index loading took 0.000340s. A single coordinated download then restored its 235 bytes and matching
hash. A subsequent tracked-only status still timed out at 12s; complete original Git recovery and
the remaining blocking file are not established. No placeholder/index overwrite, flag change or
system-service restart occurred. The credential-free non-cloud checkout has complete status/diff
checks and is the explicitly reviewed release candidate; original files and Git metadata are preserved.

The owner explicitly authorized push, a new CI run, and deployment only after it succeeds. At this
local checkpoint, those remote gates remain pending; npm `0.1.0` is not republished. Deployment/CI
results must be recorded separately rather than inferred from these local passes.
