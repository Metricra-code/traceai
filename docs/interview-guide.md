# TraceAI 面試展示導覽

這份導覽講的是**可指向程式與測試的工程決策**，不是功能清單或企業級承諾。
展示前先看 [acceptance](acceptance.md)／[verification](verification.md)：本機檢查、live runtime、對應 source revision 的 CI 必須分開說；不要把較早的綠色
CI／live URL 當作新增功能的發布證據。

## 30 秒介紹

> 我做的是 LLM observability 作品，重點是非同步 TypeScript SDK、可操作的 React Dashboard，
> 以及真正的 Worker／D1 資料路徑。SDK 不改變原始結果或錯誤，telemetry 有明確 queue、batch、
> retry 上限與明確 lifecycle 語意；shutdown 沒有整體 deadline。Dashboard 的 P95、模型比較與 trace filtering 由 server 計算，
> 不是瀏覽器假資料。額外的 OpenTelemetry exporter 使用真實已結束 spans，不假造分散式 trace tree。

## 建議展示順序（約 5–8 分鐘）

1. **Dashboard**：先開 [read-only demo](https://traceai-web.traceai-api.workers.dev/demo)，說明
   simulated 標記與資料時間窗。展示 Average／P95、request/latency/token/cost 圖與模型比較；
   展示前先確認該環境與 verification 記錄相符。
2. **Trace debugging**：切 provider／model／status、精確 trace ID、排序與下一頁；
   看 Network 的 query params，證明是 server filtering。開 detail，說明單次 operation timeline、
   可選 safe summary、unknown cost 與 pricing provenance，不能假稱多層 spans。
3. **SDK**：展示下面的 focused tests／範例。成功回傳同一物件、失敗拋回同一錯誤；
   telemetry transport 尚未完成也不擋應用回傳。再展示 retry 與 queue overflow 的測試。
4. **真實資料路徑**：若該環境已驗收，展示自己 project 的 SDK → Worker → D1 trace。
   Settings 在建立／輪替 key 時只暫時一次顯示，存在 component memory；不嵌入 browser bundle，
   也不持久化 client storage。避免把真實 key 放進分享螢幕、影片或測試 artifact。
5. **工程證據**：最後展示對應 revision 的實際 Actions、Vitest、D1 integration、dev/workerd E2E；
   build 綠燈不等於 production journey 綠燈。OTel 免費範例是加分項，不要搶走 SDK 重點。

## 最值得深入解釋的設計取捨

| 題目                   | 可以說明的具體決策                                                                                                                                                                                                        | 證據入口／不能過度宣稱的部分                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 非同步結果與錯誤       | `trace()` 只 await 應用 operation；telemetry capture fail-open，原始 result/error identity 保留。關閉後仍執行應用 callback。                                                                                              | [SDK index](../packages/sdk/src/index.ts)、[boundary tests](../packages/sdk/src/index.test.ts)；不是零 CPU overhead。                                                                         |
| Retry                  | 只 retry network/timeout、408/429/5xx；maxAttempts 包含第一次，exponential full jitter 與有上限 Retry-After。重試相同 body/IDs。                                                                                          | [transport](../packages/sdk/src/transport.ts)；400/401/403/413 不 retry，沒有無限重試。                                                                                                       |
| Batch／queue           | 同時限制事件數與 UTF-8 bytes；queued＋in-flight 共用容量，overflow drop-newest，不讓 telemetry backpressure 應用。                                                                                                        | [batching](../packages/sdk/src/batching.ts)、[tests](../packages/sdk/src/index.test.ts)；記憶體 queue 在 crash/SIGKILL 時可能遺失。                                                           |
| Lifecycle／receipts    | flush singleflight、shutdown 等已開始 operation 再 drain；active counter＋單一 barrier 不隨 concurrency 複製集合。`record()` 分辨 HTTP acknowledgment 與 drop。                                                           | [extension tests](../packages/sdk/src/extensions.test.ts)；flush fulfilled 不是 delivery，HTTP 2xx 更不是任意 server 的 durable commit 證明。                                                 |
| Privacy                | 不自動擷取 prompts/results/raw exception.message；metadata 與 failure summary 必須明確 opt-in、snapshot、驗證與有界。                                                                                                     | [SDK design](sdk.md)、[shared sanitizer](../packages/shared/src/error-summary.ts)；regex redaction 不保證找出所有 PII。                                                                       |
| React server filtering | Query key 包含 project/API base 與有效 window/filter/cursor；變更 filter 重設 cursor，Refresh invalidates/refetches server data。表格只呈現 API 頁面。                                                                    | [traces](../apps/web/src/features/traces.tsx)、[analytics](../apps/web/src/features/analytics.tsx)、[providers](../apps/web/src/components/providers.tsx)；不是載入所有資料後 client filter。 |
| P95／模型比較          | Nearest rank `ceil(p*n)`，不能平均各 bucket 的 P95。Model workload/token sizes 不同，表格比較的是 operational performance。                                                                                               | [analytics service](../apps/api/src/services/analytics.ts)、[shared percentile](../packages/shared/src/index.ts)；不是模型品質或受控 AI benchmark。                                           |
| D1／money              | Scoped indexes、parameterized queries、stable `(started_at, trace_id)` keyset cursor；超過 20k matches 明確422，不悄悄截斷。BigInt nanodollars＋immutable pricing provenance。                                            | [repositories](../apps/api/src/repositories/analytics.ts)、[pricing](pricing.md)；cursor 不是 snapshot isolation，unknown cost 不當 `$0`，priced subtotal 不是完整總額。                      |
| Auth／security         | Same-origin BFF、cookie mutation Origin、每個 private read/write owner check；private DO 做 secure-work-factor native scrypt，raw ingestion key 不嵌入 browser bundle／不持久化 client storage；Settings 只暫時一次顯示。 | [architecture](architecture.md)、[API](api.md)、Worker integration；DO 是 runtime boundary，不是無限免費吞吐。                                                                                |
| CI／deployment         | Frozen Bun install、strict TS、unit、real D1、build、packed consumers、Next-dev 與實際 workerd E2E；不自動部署。                                                                                                          | [workflow](../.github/workflows/ci.yml)、[verification](verification.md)；真實 manifest／service-discovery regression 說明為何不能只測 dev。                                                  |
| Optional OTel          | Genuine SpanExporter 映射 allowlisted GenAI attrs、真實 nanos/IDs；callbacks 等 acknowledgement，forceFlush/shutdown 如實回報失敗。                                                                                       | [OTel tests](../packages/opentelemetry/src/index.test.ts)、[guide](opentelemetry.md)；沒有 OTLP collector、metrics/log backend 或假 span tree。                                               |

## 展示與重跑入口

從 repository root 執行；Vitest 使用 `bun run test`，不是另一個 runner 的 `bun test`。

```sh
# SDK + genuine OTel provider tests，不需要付費模型或外部網路
bun run test packages/sdk/src/index.test.ts packages/sdk/src/extensions.test.ts \
  packages/opentelemetry/src/index.test.ts

# Public package：build 後 pack，外部 temporary consumer 驗證 Bun／Node 與 strict types
bun run --filter @akai_80percent/traceai-sdk build
bun run --filter @traceai/opentelemetry build
bun run test:packages

# 免費 in-memory OTel example；設定 server-side env key/endpoint 後才送自己的 API
bun examples/opentelemetry-demo/src/index.ts

# SDK repeatable overhead：stub transport，equal warm-up，並行1/50/1000，各五輪
bun examples/node-demo/src/benchmark.ts
```

整體檢查：`bun run format:check`、`lint`、`typecheck`、`test`、`test:integration`、`build`；
本機 migrations／pricing import／seed 與 Chromium 就緒後，跑 `test:e2e`、OpenNext
`build:cloudflare`、`test:e2e:workers`。步驟見 [README](../README.md)。
`verify:deployment` 會建立 disposable 真實 account/project 並驗證 SDK/OTel storage、key lifecycle，
屬於明確的 live write 檢查，不是一般 read-only demo；需按 [deployment](deployment.md) 的發布流程執行。

## Benchmark 與面試時要主動承認的限制

- [SDK benchmark](sdk.md#repeatable-overhead-benchmark)：報 runtime、hardware、warm-up、樣本與 loss；
  concurrent P95 包含 wave scheduling，不能當單次 CPU overhead。Stub acknowledgment 不是 internet/provider latency。
- `benchmark:api`：固定 dataset/window 的 client round-trip；`benchmark:dashboard`：fresh／warm
  browser cache 到可操作 overview；fresh context 不等於 cold Worker。
- `benchmark:sustained`：有界、read-only、保留失敗樣本的短期 modest-traffic observation，
  不是 production soak、Worker CPU profile 或容量保證。Live benchmark 仍消耗 Free quota，勿無限制重跑。
- 不使用 paid AI calls，故 simulated demo 不能證明任何模型的真實速度／品質／帳單。
- Public packages 未發布 npm；tarball consumer check 是分發可用性的證據，不是假稱 registry release。
- 無 durable queue、enterprise SLA、無限 analytics、automatic trace retention 或全 PII 偵測。
  User trace retention、auth cleanup、quota 與 rollback 限制見 [operations](operations.md)。

面試遇到「為何不加 Kafka／collector？」可以回答：先把**目前有明確需求的邊界、失敗語意與可驗證
資料路徑**做好，沒有需求不引入新的營運負擔；未實作的能力清楚列為 non-goals，而不是畫一個假架構。
