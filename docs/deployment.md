# Deployment (manual; not yet deployed)

Checked 2026-10-09 against official docs and installed peers. Bun 1.4.0 manages all workspaces and commands; local Next development/build runs natively on Bun. Cloudflare production is workerd, not Bun, and Wrangler still requires Node >=22. [Bun Next setup](https://bun.sh/guides/ecosystem/nextjs). Current pins: Next `16.4.0`, OpenNext Cloudflare `1.20.9`, Wrangler `4.148.0`, Node >=22. OpenNext requires Node runtime (not `runtime = 'edge'`), `nodejs_compat`, and compatibility date >=2024-09-23. [Official adapter setup](https://opennext.js.org/cloudflare/get-started).

## Accounts and configuration

GitHub publication target is `Metricra-code/traceai`. Repository creation needs REST/API auth as that user; an SSH key alone cannot create a GitHub repository. Do not publish into a different logged-in account.

Cloudflare is not authorized yet. Locally, the all-zero D1 ID is a documented placeholder, not a cloud resource. Deployment must wait for a real database ID and authentication.

```sh
bun run --filter @traceai/api cf login
bun run --filter @traceai/api cf d1 create traceai-db
# Put returned database_id into apps/api/wrangler.jsonc; IDs are not secrets.
bun run --filter @traceai/api cf d1 migrations apply traceai-db --remote
# Set WEB_ORIGIN to the actual web workers.dev origin, ENVIRONMENT=production.
bun run --filter @traceai/api deploy
bun run --filter @traceai/web build:cloudflare
bun run --filter @traceai/web preview
# Only after inspecting preview and configuring service bindings:
bun run --filter @traceai/web deploy
```

Do not expose account management until its security milestones pass. Health and ingestion are not an authenticated dashboard. Remote demo seeding is optional and must be explicit (`--remote`); local data does not automatically synchronize.

No custom domain or paid AI API is required. Do not provision R2 for this MVP; the current scaffold has no ISR/cache requirement. [OpenNext caching](https://opennext.js.org/cloudflare/caching).

## Free-tier constraints

Current D1 Free limits include 50 queries per Worker invocation and 100 bind parameters per statement. Bounded ingestion must stay within both; indexed analytics and capped windows are required. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Workers Free has a tight CPU allowance; a successful local run or build is NOT proof of production Free-tier performance. Perform live ingest, page-load and CPU smoke tests before claiming a zero-cost production deployment. Recheck [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) when deploying.

## Password authentication blocker

The specified email/password flow is **not implemented in this slice**. The production Worker runtime currently caps PBKDF2 at 100,000 iterations, while local workerd can override the cap. Therefore a local high-round PBKDF2 test may pass and still fail production. We will not silently lower the security work factor or replace the requested flow with OAuth.

[Runtime change proposal #7550](https://github.com/cloudflare/workerd/pull/7550) is still pending at the time of checking. Resolve and live-verify a secure Worker-compatible hashing option (including Free CPU budget), or explicitly agree on a passwordless/OAuth scope change before that milestone.

## CI and secrets

CI never automatically deploys. For later manual GitHub deployments, use scoped `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` GitHub Secrets or Wrangler OAuth; never commit token values. [Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## Verification and rollback

Before production: migrate a fresh remote DB, run SDK ingestion, query the project-specific trace, replay a batch, test revoked keys, and measure CPU. Review app origin, cookie/auth security once management exists. Retain previous Worker version and database export before migrations; rolling back code does not undo database changes.
