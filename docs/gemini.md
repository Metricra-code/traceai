# Gemini 真實資料：免費方案的小量測試

這個範例使用 **TraceAI SDK 包住真正的 Gemini REST `generateContent` 呼叫**，不是模擬延遲或手填 Token 數量。預設只預覽設定；只有明確傳入 `--run` 才會連線。公開 `/demo` 的 10,000 筆模擬資料保持原樣，真實測試寫入你自己的私人 project。

## 1. 先確認 Google 專案和模型

在 [Google AI Studio](https://aistudio.google.com/api-keys) 建立或選擇自己的 Gemini API key。請確認該 key 所屬 project **仍為 Free Tier，沒有啟用付費帳務**，並在 AI Studio 確認模型存取權與目前額度。

2026-10-10 查閱的[官方價格](https://ai.google.dev/gemini-api/docs/pricing)列出 `gemini-3.5-flash-lite` Standard 的 Free Tier 輸入／輸出免費。但這不保證你的 project、所在地區或模型都有資格；模型與額度可能變動。官方[模型列表](https://ai.google.dev/gemini-api/docs/models)也提醒，新 project 的 2.5 系列存取可能受限。因此程式**沒有預設模型**，請只設定你已確認能使用的免費模型。

- `GEMINI_FREE_TIER_CONFIRMED=1` 是**使用者確認聲明**，不是程式驗證帳務的結果；設錯付費 project 仍可能產生費用。
- [官方 Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)是動態、依 project／模型／tier 限制，免費服務沒有容量或成功率保證。
- 免費層內容可能用於改善 Google 產品，見[官方資料使用條款](https://ai.google.dev/gemini-api/terms)。只使用範例內固定、公開、不敏感的題目，不放公司程式、個人資料或客戶文件。
- 不要為這個測試新增信用卡、開啟付費、Grounding、Batch、外部工具或自動大量生成。這個範例沒有使用它們。

## 2. 建立 TraceAI 真實測試 project

在 [TraceAI](https://traceai-web.traceai-api.workers.dev) 註冊／登入自己的帳號，在 Projects 建立例如 `Gemini Free Tier — real data`，到該 project 的 Settings 產生 ingestion key。

Gemini key 和 TraceAI ingestion key 是兩把不同的 key。只放本機忽略檔，不放 chat、GitHub、瀏覽器 JavaScript、截圖或 CI log。**不要把它們貼給協作者或 AI。**

在 repository 根目錄，用編輯器建立 `.env.local`（`.gitignore` 已忽略 `.env*`）：

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=
GEMINI_FREE_TIER_CONFIRMED=0
TRACEAI_API_KEY=
TRACEAI_ENDPOINT=https://traceai-api.traceai-api.workers.dev
```

將兩個 key 空值填入自己的 key，按實際可用免費模型填入 `GEMINI_MODEL`，只有確認帳務仍為 Free Tier 後才把 `GEMINI_FREE_TIER_CONFIRMED` 改為 `1`。限制檔案權限：

```bash
chmod 600 .env.local
bun install --frozen-lockfile
bun run --filter @akai_80percent/traceai-sdk build
```

## 3. 先預覽，再小量執行

```bash
# 不呼叫 Gemini、不建立 SDK transport，也不寫入 TraceAI。
bun --env-file=.env.local run demo:gemini

# 確認帳務和設定後，明確允許 3 次依序呼叫。
bun --env-file=.env.local run demo:gemini --run --count=3
```

`--count` 必須為 1–5，預設 3；第一輪也可只執行 `--count=1`。不要反覆跑直到得到喜歡的數字。

範例依序詢問 trace、P95、backoff 的一句話說明；每次 `candidateCount=1`、`maxOutputTokens=128`，沒有對話歷史、圖片、工具、cache 或批次 API。每次 HTTP fetch **和 response body 讀取合計 30 秒 deadline**，最多讀取 64 KiB。沒有 provider Retry；遇到第一個 HTTP 失敗（含 401/403/404/429、帳務問題）、timeout、network 或無效回應就停止後續呼叫。不會故意製造失敗來美化展示。

## 4. 正確解讀結果

CLI 只輸出有限的 operational aggregate：真正嘗試／回應／失敗次數、Token 合計、經格式驗證的模型版本和 SDK 診斷計數。**不輸出 prompt、模型回答、provider error body、exception cause 或 key**；TraceAI metadata 只有 `source: gemini-real-api`、`simulated: false` 與固定 case 名稱。沒有自動 `errorSummary`。

Token 來自[官方 `UsageMetadata`](https://ai.google.dev/api/generate-content#UsageMetadata)，不是字串長度估算：

- `inputTokens = promptTokenCount`。
- 輸出包含 candidate **和 thinking**。有完整的 `totalTokenCount` 時，依官方定義用 `total − prompt`；若只有明確的 candidate／thinking counts，使用兩者之和，並檢查已提供欄位的一致性。
- 缺漏、負數、非整數、超限或矛盾的 usage 留為 unknown，不補 0。合計只計入 `usageReported` 的回應；`usageUnknown` 不能視為免費 Token。

Dashboard 的 provider 為 `google`；`model` 是**請求的名稱**，不是事後解析的版本。SDK 在 operation 開始時快照 labels／metadata，故實際 `modelVersion` 只出現在經 allowlist 驗證的 CLI aggregate，沒有修改已開始的 span 或重複寫入另一筆 trace。這個 grouping 不是付費帳單的模型證明。

`responses` 代表 HTTP/API operation 成功，不等於回答品質評分或人工驗證結果。Latency 包含 provider HTTP 與解析，不是 TTFT，也不是單純模型執行時間；3 筆的 P95 只適合展示流程，不代表模型效能排行。

### Model 成功不等於資料已持久化

範例在結束前 `await traceai.shutdown()`，但 SDK `trace()`／`shutdown()` 是 best-effort telemetry，不是 D1 寫入 receipt。CLI 分開呈現 `telemetry.retryAttempts`／`failedEvents`／`droppedEvents`／`invalidEvents`，以及 **`persistence: not-read-back`**。SDK transport Retry 不會重跑 Gemini operation。

執行後登入自己的 project，開啟 Traces，確認最新資料具有 `simulated: false`、真實 duration、usage（若 provider 有提供）和 `google` model；再看 trace detail。若沒有看見資料，先核對 ingestion key 所屬 project 和 endpoint，不要透過無限重跑模型來補救。只有實際讀回後，才能說「線上 TraceAI 已存入真實資料」。

目前沒有 Gemini 官方 pricing snapshot 匯入 TraceAI；**成本為 unknown/null 是正確結果**。不要把模擬 price、Google Paid Tier 牌價或自行填的 `$0` 當作這個 Free Tier project 的真實帳單。帳務由 Google project 狀態和官方使用頁面確認。

## 驗證範圍

- `examples/gemini-demo/src/gemini.test.ts`：injected provider fetch + **真正 SDK**／stub telemetry 的離線測試；涵蓋 Token/thinking、缺漏 usage、設定、bounds、timeout、敏感資料、停止條件與 transport 失敗。
- 這些測試**沒有呼叫真實 Gemini**，不證明你的 key、額度、模型資格或線上 D1 read-back。
- CI 不會執行 `--run`；沒有提交 provider credentials 或模型輸出。
