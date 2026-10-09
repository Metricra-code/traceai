import { TraceAI, type Diagnostic, type Usage } from '@akai_80percent/traceai-sdk';
import { z } from 'zod';

export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const MAX_OUTPUT_TOKENS = 128;
const MAX_CALLS = 5;
const modelIdSchema = z
  .string()
  .max(100)
  .regex(/^gemini-[a-z0-9][a-z0-9._-]+$/);
const tokenCountSchema = z.number().int().min(0).max(10_000_000);
const usageMetadataSchema = z.object({
  promptTokenCount: tokenCountSchema.optional(),
  candidatesTokenCount: tokenCountSchema.optional(),
  thoughtsTokenCount: tokenCountSchema.optional(),
  totalTokenCount: tokenCountSchema.optional(),
});
// Provider responses evolve: validate the fields we use and discard every other field.
const responseSchema = z
  .object({
    usageMetadata: z.unknown().optional(),
    modelVersion: z.unknown().optional(),
    candidates: z.array(z.unknown()).max(1).optional(),
    promptFeedback: z.unknown().optional(),
  })
  .refine(
    (value) =>
      value.usageMetadata !== undefined ||
      value.candidates !== undefined ||
      value.promptFeedback !== undefined,
  );
const publicCases = [
  { name: 'explain-trace', prompt: 'Explain an application trace in one short sentence.' },
  { name: 'explain-p95', prompt: 'Explain P95 latency in one short sentence.' },
  { name: 'explain-retry', prompt: 'Explain exponential backoff in one short sentence.' },
] as const;

type Environment = Readonly<Record<string, string | undefined>>;
type FailureCode = 'provider_http' | 'provider_network' | 'provider_timeout' | 'invalid_response';
export class GeminiDemoError extends Error {
  constructor(
    readonly code: FailureCode | 'invalid_config',
    readonly status?: number,
  ) {
    super(
      'Gemini example could not complete safely. Check configuration and provider availability.',
    );
    this.name =
      code === 'provider_timeout'
        ? 'TimeoutError'
        : code === 'provider_network'
          ? 'NetworkError'
          : 'GeminiDemoError';
  }
}
interface RunConfig {
  geminiApiKey: string;
  traceaiApiKey: string;
  traceaiEndpoint: string;
  model: string;
  count: number;
}
export interface ParsedResponse {
  usage?: Usage;
  actualModelVersion?: string;
}
export interface DemoDependencies {
  providerFetch?: typeof globalThis.fetch;
  telemetryFetch?: typeof globalThis.fetch;
}
interface DeliveryDiagnostics {
  retryAttempts: number;
  failedEvents: number;
  droppedEvents: number;
  invalidEvents: number;
}
export interface RealRunSummary {
  mode: 'real';
  requestedModel: string;
  actualModelVersions: readonly string[];
  attempted: number;
  responses: number;
  failures: number;
  usageReported: number;
  usageUnknown: number;
  inputTokens: number | null;
  outputTokensIncludingThinking: number | null;
  stoppedBecause?: { code: FailureCode; status?: number };
  telemetry: DeliveryDiagnostics;
  persistence: 'not-read-back';
  freeTier: 'user-confirmed-not-programmatically-verified';
}

const failConfig = (): never => {
  throw new GeminiDemoError('invalid_config');
};
const requireKey = (value: string | undefined): string => {
  if (!value || !/^[\x21-\x7e]{8,512}$/.test(value)) return failConfig();
  return value;
};
const parseCount = (args: readonly string[]): number => {
  const countArg = args.find((arg) => arg.startsWith('--count='));
  if (args.some((arg) => arg !== '--run' && arg !== countArg)) return failConfig();
  if (new Set(args).size !== args.length) return failConfig();
  const count = countArg === undefined ? 3 : Number(countArg.slice('--count='.length));
  return Number.isInteger(count) && count >= 1 && count <= MAX_CALLS ? count : failConfig();
};
const safeModelId = (value: unknown, secrets: readonly string[] = []): string | undefined => {
  const result = modelIdSchema.safeParse(value);
  if (!result.success || secrets.some((secret) => result.data.includes(secret))) return undefined;
  return result.data;
};
const requireEndpoint = (value: string | undefined): string => {
  try {
    if (!value || value.length > 2048) return failConfig();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return failConfig();
    if (url.pathname !== '/' && url.pathname !== '/v1/events/batch') return failConfig();
    return url.toString();
  } catch {
    return failConfig();
  }
};
const loadRunConfig = (env: Environment, count: number): RunConfig => {
  if (env.GEMINI_FREE_TIER_CONFIRMED !== '1') return failConfig();
  const geminiApiKey = requireKey(env.GEMINI_API_KEY);
  const traceaiApiKey = requireKey(env.TRACEAI_API_KEY);
  const model = safeModelId(env.GEMINI_MODEL, [geminiApiKey, traceaiApiKey]);
  if (!model) return failConfig();
  return {
    geminiApiKey,
    traceaiApiKey,
    traceaiEndpoint: requireEndpoint(env.TRACEAI_ENDPOINT),
    model,
    count,
  };
};

/** Use documented total = prompt + thoughts + candidates; never infer missing fields as zero. */
export const parseGeminiUsage = (value: unknown): Usage | undefined => {
  const parsed = usageMetadataSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const {
    promptTokenCount: input,
    candidatesTokenCount: candidates,
    thoughtsTokenCount: thoughts,
    totalTokenCount: total,
  } = parsed.data;
  if (input === undefined) return undefined;
  const explicitOutput =
    candidates === undefined || thoughts === undefined ? undefined : candidates + thoughts;
  const output = total === undefined ? explicitOutput : total - input;
  if (output === undefined || output < 0 || output > 10_000_000) return undefined;
  if (explicitOutput !== undefined && explicitOutput !== output) return undefined;
  if (candidates !== undefined && candidates > output) return undefined;
  if (thoughts !== undefined && thoughts > output) return undefined;
  return { inputTokens: input, outputTokens: output };
};
export const parseGeminiResponse = (
  value: unknown,
  secrets: readonly string[] = [],
): ParsedResponse => {
  const result = responseSchema.safeParse(value);
  if (!result.success) throw new GeminiDemoError('invalid_response');
  return {
    usage: parseGeminiUsage(result.data.usageMetadata),
    actualModelVersion: safeModelId(result.data.modelVersion, secrets),
  };
};

const readBoundedJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  if (!response.body) throw new GeminiDemoError('invalid_response');
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new GeminiDemoError('invalid_response');
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new GeminiDemoError(signal.aborted ? 'provider_timeout' : 'invalid_response');
  } finally {
    signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};
const requestGemini = async (
  config: RunConfig,
  prompt: string,
  providerFetch: typeof globalThis.fetch,
): Promise<ParsedResponse> => {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new GeminiDemoError('provider_timeout'));
      }, REQUEST_TIMEOUT_MS);
    });
    const request = (async () => {
      const response = await providerFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { candidateCount: 1, maxOutputTokens: MAX_OUTPUT_TOKENS },
          }),
          signal: controller.signal,
          redirect: 'error',
        },
      );
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => undefined);
        throw new GeminiDemoError('provider_timeout');
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new GeminiDemoError('provider_http', response.status);
      }
      return parseGeminiResponse(await readBoundedJson(response, controller.signal), [
        config.geminiApiKey,
        config.traceaiApiKey,
      ]);
    })();
    return await Promise.race([request, deadline]);
  } catch (error) {
    if (error instanceof GeminiDemoError) throw error;
    throw new GeminiDemoError('provider_network');
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const addDiagnostic = (
  current: DeliveryDiagnostics,
  diagnostic: Readonly<Diagnostic>,
): DeliveryDiagnostics => ({
  retryAttempts: current.retryAttempts + (diagnostic.code === 'delivery_retry' ? 1 : 0),
  failedEvents:
    current.failedEvents + (diagnostic.code === 'delivery_failed' ? diagnostic.count : 0),
  droppedEvents: current.droppedEvents + (diagnostic.code === 'queue_full' ? diagnostic.count : 0),
  invalidEvents:
    current.invalidEvents + (diagnostic.code.startsWith('invalid_') ? diagnostic.count : 0),
});
const runRealCalls = async (
  config: RunConfig,
  dependencies: DemoDependencies,
): Promise<RealRunSummary> => {
  let diagnostics: DeliveryDiagnostics = {
    retryAttempts: 0,
    failedEvents: 0,
    droppedEvents: 0,
    invalidEvents: 0,
  };
  const client = new TraceAI({
    apiKey: config.traceaiApiKey,
    endpoint: config.traceaiEndpoint,
    batchSize: MAX_CALLS,
    maxQueueSize: MAX_CALLS,
    requestTimeoutMs: 5000,
    maxAttempts: 2,
    retryMaxMs: 1000,
    fetch: dependencies.telemetryFetch,
    onDiagnostic: (diagnostic) => {
      diagnostics = addDiagnostic(diagnostics, diagnostic);
    },
  });
  let summary: RealRunSummary = {
    mode: 'real',
    requestedModel: config.model,
    actualModelVersions: [],
    attempted: 0,
    responses: 0,
    failures: 0,
    usageReported: 0,
    usageUnknown: 0,
    inputTokens: null,
    outputTokensIncludingThinking: null,
    telemetry: diagnostics,
    persistence: 'not-read-back',
    freeTier: 'user-confirmed-not-programmatically-verified',
  };
  try {
    for (let index = 0; index < config.count; index++) {
      const testCase = publicCases[index % publicCases.length]!;
      summary = { ...summary, attempted: summary.attempted + 1 };
      try {
        const result = await client.trace(
          {
            name: `gemini-${testCase.name}`,
            provider: 'google',
            model: config.model,
            metadata: { source: 'gemini-real-api', simulated: false, test_case: testCase.name },
          },
          async (span) => {
            const result = await requestGemini(
              config,
              testCase.prompt,
              dependencies.providerFetch ?? globalThis.fetch,
            );
            if (result.usage) span.setUsage(result.usage);
            return result;
          },
        );
        summary = {
          ...summary,
          responses: summary.responses + 1,
          actualModelVersions:
            result.actualModelVersion === undefined
              ? summary.actualModelVersions
              : [...new Set([...summary.actualModelVersions, result.actualModelVersion])],
          usageReported: summary.usageReported + (result.usage ? 1 : 0),
          usageUnknown: summary.usageUnknown + (result.usage ? 0 : 1),
          inputTokens: result.usage
            ? (summary.inputTokens ?? 0) + result.usage.inputTokens
            : summary.inputTokens,
          outputTokensIncludingThinking: result.usage
            ? (summary.outputTokensIncludingThinking ?? 0) + result.usage.outputTokens
            : summary.outputTokensIncludingThinking,
        };
      } catch (error) {
        const failure =
          error instanceof GeminiDemoError ? error : new GeminiDemoError('provider_network');
        summary = {
          ...summary,
          failures: summary.failures + 1,
          stoppedBecause: {
            code: failure.code as FailureCode,
            ...(failure.status === undefined ? {} : { status: failure.status }),
          },
        };
        // Never retry model calls, including unknown failures; do not amplify spend or quota usage.
        break;
      }
    }
  } finally {
    await client.shutdown();
  }
  return { ...summary, telemetry: diagnostics };
};

/** Preview is network-free; callers must explicitly pass --run and attest their billing tier. */
export const runGeminiDemo = async (
  args: readonly string[],
  env: Environment,
  dependencies: DemoDependencies = {},
) => {
  const count = parseCount(args);
  if (!args.includes('--run'))
    return {
      mode: 'preview' as const,
      configured: {
        geminiKey: Boolean(env.GEMINI_API_KEY),
        traceaiKey: Boolean(env.TRACEAI_API_KEY),
        model: Boolean(safeModelId(env.GEMINI_MODEL)),
        endpoint: Boolean(env.TRACEAI_ENDPOINT),
        freeTierConfirmed: env.GEMINI_FREE_TIER_CONFIRMED === '1',
      },
      limits: {
        calls: count,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
      },
      networkRequests: 0,
    };
  return runRealCalls(loadRunConfig(env, count), dependencies);
};
