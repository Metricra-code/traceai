# TraceAI

Independent open-source LLM observability portfolio. No employer code or credentials belong here.

- Node >=22, Bun 1.4.0; strict TypeScript; retain source boundaries.
- Commands: bun run lint, bun run typecheck, bun run test, bun run test:integration, bun run build, bun run test:packages, bun run test:e2e, bun run test:e2e:workers.
- SDK must preserve original operation results/errors and never await telemetry in trace().
- API: Hono on Workers. All management reads/writes require project ownership; cookie mutations require Origin checks. D1 persistence belongs in repositories; business logic in services.
- Shared Zod schemas define the public boundary. Atomic whole-batch validation; bounded bodies/queues/windows. UTC internally.
- Costs are integer nanodollars, serialized as strings. Unknown pricing is null, not zero. Simulated demo pricing is never used for real ingestion.
- Raw ingestion keys are shown once, never shipped in browser code. Do not log request bodies or original errors that might contain secrets.
- Error summaries require an explicit callback/input and bounded sanitization. Never automatically copy exception.message; legacy messages without the capture-policy marker stay private. Redaction is best-effort, not an arbitrary-PII guarantee.
- Optional OpenTelemetry integration belongs in its own package. Export only genuine completed spans and allowlisted operational attributes; do not silently copy prompts/events/resources or claim OTLP/metrics/log collector support.
- Pricing imports are operator-only, sourced and versioned. Do not rewrite historical prices/costs or apply fictional demo prices to real ingestion. Scheduled cleanup never deletes user trace history.
- Public demo is read-only and visibly simulated. Do not fabricate production metrics.
- No auto-deploy; configure Cloudflare explicitly. Never commit tokens or environment files.
- Workers/OpenNext compatibility and free-tier limitations belong in docs/deployment.md.
- Full-product scope and current release gates are tracked in docs/acceptance.md; source implementation, local tests, CI and live evidence are distinct.

## Design Context

Audience: AI developers diagnosing latency/errors and recruiters evaluating engineering depth.
Jobs: filter traces, compare operational model performance, inspect P95, integrate SDK.
Tone: restrained, precise, trustworthy. Dark-first developer tool; subtle borders, strong readability, no decorative gradients/animations. Accessible keyboard controls and responsive layouts.
