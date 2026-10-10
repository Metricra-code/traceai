# Deployment

Manual Cloudflare deployment; no auto-deploy and no paid model calls. Bun `1.4.0` manages installation, workspaces, scripts and local Next runtime. Production uses Cloudflare workerd, not Bun. Node >=22 remains necessary for Wrangler/OpenNext/Vitest tooling. Pins: Next `16.3.8`, OpenNext Cloudflare `1.20.9`, Wrangler `4.148.0`, compatibility `2026-10-06`, `nodejs_compat`. [Official OpenNext setup](https://opennext.js.org/cloudflare/get-started).

## Environments

- API: [traceai-api](https://traceai-api.traceai-api.workers.dev)
- Web: [public demo](https://traceai-web.traceai-api.workers.dev/demo) (dated live results and current limitations below)
- D1: `traceai-db`, ID `2cd82526-1d69-445b-9cd4-46229ed87281` (resource IDs are public configuration, not credentials).
- Web `TRACEAI_API` service binding calls API; browsers use the same-origin `/api/*` proxy. Cookies have no Domain attribute and stay on the web host.
- Production configuration fails closed with `ENVIRONMENT=production`, exact `WEB_ORIGIN`, HttpOnly/Secure/SameSite=Lax seven-day session cookies. `bun run dev` explicitly overrides origin/environment for local HTTP only.

## Password hashing without weakening security

Native `node:crypto` scrypt uses OWASP's equivalent `N=32768, r=8, p=3` profile, 16-byte random salt, 32-byte digest, 32 MiB working memory and fixed parameters. Password hashes live in D1. Plaintext passwords are not persisted or logged. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

scrypt exceeds the edge Worker's Free CPU allowance. A **private SQLite-backed PasswordHasher Durable Object**, accessible only by service binding/RPC, performs the KDF. The API applies IP and email rate limits before invoking it; 16 stable shards bound concurrent per-object work. No public hashing HTTP endpoint. SQLite DOs are available on Workers Free, with a default 30-second CPU budget per request, 100,000 requests/day and 13,000 GB-s/day. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

This is deliberately not low-iteration PBKDF2. Registration can still reveal that credentials cannot be registered; complete anti-enumeration would require an email-verification flow outside the original scope. There is no password recovery yet. Production auth requires Cloudflare's trusted connecting-IP header; service-hop rewriting can make the rate limit shared rather than client-specific. Do not trust arbitrary browser X-Forwarded-For.

## Reproduce on another account

```sh
bun install --frozen-lockfile
bun run --filter @traceai/api cf login
bun run --filter @traceai/api cf d1 create traceai-db
# Replace database_id in apps/api/wrangler.jsonc with returned ID.
# Set exact production WEB_ORIGIN for your web workers.dev URL.
bun run --filter @traceai/api cf d1 migrations apply traceai-db --remote
bun run db:pricing --remote --dry-run
bun run db:pricing --remote --confirm-remote
bun run --filter @traceai/api deploy
# Generate once, then explicitly seed remote demo. Never reseed real projects.
bun packages/database/src/seed.ts
bun run --filter @traceai/api cf d1 execute traceai-db --remote --file ../../packages/database/seed.sql
bun run --filter @traceai/web build:cloudflare
bun run --filter @traceai/web preview:built
# After stopping the preview and verifying it, deploy the exact built artifact.
(cd apps/web && bunx --no-install wrangler deploy)
```

### Keep model-test credentials outside framework dotenv discovery

OpenNext 1.20.9 reads root/app `.env`, `.env.local` and mode-specific dotenv files and compiles
all three modes into the server Worker environment snapshot. A non-`NEXT_PUBLIC_` variable is
therefore not a guarantee that a test-only credential stays out of the deployment artifact.
Do not place Gemini or ingestion keys there. Keep them in ignored, permission-0600
`.local/gemini.env`, explicitly loaded only by the [Gemini CLI](gemini.md).

`build:cloudflare` verifies the generated snapshot as bounded JSON data, never executing it.
Credential-named variables (including `NEXT_PUBLIC_` credentials), missing snapshots or format
changes fail the build without printing values; `deploy` uses this guarded build. The guard is
name-based, not an arbitrary-secret/PII detector. Review source/assets and scan actual local keys
before explicit rollout. When deploying a prebuilt artifact, repeat the guard first:

```sh
bun --no-env-file scripts/verify-web-env.ts
(cd apps/web && bunx --no-install wrangler deploy)
```

Offline regression tests invoke the actual installed adapter compiler on temporary fake-only
fixtures: a root `.env.local` canary reproduces the blocked serialization; `.local/gemini.env`
remains outside discovery. Never use real credentials in test fixtures or CI.

Keep the `PasswordHasher` export and `new_sqlite_classes` migration. Service names in the web configuration must match actual Workers. No R2, custom domain, card, paid database or AI account is required. Keep OAuth/API tokens out of Git; CI deploy tokens, if later configured, belong in GitHub Secrets. Do not copy local Wrangler credential files into the repository.

For an existing deployment, export a private D1 backup first, review/apply additive migration `0002`,
then dry-run/import the two [sourced pricing snapshots](pricing.md) before deploying the new API.
Do **not** regenerate/reseed the remote demo for this upgrade. Pricing imports are explicit,
immutable and idempotent; neither CI nor deployment performs a remote import automatically.
Do not deploy the new API against the old schema. Apply API before web; the previous API remains
compatible with the additive columns. A backup contains private account/session data: use a
restricted ignored directory, keep Wrangler export output private (it can contain a signed download
URL), and never print, commit or upload its contents.

## Free-tier limits and safeguards

- D1 Free: 5 million rows read/day, 100,000 rows written/day, 50 queries/invocation, 100 bind parameters/statement. Index maintenance also consumes writes. **Initial remote 10,000-event seed used 60,018 writes**, so avoid repeatedly reseeding on the same day. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- Edge Workers Free: 10 ms CPU per request, 100,000 requests/day. Native KDF moved to DO; analytics capped at 31 days and 20,000 matched rows. Limits bound resources but are not a CPU/SLA guarantee. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).
- Unknown price/usage never becomes $0. Aggregates distinguish complete totals from a clearly labeled priced-request subtotal.
- The hourly `17 * * * *` maintenance job removes at most 250 expired sessions and 250 expired
  rate counters per invocation. It never deletes user traces, projects, keys, users or prices.
  User traces remain until confirmed project deletion; no automatic archival or hidden expiry.
  Operators must monitor quotas; Free operations stop rather than incur paid overage.
  Do not enable a paid plan automatically. See [operations](operations.md).

## Release verification and rollback

Run lint/format/typecheck, unit/actual Worker+D1 integration, all builds, isolated public-package consumers
and both Playwright modes. Verify deployed health, anonymous demo, Secure session cookies, origin
rejection, tenant isolation, SDK/OTel ingestion, sourced pricing, explicit safe summaries, duplicate replay,
key rotation/revocation, keyboard/theme/AA/mobile rendering. Measure rather than claim P95 targets.
Retain prior Worker version IDs and export D1 before migrations; code rollback does not undo schema/data
changes. Migration `0002` is additive; do not drop its columns/guards to roll back application code.

## Historical full-product release evidence (2026-10-09 Taipei)

- API version: `8171f54a-127c-4982-b378-161868735bcc`; web version: `1305011c-4719-4f64-99c6-a347dfbc6459`.
- Prior known-compatible API: `3bd26be5-4957-43e2-87c8-86d9a184ec35`; web: `6a80bb0c-234d-4ff6-827a-289606d1fd9d`.
  Retain these for controlled code rollback; the additive schema/import is not undone by a Worker rollback.
- Private ignored D1 export taken before upgrade. The first remote0002 attempt failed and rolled back;
  parenthesized CASE compatibility fix then applied successfully. Columns, three guards and migration
  tracking were queried before explicit sourced-price dry-run/import. [Migration evidence](pricing.md).
- API deployed before the exact built web artifact. Actual deployment output confirms the hourly cron;
  handler/expired-only/batch bounds are verified with actual scheduled-controller Worker/D1 tests.
  Deployment configuration is not a claim of an already-observed production cron invocation.
- `bun run verify:deployment` passed: Secure sessions, real SDK/OTel storage and identity, unknown-cost
  null, exact sourced-price subtotal/provenance, explicit summary redaction, replay, revocation and cleanup.
- **17/17 live browser journeys passed**, including keyboard/mobile/light/dark/AA checks and real management.
  Native17/17 and built-workerd17/17 passed too. [Full evidence and performance](verification.md).
- Expanded-source `70dd1a9` [GitHub Actions passed](https://github.com/Metricra-code/traceai/actions/runs/37840304644):
  frozen install, static checks, unit/D1 tests, production/OpenNext builds, packed consumers and both browser runtimes.
- The earlier Next16.4 build failed at runtime on `preview-props.json`. Verified Next16.3.8 pin fixes
  that compatibility issue without node_modules patching; keep actual-workerd CI. [Upstream fix](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356).

```sh
bun run verify:deployment
TRACEAI_E2E_BASE_URL=https://traceai-web.traceai-api.workers.dev \
TRACEAI_E2E_API_URL=https://traceai-api.traceai-api.workers.dev bun run test:e2e
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun scripts/benchmark-api.ts
```

Live verification creates disposable test accounts/projects and deletes their projects/keys.
The smoke logs out its own session; browser contexts discard client cookies, but some server session
records can remain until expiry. Accounts remain because account deletion is not implemented. Playwright traces may include one-time test keys, so do not upload live verification artifacts publicly. Revoke/delete test credentials before sharing evidence.

## 2026-10-10 SDK namespace / credential-isolation rollout

Only the web was updated: version `b0d0840e-cf71-4af2-b4e8-6feaa157aab0`, with prior web
`1305011c-4719-4f64-99c6-a347dfbc6459` retained for rollback. API remains
`8171f54a-127c-4982-b378-161868735bcc`; no migration, pricing import or remote reseed occurred.
The guarded build passed and 4,268 Next/OpenNext files had zero actual local-credential matches
before explicit deployment. The contaminated local build was blocked and never deployed.
After rollout, the authenticated owner Overview still read back three real Gemini traces / 112 tokens,
with unknown costs, and Settings displayed the published SDK import. Public npm and fresh installed
consumer proof is separate from deployment: [publication](npm.md), [real-model evidence](gemini.md).
This focused rollout is not a claim of a new production soak or a repeated 17-case live baseline run.

## 2026-10-11 investigation-window rollout and live limitations

Source [`ff26876`](https://github.com/Metricra-code/traceai/commit/ff26876b0c06551f899102c34945ffccb4ce9fbc)
was pushed after explicit owner approval. Its [new CI passed](https://github.com/Metricra-code/traceai/actions/runs/38068400923)
before manual deployment: API `245c7013-88df-48b7-b228-eaf6e5382d27`, web
`252c6856-6db5-4269-be25-ed0fc01b9ae5`. D1/bindings were retained; no migration, pricing import,
reseed, model-provider call, paid-plan change or npm republication occurred.

The deployed SDK/OTel smoke passed with three stored **synthetic deployment-verification** operations,
not three real model calls. The first complete live browser suite was **20 passed / 5 failed**:
an actual `/projects` response showed Cloudflare Error 1102; private Settings navigation returned
503; public document navigations also stalled. This is not a fully passing live release.
1102 can represent CPU or memory exhaustion; without invocation metrics, neither the failing
resource nor a common cause for all failures is established. [Cloudflare errors](https://developers.cloudflare.com/workers/observability/errors/),
[limits](https://developers.cloudflare.com/workers/platform/limits/).

Prior known-compatible API `8171f54a-127c-4982-b378-161868735bcc` and web
`b0d0840e-cf71-4af2-b4e8-6feaa157aab0` are retained for controlled rollback. Roll back web before
API because the older API has the smaller cursor limit. Code rollback does not revert stored data.

### Read-only shell-cache follow-up — pre-release checkpoint

`open-next.config.ts` now uses the installed static-assets incremental cache with interception.
Only build-time public shells are eligible; private data is still fetched through the unchanged
`force-dynamic`, `no-store` BFF. Dynamic dashboard, login and detail routes still use the server.
No R2, revalidation queue, tag cache or revalidation support was added.
[OpenNext caching](https://opennext.js.org/cloudflare/caching).

The guarded build now runs `opennextjs-cloudflare build`, then `populateCache local`, then the
environment guard. This prepares the static cache assets before direct built-workerd preview or
exact-artifact Wrangler deployment; do not omit the population step. [OpenNext CLI](https://opennext.js.org/cloudflare/cli).
The cache-hit regression failed against the old compiled artifact and passed in the new **26/26**
built-workerd suite; **373** unit / **75** Worker-D1 tests and **26/26 native** passed.
At that pre-release checkpoint, new-source CI, deployment and new live acceptance were separate
pending gates. The completed rollout is recorded below; local checks alone did not prove the live
resource/transport failures fixed or establish CPU savings. [Detailed evidence](verification.md).

## Verified shell-cache rollout (2026-10-11 Taipei)

- Runtime source [`f140c06`](https://github.com/Metricra-code/traceai/commit/f140c065884e989464e044e49dcfb530c4c5cb2b)
  [CI passed](https://github.com/Metricra-code/traceai/actions/runs/38070087528) before deployment:
  **373 unit / 75 Worker-D1 / 26 native / 26 built-workerd**, builds and packed consumers.
- Active web version: **`e6d5567c-f54d-45a8-b0a8-e040fce958b3`**; API remains
  **`245c7013-88df-48b7-b228-eaf6e5382d27`**. Both deployment records show 100% traffic to
  these versions. The 1,332-file OpenNext artifact's SHA-256 manifest was checked immediately
  before upload; eight populated cache assets and existing bindings were retained.
- **26/26 live HTTPS journeys passed (1.6m)**, including the five previously failed journeys,
  public shell cache hits, private no-store responses, ownership/Origin/cookie/key boundaries,
  real SDK writes, server filters/history/window behavior and keyboard/responsive/AA checks.
  `bun run verify:deployment` also passed again with three synthetic verification operations;
  its project/keys were deleted and its session logged out. This is not new model traffic.
- No migration, pricing import, remote reseed, new resource, paid-plan change or npm republish.
  The core SDK stays `@akai_80percent/traceai-sdk@0.1.0`; the optional OTel adapter is unpublished.
- For a cache-only rollback, prior web `252c6856-6db5-4269-be25-ed0fc01b9ae5` can keep the
  current API, but that web version had the recorded failed live run. For the older known-compatible
  pair above, roll back web **before** API. Code rollback never undoes stored data/schema.

The earlier failures remain evidence: this passing run does not establish their CPU-versus-memory
cause, permanent resolution or availability SLA. See the [live result and bounded measurement](verification.md#shell-cache-rollout--live-acceptance-2026-10-11-taipei).
A documentation-only evidence update does not require rebuilding or redeploying this runtime artifact.
