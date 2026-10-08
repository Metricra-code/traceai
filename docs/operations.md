# Operations, quotas and retention

This application is deployed on Workers Free/D1 Free. It has explicit bounds, not unlimited
capacity or an enterprise SLA. Do not upgrade the account, add paid storage or run a load generator
without an operator decision.

## Data lifecycle policy

- **User traces:** retained until their owner deletes the project. There is no hidden rolling
  deletion policy, no automatic archival and no prompt/response store. Analytics can query up to
  31 days/20,000 matched rows at once; that query bound is not a data-retention claim.
- **Projects and keys:** project deletion explicitly confirms its name and cascades its keys and
  traces. Key revocation rejects further ingestion but does not erase previously collected traces.
- **Sessions:** expire after seven days. Logout deletes its session immediately. Maintenance may
  remove only already-expired session records, not active sessions or user accounts.
- **Rate counters:** expired counters are temporary state and can be reclaimed in bounded batches.
  Maintenance never resets an active window to circumvent rate limits.
- **Pricing versions:** preserved for trace provenance; price import does not rewrite historical
  trace costs or silently mutate existing versions. New pricing periods require explicit review.
- **Explicit error summaries/custom metadata:** retained with the trace. Users must not supply
  prompts, responses, identifying data or secrets; known-pattern sanitization is defense-in-depth,
  not a guarantee that arbitrary free text contains no sensitive information.
- **Test accounts:** the live smoke deletes its projects/keys and logs out its own session.
  Browser fixtures remove disposable projects and discard their client contexts; some server session
  records can remain until their seven-day expiry, after which maintenance can reclaim them.
  Account records remain because account deletion/recovery/email verification/MFA are not implemented.
  Do not reuse test passwords or publish credential-bearing live artifacts.

Any future automatic trace-retention change requires an explicit published policy and migration
review. It cannot silently discard data merely to keep a portfolio below Free quotas.

## Operator checks

```sh
# Read-only real database size/24h queries/rows; no account secrets are printed.
bun run --filter @traceai/api cf d1 info traceai-db --json

# Public read-only, bounded measurement commands (not private user traffic).
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun run benchmark:api
TRACEAI_DASHBOARD_URL=https://traceai-web.traceai-api.workers.dev/demo bun run benchmark:dashboard
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun run benchmark:sustained
```

D1 Free currently allows 5 million rows read and 100,000 rows written per day; indexes count toward
writes. Observe **account-level** consumption too: one database's rolling 24h counters are not a
guarantee of the account's remaining reset-window quota. Use the Cloudflare dashboard for actual
quota resets, Worker CPU/exceeded-resource outcomes and Durable Object usage. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Worker metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/),
[D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).

As an operator warning threshold, investigate at roughly 80% of an account's daily Free allowance
or sustained resource-limit errors. This is a runbook suggestion, not an implemented alert. Stop
unnecessary benchmarks/reseeding, narrow aggregate windows, investigate abuse and wait for the
reported reset if the allowance is exhausted. Paid overage is not automatically enabled.

The initial 10,000-event remote demo seed consumed 60,018 writes including indexes. Generate and
seed it once on a new environment; do not rerun the seed to solve missing private traces.

## Measurement scope

- API benchmark: 20 timed samples per endpoint after one warm-up, fixed 30-day simulated dataset.
- Browser benchmark: fresh isolated browser contexts and same-context repeat visits, measured
  until Total/P95 and all six overview panels/five SVG charts are usable. A fresh browser cache
  does **not** force a cold Cloudflare isolate. No connection/CPU throttling is implied.
- Modest-traffic observation: default 30 read-only requests, one start every two seconds, rotating
  four analytics endpoints. First/failed requests remain in results. About one minute is not a
  sustained production soak, peak-concurrency test or server CPU profile.
- SDK benchmark: stub transport and mock operations, not paid-provider latency or internet delivery.

The <3s dashboard and <500ms API targets are measured against stated samples. Do not generalize
them to every geography, mobile network, workload or a guaranteed SLA. Store measured timestamps,
environment and safe aggregate output in [verification](verification.md); never manufacture a green
number or remove failed samples.

## Release and rollback

1. Run the full [acceptance gates](acceptance.md) on current source, including actual workerd and
   packaged consumers. Preserve failure evidence; don't use retries to hide a regression.
2. Review migrations, credential handling, schema compatibility and Free quota headroom. Export
   D1 before data/schema changes. Apply only reviewed migrations/imports with explicit `--remote`.
3. Deploy API before web when an additive schema/ingestion contract is introduced. Record prior
   and current Worker version IDs. Verify real cookies, owner isolation, SDK lifecycle and service binding.
4. Run read-only demo, live browser and disposable private smoke checks. Delete test projects and
   invalidate test sessions; never upload live credential-bearing Playwright traces publicly.
5. Confirm GitHub Actions for the published revision. A test source, build or successful HTTP health
   response alone does not prove the product journey.
6. If rollback is needed, restore the known-compatible Worker version. Code rollback cannot undo
   migration/data changes. Prefer additive schema changes compatible with the previous API.

Diagnostics should contain request IDs, HTTP status, endpoint templates and aggregate job counts,
not request bodies, authentication headers, passwords, keys, raw errors or private trace metadata.
