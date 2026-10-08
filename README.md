# TraceAI

Independent LLM observability portfolio: a framework-independent TypeScript SDK, Workers/D1 ingestion and an API-backed React Dashboard.

**Work in progress, not a deployed production SaaS.** This first delivery focuses on the foundation and core telemetry. Dashboard analytics, account/project management and public demo routes remain explicit milestones in [the roadmap](docs/roadmap.md). No paid AI credentials are needed for development.

## Quick start

Requirements: Bun 1.4.0; Node >=22 is also required by the Cloudflare toolchain.

Bun owns installation, workspaces, scripts, the local Next runtime and TypeScript examples. Use `bun run test` for Vitest (not the separate built-in `bun test` runner). Workers production still uses Cloudflare workerd; Node-based tool CLIs retain their supported runtime.

```sh
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

- Web scaffold: http://localhost:3000
- Worker health: http://127.0.0.1:8787/health
- Seed: 10,000 deterministic **simulated** traces; fictional models and prices, not real provider rates.
- No external credentials are needed for local Workers and D1.

For an actual SDK → API → database smoke test, see [SDK](docs/sdk.md) and [API](docs/api.md). Raw ingestion keys belong ONLY in server-side environment variables.

## Engineering evidence

```sh
bun run lint
bun run format:check
bun run typecheck
bun run test
bun run test:integration
bun run build
bunx --no-install playwright install chromium
bun run test:e2e
bun run --filter @traceai/web build:cloudflare
```

Tests cover bounded SDK delivery and real local Worker/D1 ingestion, not paid model calls. The current E2E suite is a foundation smoke test; the full login/project/key/filter/revocation journey is a later acceptance criterion, not falsely claimed here.

## Layout

- `apps/web`: Next.js App Router, React, future Dashboard.
- `apps/api`: Hono Worker, HTTP boundary, services and repositories.
- `packages/sdk`: standalone `@traceai/sdk`, native Fetch, bounded queue/batching/retry.
- `packages/shared`: strict Zod event contracts, integer monetary arithmetic, percentiles.
- `packages/database`: Drizzle schema, D1 migrations, deterministic seed.
- `packages/config`: strict shared TypeScript config.
- `examples`: local integration / mock AI demos.

## Design and reliability

- Telemetry failures must never replace application results/errors.
- Atomic batch validation, idempotent per-project trace IDs, bounded bodies/queues/windows.
- UTC timestamps and integer nanodollars; missing pricing means null, not `$0`.
- No prompts/responses, headers or raw original error messages collected by default.
- Simulated pricing is isolated from real ingestion.
- Authentication/project isolation and demo write protection must be in place before exposing private management data.

## Documentation

[Architecture](docs/architecture.md) · [SDK](docs/sdk.md) · [API](docs/api.md) · [Demo](docs/demo.md) · [Deployment](docs/deployment.md) · [Verification](docs/verification.md) · [Requirements](docs/product-spec.md) · [Roadmap](docs/roadmap.md)

GitHub source repository: [Metricra-code/traceai](https://github.com/Metricra-code/traceai). Cloudflare deployment still requires account authorization. No automatic production deployment is configured. See deployment notes for Free-tier restrictions and the password-hashing compatibility blocker.
