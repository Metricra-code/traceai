# Sourced pricing snapshots

TraceAI estimates **base text-token cost**, not provider-billed cost. This registry needs no paid API,
provider credential or network lookup during ingestion. Import is an explicit operator action.

## Verified snapshot

Sources were checked at **2026-10-08T19:38:52.000Z (2026-10-09 Taipei)**. That exact timestamp is both
`verifiedAt` and this registry's `effectiveFrom`; it is **not** a claim about the providers' historical
price-change date. Earlier traces remain unpriced unless another separately verified historical version exists.

| Exact provider/model              | Base input USD / million | Base output USD / million | Official source                                                                          |
| --------------------------------- | -----------------------: | ------------------------: | ---------------------------------------------------------------------------------------- |
| `openai` / `gpt-4.1-mini`         |                    $0.40 |                     $1.60 | [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) |
| `anthropic` / `claude-sonnet-4-6` |                    $3.00 |                    $15.00 | [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)               |

The billing basis is `base-text-global`: standard uncached text tokens, first-party/global baseline.
Cached input/write/read, Batch/Flex/service-tier discounts, tools/search/image/audio charges, regional
or inference-geography premiums, negotiated discounts and taxes are **not modeled**. Usage must include
both explicit input/output counts. The result is not a reconciliation of an actual bill. Unknown aliases,
providers or models return null; no model-family substitution or guessed price is applied.

All rates are integer nanodollars per million tokens in the source manifest. Traces retain the version ID
and their original estimated integer nanodollars. A detail response includes safe `pricing` provenance:
source URL, effective window, verification timestamp, billing basis, rates and simulated flag. Legacy/demo
records may have null verification/billing provenance; demo prices are explicitly simulated and never
used for normal ingestion.

## Import safely

Apply migrations first. Every invocation must choose exactly one target; there is no default remote target.

```sh
bun run --filter @traceai/api db:migrate
bun scripts/import-pricing.ts --local --dry-run
bun scripts/import-pricing.ts --local
# Repeat is idempotent: identical IDs are not updated/replaced.
bun scripts/import-pricing.ts --local

# Another-account deployment: configure D1 first; remote dry-run only reads registry rows.
bun run --filter @traceai/api cf d1 migrations apply traceai-db --remote
bun scripts/import-pricing.ts --remote --dry-run
# Deliberate remote database write; never invoked automatically by CI or deployment.
bun scripts/import-pricing.ts --remote --confirm-remote
```

`--dry-run` validates the manifest and existing matching history, then prints the public SQL **without
writing rows**. It performs a bounded read against the selected D1 target, so Cloudflare login is required
for remote preflight. `--file /absolute/path/registry.json` accepts a strict `{version:1, entries:[...]}`
manifest; files are at most 128 KiB, entries at most 100, generated SQL at most 90 KiB. Sources must be
credential-free official HTTPS provider URLs. Operator verification remains a human responsibility;
schema validation does not prove the page supports an arbitrary edited rate.

The SQL is one `INSERT ... SELECT json_each(...)` statement. Database triggers reject changed existing
version IDs, overlapping real-price windows, and UPDATE/DELETE of managed snapshots. Exact repeats
are idempotent. A conflicting entry aborts the complete insert, including entries that preceded it.
The preflight is helpful but not the race-safety boundary: D1 guards still validate the write.

### Remote migration parser compatibility

Migration `0002` keeps uppercase `BEGIN`, LF line endings, and parenthesizes every `CASE ... END`
expression inside triggers. Local SQLite/Worker tests alone do not exercise D1's remote `/query`
statement parser: unparenthesized expressions can produce `incomplete input: SQLITE_ERROR [7500]`
there. See the [Cloudflare tracker](https://github.com/cloudflare/workers-sdk/issues/4727) and
[documented parenthesis workaround](https://github.com/cloudflare/workers-sdk/issues/4326).

The first remote apply attempt failed before deployment. Read-only checks confirmed rollback:
no new columns, no pricing triggers, and only `0001_initial.sql` recorded in `d1_migrations`.
That permitted correcting the still-unapplied `0002`; never edit an already-applied migration.
The compatibility regression protects this syntax, while actual local D1 tests verify unchanged
immutability/overlap/atomicity semantics. Neither is proof that a remote migration passed; inspect
the remote migration record/schema before continuing import or deployment. Do not disable guards,
manually mark a failed migration applied, or blindly retry an unexplained failure.

Imports **never overwrite history or reprice existing traces**. New snapshots must use new IDs and
nonoverlapping windows. The initial snapshots are open-ended. Closing an existing open-ended window
requires a separately reviewed migration explicitly addressing the immutable guard; do not silently edit
the checked-in manifest, disable guards, or backdate a new snapshot to make an import pass. Keep the old
version/rates/source and existing trace costs. A proper future lifecycle migration should be reviewed
alongside updated verification evidence.

## Error and privacy boundaries

This registry contains public source data, not ingestion credentials. The operator CLI never reads users,
session cookies, password hashes or API-key secrets. Failed Wrangler invocations produce a generic
operator error rather than dumping tool output that might include local authentication context.

Tests cover malformed sources/rates/dates, overlaps, immutable version changes, atomic D1 import,
idempotent repeat, exact two-model ingestion costs, pre-verification null cost, historical trace preservation
and source provenance. Current source checks do not guarantee future prices remain unchanged; reverify
before publishing another snapshot.
