# Verification evidence

Evidence recorded on **2026-10-09** with Bun 1.4.0, Node 22 toolchain and actual workerd/D1.
Local checks, live deployment and remote CI are distinct; no unrun check is marked passed.

## Verified evidence

| Check                     | Evidence                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Fresh installation        | `bun install --frozen-lockfile` passed on a clean isolated dependency tree                                              |
| Workspace unit suite      | **103/103 passed in 3.44s** on the complete MVP; whole-workspace lint, strict typecheck and formatting also passed      |
| SDK unit suite            | 58/58 Vitest tests passed; result/error identity, bounds, retries, byte budgets, flush/shutdown races                   |
| Analytics unit suite      | 28/28 passed; percentiles, exact money/known subtotal, zero-fill, UTC windows and scope-bound UTF-8 cursors             |
| Analytics Worker/D1 suite | 23/23 passed after real migrations; auth/scope, P95, both pagination orders, filters, row cap and read-only demo        |
| Entire Worker/D1 suite    | **59/59 passed in 13.47s** against actual workerd/D1: auth, keys, analytics and timestamp pricing regressions           |
| Ingestion Worker/D1 suite | 16/16 passed; persistence, idempotency, fractional/UTC pricing windows, 50 events, rollback/revocation/rate limits      |
| Built OpenNext E2E        | **7/7 Playwright cases passed in 22.4s** against actual workerd: demo/mobile, management/SDK lifecycle and security     |
| Native Bun Next-dev E2E   | **7/7 Playwright cases passed in 49.9s** on Next16.3.8, including demo/mobile, real management/SDK and security         |
| Final workspace build     | `bun run build` passed: shared, SDK, database, Next and API Worker dry-run                                              |
| Live browser E2E          | **7/7 Playwright cases passed in 19.4s** on deployed HTTPS, including management/SDK/key rotation, login and security   |
| API source checks         | API typecheck and scoped analytics ESLint/Prettier passed                                                               |
| SDK package               | ESM/types build and independent Node/Bun consumer import/trace/shutdown passed; no private runtime workspace dependency |
| SDK benchmark             | Native Bun stub transport: 10,000 events, 200 batches, zero drops; not provider/network latency                         |
| Real SDK → Worker → D1    | Verified locally and deployed: original success/error preserved, two persisted events, unknown price null, replay dedup |
| Live management smoke     | Secure/HttpOnly/SameSite cookies, account/project creation, key revocation, confirmed cleanup and logout passed         |
| Deterministic seed        | Exactly 10,000 explicitly simulated operations in the separate demo project                                             |

Built-workerd, native Bun Next-development and live-browser runs are green, as is the final workspace
build. The final integration run includes the two additional fractional/UTC timestamp pricing
regressions. Remote GitHub Actions evidence is the only remaining publication check; no pending
test count is presented as a successful result.

Final review also reproduced a fixed-custom-range refresh bug: a backdated insert kept the total
at two after Refresh. Scoped query invalidation fixes it; all three E2E modes now assert the same
custom-query URL refetches and the count becomes three. Secure scrypt parameters remain unchanged;
the four-KDF private-DO integration case has a focused 20s local test allowance, not a production SLA.

## CI lifecycle isolation

The [first complete-MVP CI run](https://github.com/Metricra-code/traceai/actions/runs/37830070309)
passed unit/integration/build and Next-dev E2E, but its following workerd suite received proxy 503s
while direct API health stayed 200. Installed Miniflare refuses to replace another instance's fresh
registry definition for 90 seconds; Playwright's default process-group SIGKILL bypasses cleanup.
The resulting stale RPC discovery explains why a fresh standalone workerd run could pass.

Each managed E2E invocation now gets a unique `WRANGLER_REGISTRY_PATH`, shared by its API/web children.
No global registry deletion, added retries, weakened assertions or production fallback is used.
The exact `CI=1` Next-dev → built-workerd sequence subsequently passed seven cases in each mode;
the workerd run completed in 11.9s. Remote confirmation remains a separate gate.
[Playwright process lifecycle](https://playwright.dev/docs/test-webserver).

## Deployment regression and compatibility pin

The first published frontend failed dynamic requests with
`Unexpected loadManifest(/.next/server/preview-props.json) call!` despite a successful OpenNext build.
Next 16.4.0 moved preview data to a new manifest omitted by OpenNext 1.20.9. The installed adapter
source and [upstream fix PR1356](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356) agree
on this cause. Next is now pinned to **16.3.8**, the latest patched 16.3 release; no dependency-source
patch or empty-manifest fallback is used.

After the pin, the rebuilt OpenNext bundle passed all seven journeys in actual workerd, including
dynamic pages and the same-origin API route. Deployed frontend/API HTTP returned 200, and
`bun run verify:deployment` passed real session/project/SDK persistence/replay/revocation/cleanup checks.
The regression is fixed without changing dependency source. All seven live-browser journeys also
passed; remote CI evidence remains separate from HTTP/build/browser success.

## Repeatable final checks

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run db:migrate
bun run db:seed
bunx --no-install playwright install chromium
bun run test:e2e
bun run --filter @traceai/web build:cloudflare
bun run test:e2e:workers
bun run verify:deployment
```

Playwright source includes public demo/filters/detail, mobile overflow, and the actual account → project →
SDK ingestion → dashboard → rotate/revoke → rejected old-key flow. A test existing is not a green run;
built-workerd, native Bun Next-development and live-browser suites are all green.
Failed runs retain `playwright-report/` and `test-results/` artifacts.
CI also runs `test:e2e:workers` against the built OpenNext Worker to catch dynamic-route/adapter
regressions that `next dev` misses. It executes checks without deployment and uploads failure artifacts; consult its real GitHub Actions run,
not this table, for remote evidence.

## Deployment and measured performance

- [Live demo](https://traceai-web.traceai-api.workers.dev/demo)
- [API health](https://traceai-api.traceai-api.workers.dev/health)
- Production SDK endpoint: `https://traceai-api.traceai-api.workers.dev`

The live smoke created a disposable real account/project/key, verified production cookie security,
used the actual SDK for a success and original-error failure, read two persisted traces, checked
unknown-price null and duplicate replay, revoked the key and confirmed ingestion rejection, then
removed its project and logged out. No real AI provider or secret was needed/committed.

Measured at **2026-10-08T18:51:17Z** (Taipei Oct 9), with **10,000 persisted simulated events** over a
fixed 30-day range and **20 samples per endpoint**. Warm-client HTTPS round-trip from the developer
hotspot/TPE path, D1 APAC/NRT—not Worker CPU time or provider latency:

| Endpoint   | Observed P95 |
| ---------- | ------------ |
| Overview   | 343ms        |
| Metrics    | 306ms        |
| Models     | 340ms        |
| Trace list | 174ms        |

These samples were below the 500ms API target in this specific small, warm-client run. They are not a
cold-start, sustained-load or production SLA guarantee. Repeat with `/v1/demo`'s actual anchor, fixed
filters, recorded sample count/environment and nearest-rank P95; measure cold observations separately.
Browser page-load timing is not inferred from API timing. Sustained Free-tier quota/CPU suitability and
retention require live monitoring; see [deployment](deployment.md).
