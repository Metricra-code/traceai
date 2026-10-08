# Public simulated demo

Open `/demo` without an account. It provides real persisted analytics, model comparison, server-side
trace filters, cursor pagination and trace detail. All reads are constrained to the fixed `demo` project;
there are no public project/key writes. The UI labels data and prices as **simulated / read-only**.

**[Live demo](https://traceai-web.traceai-api.workers.dev/demo)** ·
[Demo API](https://traceai-api.traceai-api.workers.dev/v1/demo) ·
[Local demo](http://localhost:3000/demo). Live HTTP and real SDK/account persistence are verified;
see [verification](verification.md) for separate browser and CI evidence.

## Data and reproducibility

```sh
bun run db:migrate
bun run db:seed
```

The seed creates exactly **10,000 simulated operations** across five fictional models, multiple provider
labels, varied latency/usage and success/error categories. It never contacts an AI provider, generates
prompts, or claims measured model quality. Model IDs begin `demo-`; all prices are fictional, not vendor quotes.
The `model_pricing.simulated` flag excludes them from real ingestion. The unpriced model remains null.

Same anchor produces the same IDs, timestamps, latency, errors, tokens and costs. Default anchor is
`2026-10-09T00:00:00.000Z`, covering the preceding 30 days. To explicitly generate another local window:

```sh
DEMO_ANCHOR=2026-11-01T00:00:00.000Z bun run db:seed
```

`GET /v1/demo` exposes the project's **actual maximum started timestamp** as `anchor` (or its saved
project timestamp if empty). The UI adds 1ms for the half-open window end, so the latest trace is included.
Select **Last 30 days** to see all 10,000 events; old seeded data is never presented as current live traffic.

Re-seeding replaces only `demo` traces, not real project data. The SQL is generated locally and ignored
by Git. Remote migration/seeding is a separate explicit deployment action, not part of ordinary local setup.
See [deployment](deployment.md) before changing a live database.

## Recruiter walkthrough

1. Overview: choose 30 days; inspect request count, P95/P99, errors, token usage and pricing coverage.
2. Models: compare latency/success/usage; notice pricing coverage and that quality is not measured.
   Cost charts show the priced-only subtotal; unknown prices are excluded, not fabricated as zero.
   An incomplete grand total remains unavailable even when a known subtotal is displayed.
3. Traces: filter provider/model/status, sort by time, search an exact ID, and move between cursor pages.
4. Detail: inspect one operation's UTC timing, usage, error category and explicit metadata—no invented span tree.
5. For the real integration path, register separately, create your own project/key and run the SDK example.

This demo is a deterministic product walkthrough, not a production traffic dataset or provider benchmark.
