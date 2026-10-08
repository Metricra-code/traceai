# Troubleshooting

Start with the failing boundary rather than changing security settings or blindly retrying.
Run commands from the repository root. Never paste ingestion keys, session cookies, passwords,
provider tokens, Wrangler credentials or complete request bodies into issues/logs.

## Local setup

| Symptom                                      | Check / remedy                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency/CLI runtime error                 | `bun --version` should be 1.4.0; `node --version` must be >=22. Use `bun install --frozen-lockfile`, not another package manager. Cloudflare tooling still needs Node; deployment executes in workerd. |
| Missing D1 tables                            | Run `bun run db:migrate` before API/E2E. Schema source is not a migration. Do not run a remote command to repair a local database.                                                                     |
| Empty public demo                            | Run `bun run db:seed` locally, start `bun run dev`, select Last 30 days. The seed has a fixed anchor; it is not current production traffic.                                                            |
| TypeScript cannot find Next generated routes | Run `bun run typecheck`; the web script generates Next types before checking. Do not commit generated next-env.d.ts or edit dependency source.                                                         |
| Port 3000/8787 in use                        | Stop only the server you started, or choose explicitly configured matching web/API ports. Do not kill every Node/Bun process on the machine.                                                           |
| Unit test runner mismatch                    | `bun run test` runs Vitest. `bun test` is a different runner and does not execute this repository's configured Vitest/Worker suites.                                                                   |
| Chromium unavailable                         | `bunx --no-install playwright install chromium` (Linux CI adds `--with-deps`).                                                                                                                         |

## Account, projects and API keys

- **401 / Sign in to continue:** log in again. Sessions expire after seven days; logout invalidates
  the server-side record. JavaScript cannot read the HttpOnly session cookie by design.
- **404 for a project or trace:** confirm you selected a project owned by your current account.
  Missing and foreign resources deliberately use the same response; do not bypass authorization.
- **403 on a mutation:** the browser must use the same-origin `/api/*` path. In production set the
  exact HTTPS `WEB_ORIGIN`; local dev sets its own HTTP origin. Missing/foreign Origin is rejected.
- **One-time key no longer visible:** generate or rotate a key. The API cannot recover the original
  key from its salted hash. Keep keys in the instrumented server's environment, not NEXT_PUBLIC variables.
- **Revoke/rotate unexpectedly rejects an SDK request:** old/revoked keys correctly return 401.
  Update the instrumented application's environment and restart its SDK client.
- **429:** respect `Retry-After`. Ingestion is capped per key; authentication also has IP/email
  limits before expensive hashing. Do not disable rate limits to make a benchmark pass.

## Missing traces or costs

1. Confirm API `/health` returns 200 and the SDK endpoint is the API origin, not a dashboard page.
2. Verify `enabled`, valid trace options and explicit numeric usage; inspect sanitized `onDiagnostic`
   codes/counts or a completed-event delivery receipt. Never log the API key or original application error.
3. Call `await traceai.shutdown()` before a short-lived process exits. The queue is in memory;
   process termination/crash is not durable delivery. A hung application operation can also delay shutdown.
4. Inspect the UTC date range, provider/model/status filters and exact trace ID. Newest/oldest
   pagination cursors belong to their original query; changing filters must restart the page sequence.
5. Duplicate `(projectId, traceId)` submissions use first-write-wins: replay is not an update.
6. Unknown pricing or incomplete usage means `null` / **Pricing unavailable**, never `$0`.
   Fictional demo prices are excluded from normal ingestion. Import only verified real registry
   versions with the pricing operator command documented in [pricing](pricing.md).
7. The known subtotal includes priced requests only. It cannot be advertised as the complete total
   while unpriced requests exist. Estimates also exclude provider-specific discounts/surcharges.

**422 for analytics:** choose a window of at most 31 days and narrow matching events below 20,000.
The service refuses oversized aggregate queries rather than truncating data and inventing a P95.
Trace pagination is separately bounded and can still inspect records. Filtering is server-side.

## Deployment / service binding

- **Web 503 while API health is 200:** check the `TRACEAI_API` service binding and actual API Worker
  name/account. Production fails closed; there is no fallback to localhost or a public arbitrary origin.
- **Unexpected loadManifest(/.next/server/preview-props.json) call!:** retain the verified Next16.3.8 /
  OpenNext1.20.9 compatibility pair until an upstream released adapter passes built-workerd dynamic-route
  tests. A successful Next build is not runtime compatibility evidence. See [deployment](deployment.md).
- **Sequential dev/workerd E2E gets stale RPC discovery:** each managed Playwright invocation uses a
  unique `WRANGLER_REGISTRY_PATH` shared by its child servers. Preserve that configuration; don't delete
  a global registry or weaken assertions. Stop externally reused dev servers before built-worker QA.
- **Free quota exhausted:** inspect Cloudflare usage; wait for the quota reset or reduce workload.
  Initial demo seed writes also maintain indexes. Do not reseed remotely repeatedly or enable a paid
  plan without the owner's decision. Bounded maintenance does not delete user trace history.
- **Schema change rollback:** a Worker code rollback does not undo migrations/data. Back up D1,
  review additive migrations and retain prior Worker version IDs before release.

## Reports and reproducible checks

Use `X-Request-Id`, endpoint path, UTC timestamp, HTTP status, package versions, safe aggregate counts
and the smallest reproduction. Keep public-demo measurements separate from private traffic.
Playwright traces from account/key journeys can include disposable credentials; revoke/delete test
projects and never publish those artifacts as portfolio screenshots.

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run test:packages
bun run test:e2e
bun run --filter @traceai/web build:cloudflare
bun run test:e2e:workers
bun run benchmark:api
bun run benchmark:dashboard
```

Automated accessibility scans catch only some issues. Screen-reader comprehension, logical reading
order and unfamiliar-device usability still need human review; a zero-violation scan is not a complete
WCAG certification. Benchmark scope, timestamps and observed results belong in [verification](verification.md).
