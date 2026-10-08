# Deployment

Manual Cloudflare deployment; no auto-deploy and no paid model calls. Bun `1.4.0` manages installation, workspaces, scripts and local Next runtime. Production uses Cloudflare workerd, not Bun. Node >=22 remains necessary for Wrangler/OpenNext/Vitest tooling. Pins: Next `16.3.8`, OpenNext Cloudflare `1.20.9`, Wrangler `4.148.0`, compatibility `2026-10-06`, `nodejs_compat`. [Official OpenNext setup](https://opennext.js.org/cloudflare/get-started).

## Environments

- API: [traceai-api](https://traceai-api.traceai-api.workers.dev)
- Web: [public demo](https://traceai-web.traceai-api.workers.dev/demo) (verified live)
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

## Current full-product release evidence (2026-10-09 Taipei)

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
