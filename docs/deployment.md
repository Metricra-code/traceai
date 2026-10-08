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

This is deliberately not low-iteration PBKDF2. Registration can still reveal that credentials cannot be registered; complete anti-enumeration would require an email-verification flow outside MVP. There is no password recovery yet. Production auth requires Cloudflare's trusted connecting-IP header; service-hop rewriting can make the rate limit shared rather than client-specific. Do not trust arbitrary browser X-Forwarded-For.

## Reproduce on another account

```sh
bun install --frozen-lockfile
bun run --filter @traceai/api cf login
bun run --filter @traceai/api cf d1 create traceai-db
# Replace database_id in apps/api/wrangler.jsonc with returned ID.
# Set exact production WEB_ORIGIN for your web workers.dev URL.
bun run --filter @traceai/api cf d1 migrations apply traceai-db --remote
bun run --filter @traceai/api deploy
# Generate once, then explicitly seed remote demo. Never reseed real projects.
bun packages/database/src/seed.ts
bun run --filter @traceai/api cf d1 execute traceai-db --remote --file ../../packages/database/seed.sql
bun run --filter @traceai/web build:cloudflare
bun run --filter @traceai/web preview
bun run --filter @traceai/web deploy
```

Keep the `PasswordHasher` export and `new_sqlite_classes` migration. Service names in the web configuration must match actual Workers. No R2, custom domain, card, paid database or AI account is required. Keep OAuth/API tokens out of Git; CI deploy tokens, if later configured, belong in GitHub Secrets. Do not copy local Wrangler credential files into the repository.

## Free-tier limits and safeguards

- D1 Free: 5 million rows read/day, 100,000 rows written/day, 50 queries/invocation, 100 bind parameters/statement. Index maintenance also consumes writes. **Initial remote 10,000-event seed used 60,018 writes**, so avoid repeatedly reseeding on the same day. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
- Edge Workers Free: 10 ms CPU per request, 100,000 requests/day. Native KDF moved to DO; analytics capped at 31 days and 20,000 matched rows. Limits bound resources but are not a CPU/SLA guarantee. [Worker limits](https://developers.cloudflare.com/workers/platform/limits/).
- Unknown price/usage never becomes $0. Aggregates distinguish complete totals from a clearly labeled priced-request subtotal.
- There is no automatic trace retention/archival job yet. Operators must monitor quotas; Free operations stop rather than incur paid overage. Do not enable a paid plan automatically.

## Release verification and rollback

Run lint/format/typecheck, unit/actual Worker+D1 integration, all builds and Playwright. Verify deployed health, anonymous demo, Secure session cookies, origin rejection, tenant isolation, SDK ingestion, duplicate replay, key rotation/revocation and mobile rendering. Measure rather than claim P95 targets. Retain prior Worker version IDs and export D1 before future migrations; code rollback does not undo schema/data changes. This release's initial migration was applied to a fresh database.

## Current release evidence (2026-10-09 Taipei)

- API version: `3bd26be5-4957-43e2-87c8-86d9a184ec35`; web version: `6a80bb0c-234d-4ff6-827a-289606d1fd9d`.
- `bun run verify:deployment` passed against the actual Workers: Secure session cookie, project/key creation, real SDK success/error telemetry, D1 queries, unknown pricing, idempotent replay, revocation rejection, deletion/logout cleanup.
- All seven Playwright flows passed against the live web/API, including anonymous demo, mobile overflow, owner isolation, CSRF, key rotation and the real SDK.
- The first Next16.4 build/deployment failed at runtime on `preview-props.json`. Next16.3.8 pin fixes the upstream adapter incompatibility without patching node_modules; CI now executes built OpenNext in workerd. [Upstream issue/fix](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356).

```sh
bun run verify:deployment
TRACEAI_E2E_BASE_URL=https://traceai-web.traceai-api.workers.dev \
TRACEAI_E2E_API_URL=https://traceai-api.traceai-api.workers.dev bun run test:e2e
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev bun scripts/benchmark-api.ts
```

Live verification creates disposable test accounts/projects, deletes its projects and logs out; accounts remain because account deletion is not implemented. Playwright traces may include one-time test keys, so do not upload live verification artifacts publicly. Revoke/delete test credentials before sharing evidence.
