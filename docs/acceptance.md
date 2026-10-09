# Full-product acceptance ledger

The user's completion request goes beyond the first working MVP. This ledger retains the
unchanged [original specification](product-spec.md) as the source of requirements, records real
gaps found by three independent source audits, and separates additional product work from the
original non-goals. A feature, a test file, a passing local run and a deployed verification are
different kinds of evidence. No unchecked release gate is a completion claim.

## Original requirements, section by section

| Spec   | Required outcome                                                                                  | Implementation / evidence                                                                                    | Resolved verification path                                                                           |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| §1     | Request volume, latency percentiles, usage, estimates, success/failure, model/trace debugging     | Shared Overview, API analytics services, real D1 analytics tests, API-backed screens                         | Explicit safe summaries and Average/P95 have source, D1 and browser evidence                         |
| §2–4   | Independent strict TypeScript Bun monorepo and specified frontend/backend/test stack              | apps/web, apps/api, SDK/shared/database/config workspaces; root scripts and CI                               | Adapted shadcn/Radix menu and isolated packed-package consumers are implemented and locally verified |
| §3     | Async privacy-first telemetry, separate dashboard/ingestion, bounded resources, UTC and ownership | SDK queue/retry lifecycle; scoped repository queries; Zod contracts; BFF                                     | New SDK/exporter/API slices preserve privacy and resource boundaries in focused regressions          |
| §5.1   | Projects, descriptions, ownership, one-time keys, revoke/rotate/delete                            | Project service/repository, settings UI, Worker tests and real account → SDK E2E                             | Real rename/selector/clipboard-denied/key-secrecy browser assertions added                           |
| §5.2   | Email/password, secure expiring sessions, logout, rate limits, CSRF                               | Private scrypt DO, HttpOnly cookie, auth/ownership integration tests                                         | Identity menu, safe returnTo and bounded hourly expired-record maintenance verified                  |
| §5.3   | Generic SDK trace/usage/result/error preservation; batching/retry/bounds/flush/shutdown           | SDK source and 58 baseline reliability cases                                                                 | O(1) active bookkeeping, summary callback and packed Bun/Node consumers verified                     |
| §6     | Indexed relational schema, migrations, idempotency, precise money                                 | Drizzle schema, initial D1 migration; real persistence/rollback/precision tests                              | Additive 0002, immutable pricing and legacy-summary isolation verified                               |
| §7     | Authenticated bounded atomic ingestion, dedup, validation and rate/error semantics                | Actual Worker ingestion suite and strict shared schemas                                                      | UTF-8/date/token/extra-field and nanosecond-ordering zero-write regressions added                    |
| §8     | All management/analytics endpoints, owner scope, filters, stable cursor pagination                | All named routes exist; exact filters and newest/oldest keyset tests                                         | Caps retained; test-injected aggregate 422 exercises exact controls against real trace queries       |
| §9     | Working responsive dashboard, five navigation destinations plus docs, date/theme/user controls    | Six overview visualizations, trace explorer/detail, model table and P95 chart, project/settings/auth screens | All listed controls implemented; loaded-content responsive, keyboard and AA evidence expanded        |
| §9.1   | Four named primary KPIs plus request/latency/token/cost/provider/model visualizations             | Total/error/cost and P95 primary; Average was only secondary                                                 | Average added alongside the user's priority P95                                                      |
| §9.2–3 | Every trace column, server filters/sort/pages, detail and truthful single-operation timeline      | TanStack Table, exact search and time sorting; backend and core E2E                                          | Real filters/sort/cursors/detail and explicit mocked error-state assertions; no fake span tree       |
| §9.4   | Operational model comparisons with relevant charts, not quality claims                            | Request count/avg/P95/success rate/tokens/cost and P95 chart already exist                                   | Real API values and provider-qualified chart/meter identities asserted                               |
| §9.5   | Editable projects, copyable SDK examples, one-time key lifecycle and confirmed deletion           | Existing settings and management E2E                                                                         | Clipboard fallback, rename/selector, one-time/reload secrecy asserted                                |
| §10    | Usable local versioned sourced pricing registry, unknown price null, immutable trace pricing      | Pricing mechanism worked, but only fictional demo records shipped                                            | Two officially sourced snapshots, immutable import, provenance and D1 semantics verified             |
| §11    | 10,000 deterministic multi-model/30-day simulated traces and read-only public demo                | Generator, seed, demo routes, live 10,000-row evidence                                                       | Fictional prices remain isolated; existing remote demo was not reseeded during upgrade               |
| §12    | Input/auth/tenant/body/rate/CORS/logging/SQL/XSS/secret/privacy security                          | Origin-checked same-origin BFF; owner tests; parameterized SQL; generic errors; no raw capture               | Explicit bounded summary policy and source/bundle/tarball secret review completed                    |
| §13    | Repeatable SDK/API/dashboard performance evidence; <3s and <500ms targets                         | SDK stub benchmark and 20-sample warm API benchmark existed                                                  | Reproducible browser/API/concurrent-SDK measurements with explicit scope and limitations             |
| §14    | Vitest unit, actual Worker/D1 integration and meaningful Playwright journeys                      | Baseline 103 unit, 59 integration, 7 E2E cases in dev/workerd/live                                           | Current 168 unit / 73 actual D1 / 17 browser cases; runtime results in verification.md               |
| §15    | Installation/env/migration/seed/SDK/API/architecture/deployment/troubleshooting docs              | README plus dedicated architecture/API/SDK/demo/deployment/verification docs                                 | Troubleshooting, pricing, OTel, operator and interview guides added; release evidence below          |
| §16    | Actions install/lint/types/unit/integration/build, no automatic deployment                        | Existing CI additionally runs dev and built-workerd E2E                                                      | Packed-consumer and AA checks included; actual published CI is a separate release gate               |
| §17/20 | Complete source, SDK/API/dashboard/migrations/seed/tests/docs and verified release                | Independent public repository and live Workers                                                               | All current release gates below must pass before declaring the goal complete                         |

## Original §19 acceptance checks

The original specification is preserved unchanged. All24 original acceptance checks have current
local and deployed evidence in [verification](verification.md), not merely the earlier green baseline:

| #   | Original acceptance                 | Current evidence                                                                |
| --- | ----------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Entire project runs locally         | Frozen Bun setup, migrated/priced/seeded local D1,17 native journeys            |
| 2   | Public dashboard deployed           | Recorded current web version and17 live HTTPS journeys                          |
| 3   | No paid dependency                  | Free Workers/D1/private SQLite DO, mock provider/no paid AI calls               |
| 4   | Create project                      | Real account/project E2E and live smoke                                         |
| 5   | Generate/revoke keys                | One-time reveal, rotate/revoke/old-key rejection, real owner tests              |
| 6   | SDK tracks async operations         | Original result/error identity and real SDK→D1 proof                            |
| 7   | Duration/status/optional usage      | Monotonic SDK timing and actual persistence/read-back                           |
| 8   | SDK errors do not break application | Fail-open/retry/timeout/observer/getter/result tests                            |
| 9   | Persist telemetry in D1             | Real Worker/D1 suite and deployed three-operation smoke                         |
| 10  | Accurate aggregate metrics          | Nearest-rank/integer-money tests and real UI-to-API assertions                  |
| 11  | Working request/latency charts      | Real metrics API, six loaded panels/five SVGs, current screenshot               |
| 12  | Server filters/pages                | Every filter, exact ID, both orders and cursor navigation                       |
| 13  | View trace detail                   | Actual operation timing/usage/summary/provenance browser checks                 |
| 14  | Model comparisons                   | Requests/Average/P95/success/tokens/cost table and provider-qualified charts    |
| 15  | Unknown pricing handled             | Null total, labeled known subtotal and isolated fictional prices                |
| 16  | Anonymous public demo               | Real read-only demo endpoints/browser flows                                     |
| 17  | Simulated label                     | UI markers and deterministic10,000-row seed; no fake production traffic         |
| 18  | Auth/project isolation tested       | Real cross-owner/Origin/session/key Worker and browser assertions               |
| 19  | TypeScript checks pass              | Strict root/scripts/E2E and all workspace commands                              |
| 20  | Unit/integration tests pass         | 168 unit /73 actual workerd-D1 cases                                            |
| 21  | Production build succeeds           | All workspace/OpenNext bundles and actual built-workerd journeys                |
| 22  | Installation/SDK README             | Reproducible Bun setup, workspace/tarball use and no-credential examples        |
| 23  | No committed secrets                | Source/bundle/tarball review; ignored restricted backup/artifacts; normal hooks |
| 24  | Cloudflare setup documented         | Explicit migration/import/API→web rollout and version/rollback evidence         |

Detailed §9/§10/§12 gaps were resolved rather than dismissed by these broad checks. Publication CI and
final reconciliation are recorded separately below; the published expanded-source run passed.

## Post-first-version integration and operational depth

- [x] Separate optional OpenTelemetry JavaScript trace exporter, using genuine completed span times,
      trace/span identity and explicitly allowlisted GenAI usage attributes.
- [x] Real OpenTelemetry SDK unit/in-memory example and SDK → Worker → D1 integration proof;
      lifecycle acknowledgements must not claim successful delivery after drops.
- [x] No automatic copying of arbitrary span attributes, prompt/response events, exception messages,
      headers or resource identity. Collector/OTLP, metrics and log storage are not claimed.
- [x] Concurrent SDK workload evidence and isolated packed-package Node/Bun consumers locally verified;
      the consumer check also passed in the published-source CI recorded below.
- [x] Bounded expired session/rate-counter maintenance, safe job counts and quota/retention policy.
      User traces are never silently deleted by maintenance.
- [x] Browser timing and automated AA/keyboard/responsive checks with stated measurement scope.

These are additional deliverables for this completion request, not retroactive claims that §18
required a collector, teams, Stripe, evaluation pipeline or a fake distributed trace tree.

## Verified full-product baseline release gates

- [x] Original explicit UI/registry/error-summary gaps resolved and reviewed.
- [x] All format/lint/strict TS checks pass, including scripts and E2E TypeScript.
- [x] Current unit and actual Worker/D1 suites pass.
- [x] All workspace/OpenNext builds and independent package consumers pass.
- [x] Expanded native Next and built-workerd browser suites pass without retries or weakened assertions.
- [x] Safe additive migrations and real-price import applied to the authorized Cloudflare account.
- [x] Current API/web deployed; live product/security/SDK/OTel smoke and browser journeys pass.
- [x] Actual GitHub Actions for published full-product source `70dd1a9` [passed](https://github.com/Metricra-code/traceai/actions/runs/37840304644).
- [x] Architecture/README/API/SDK/deployment/troubleshooting/verification reflect actual features,
      measurements, release IDs and remaining operational limits.
- [x] Final source/secret/scope review; original requirements and optional exporter complete,
      with operational and measurement limits explicitly retained.

## 2026-10-10 Gemini / npm follow-up

This extension is separate from the verified full-product baseline above. Neither the public
simulated demo nor a passing offline test proves a real provider call or an npm release.

- [x] Bounded actual Gemini REST example implemented with the real SDK, explicit `--run`,
      user-confirmed Free Tier, no default model, at most five sequential calls and no provider retry.
- [x] Frozen Bun install, format, lint and strict root/all nine workspace typechecks pass locally.
- [x] 230 unit tests pass locally, including 62 injected-provider Gemini cases. These use stub
      provider/telemetry transport, not real Gemini credentials or live provider requests.
- [x] All workspace builds and the unchanged 73-case actual Worker/D1 integration suite pass locally.
      These persistence cases do not establish that a real Gemini operation has been ingested.
- [x] SDK and optional adapter rebuilt and packed; isolated public declarations, license,
      privacy and delivery checks pass on Bun 1.4.0 and Node 22.22.0.
- [x] Actual CLI preview reports zero network requests. No provider key, prompt, model answer
      or provider error body is exported; missing usage/pricing stays unknown.
- [x] Actual GitHub Actions for extension source `868c241`
      [passed](https://github.com/Metricra-code/traceai/actions/runs/37984428100): 230 unit,
      73 Worker/D1 and 17 native + 17 built-workerd browser cases, plus builds/packed consumers.
      This run uses Bun 1.4.0 / Node 22.23.3 and makes no real Gemini call or npm publication.
- [x] User's Free Tier key/model configured; three bounded real Gemini calls succeeded and
      three traces were actually read back from the user's private project, including trace detail
      source/simulated markers and Dashboard aggregates. Usage totals are 31 input / 81 output
      tokens; cost stays unknown. Three samples are workflow evidence, not a model benchmark.
      See [actual run and credential isolation](gemini.md). SDK shutdown alone is not a D1 receipt.
- [x] npm account and owned scope confirmed, exact verified SDK artifact published, and the
      exact registry version installed/tested in independent Bun/Node consumers.

`@akai_80percent/traceai-sdk@0.1.0` is now **published and registry-consumer verified**;
only the core SDK is published, not the optional adapter. [Exact release evidence](npm.md).
The namespace migration CI for `815533e`
[passed](https://github.com/Metricra-code/traceai/actions/runs/37988060508): 308 unit, 73 D1,
17 native + 17 built-workerd journeys and packed-consumer/build checks. Those tests are not
provider-call or registry-publication proof.

The final release checks additionally add 31 real-adapter environment guard regressions and four
canonical-containment regressions for the npm consumer verifier (343 total unit cases).
Local OpenNext build and its fail-closed snapshot guard passed after moving model-test credentials
out of dotenv discovery; 4,268 Next/OpenNext files were scanned with no actual-key matches.
The rebuilt web was explicitly deployed, and the owner Dashboard still showed the three genuine
traces; Settings now uses the published npm namespace. API runtime, schema/pricing and the remote
10,000-row simulated demo remain unchanged. Final-source `4c392dd`
[GitHub Actions passed](https://github.com/Metricra-code/traceai/actions/runs/37989793103):
343 unit, 73 actual Worker/D1, 17 native + 17 built-workerd journeys, frozen/static/type checks,
workspace/OpenNext builds, guarded environment snapshots and packed strict Bun/Node consumers.
This run uses Bun 1.4.0 / Node 22.23.3 and does not publish, deploy or call a provider.
No automatic deploy, paid provider call or auto-publish workflow was introduced.
