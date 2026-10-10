# Public simulated demo

The main `/` entry now opens `/showcase`, the separate recorded-real measurement page.
`/demo` remains the original full interactive simulated dataset; neither replaces the other.

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

## Recorded real measurements — separate public entry

`/showcase` is the main portfolio entry. It presents the three previously verified genuine
`gemini-3.5-flash-lite` REST operations, wrapped with the public SDK and persisted in D1. The
owner approved publishing only model, duration, input/output token counts and status. A scoped
read-only D1 projection verified the original `gemini-real-api` / `simulated: false` records before
copying exactly those five fields into `apps/web/src/lib/showcase-data.ts`. The private project was
not made public. Public sample numbers are newly derived ordinals, never private trace identifiers.

The snapshot's actual durations are 1,286.598375 ms, 1,137.5750420000002 ms and 671.828917 ms;
usage totals are 31 input / 81 output tokens. No values were expanded, jittered, regenerated or
relabeled from the simulated seed. No new model call was required to publish this existing evidence.

- Exact Next `GET /api/showcase` serves the immutable projection; it does not access D1, provider
  credentials, sessions, the private BFF or another project's data at public runtime.
- Model/status filters and recorded/ascending/descending latency sort run on the server. Queries
  reject duplicate or unknown parameters, private scope/cursor arguments and unsupported values.
- Empty matches remain empty; unavailable latency/usage stays null rather than fabricated zero.
  Unknown costs are not shown as free. A failed fetch offers Retry, never a simulated fallback.
- All three recorded calls succeeded; an error filter correctly yields no rows. The only recorded
  model cannot establish a ranking. P95 is nearest-rank and equals the largest of three samples,
  not an SLA, TTFT, provider-only execution time or production performance estimate.
- The public response contains no account/project/source trace IDs, raw timestamps, prompts,
  answers, credentials, error text, metadata or pricing. The isolated GET route uses no-store/nosniff;
  private analytics retain their existing ownership/Origin/privacy controls.

Both public screens have explicit **Real measurements** / **Simulated demo** links. The simulated
Demo retains its original API-backed date filtering, multi-model comparisons and trace navigation.
No schema change, remote seed, private-project sharing or paid-plan change is needed for this split.
