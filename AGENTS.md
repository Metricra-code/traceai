# TraceAI

Independent open-source LLM observability portfolio. No employer code or credentials belong here.

- Node >=22, Bun 1.4.0; strict TypeScript; retain source boundaries.
- Commands: bun run lint, bun run typecheck, bun run test, bun run test:integration, bun run build, bun run test:e2e.
- SDK must preserve original operation results/errors and never await telemetry in trace().
- API: Hono on Workers. All management reads/writes require project ownership; cookie mutations require Origin checks. D1 persistence belongs in repositories; business logic in services.
- Shared Zod schemas define the public boundary. Atomic whole-batch validation; bounded bodies/queues/windows. UTC internally.
- Costs are integer nanodollars, serialized as strings. Unknown pricing is null, not zero. Simulated demo pricing is never used for real ingestion.
- Raw ingestion keys are shown once, never shipped in browser code. Do not log request bodies or original errors that might contain secrets.
- Public demo is read-only and visibly simulated. Do not fabricate production metrics.
- No auto-deploy; configure Cloudflare explicitly. Never commit tokens or environment files.
- Workers/OpenNext compatibility and free-tier limitations belong in docs/deployment.md.

## Design Context

Audience: AI developers diagnosing latency/errors and recruiters evaluating engineering depth.
Jobs: filter traces, compare operational model performance, inspect P95, integrate SDK.
Tone: restrained, precise, trustworthy. Dark-first developer tool; subtle borders, strong readability, no decorative gradients/animations. Accessible keyboard controls and responsive layouts.
