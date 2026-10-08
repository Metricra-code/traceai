# Demo data

`bun run db:migrate && bun run db:seed` creates exactly 10,000 **simulated** operations in a project with ID `demo`. There are no paid AI calls and no actual prompts/responses.

Seed is deterministic: same anchor → same operation IDs, times, latencies, errors, usage and costs. Default anchor is `2026-10-09T00:00:00.000Z`; it covers the preceding 30 days. Override explicitly with `DEMO_ANCHOR=2026-11-01T00:00:00.000Z bun run db:seed` to refresh a deployed demo. Query windows must use this anchor, not pretend old data is live.

All models prefixed `demo-` and all prices are fictional, not provider quotes. The model_pricing.simulated flag prevents real ingestion from using demo rates. Unknown pricing is NULL. Re-seeding deletes/replaces only demo traces, not any real project.

The public read-only demo and Dashboard are a later milestone; a seed existing does NOT mean those routes are implemented.
