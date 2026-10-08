# Verification evidence

Verified locally on 2026-10-09 using Bun 1.4.0, a clean isolated dependency installation, Node 22 toolchain and actual workerd/D1.

| Check                                            | Evidence                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                  | Passed after importing exact prior versions into bun.lock and removing old package-manager files               |
| `bun run format:check`, `bun run lint`           | Passed                                                                                                         |
| `bun run typecheck`                              | Passed, root scripts and all source packages included                                                          |
| `bun run test`                                   | 72 tests passed (58 SDK, 8 API unit, 6 schema/demo)                                                            |
| `bun run test:integration`                       | 14 actual Worker/D1 tests passed; migrations, isolation, revoke, validation, rollback, idempotency and pricing |
| `bun run build`                                  | Shared/database/SDK bundles+types, native-Bun Next build and Worker dry-run passed                             |
| `bun run --filter @traceai/web build:cloudflare` | OpenNext Worker bundle generated successfully                                                                  |
| `bun run test:e2e`                               | 2 Chromium foundation smoke tests passed; not the future Dashboard journey                                     |
| Local D1 seed                                    | Exactly 10,000 explicitly simulated requests; no real provider calls                                           |
| Real SDK → Worker → D1                           | Node and native Bun mock-provider examples persisted success/error operations; exact usage; unknown price NULL |
| Standalone SDK tarball                           | Installed independently and imported under Node/Bun without private runtime workspace dependencies             |
| SDK batching benchmark                           | Native Bun, 10,000 events, 200 batches, zero drops using a stub transport; not a network performance guarantee |

The Next surface is a foundation scaffold, not the completed Dashboard. Auth, management, analytics and public demo routes remain explicit milestones. The architecture diagram marks planned paths as dashed.

Repository target: https://github.com/Metricra-code/traceai. Local check success is not a remote GitHub Actions pass; consult the Actions run for remote evidence. Cloudflare is not authenticated and no production deployment is claimed.
