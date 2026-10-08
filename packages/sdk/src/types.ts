/** Only explicitly supplied scalar metadata is captured. Never put secrets here. */
export type TraceMetadata = Record<string, string | number | boolean | null>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface TraceOptions {
  name: string;
  provider: string;
  model: string;
  metadata?: TraceMetadata;
  /** Explicit opt-in only. Known secrets are redacted; arbitrary PII is your responsibility. */
  errorSummary?: (error: unknown) => string | undefined;
}

export interface TraceSpan {
  /** Invalid usage is ignored; the last valid report wins. Closed spans ignore reports. */
  setUsage(usage: Usage): void;
}

export interface Diagnostic {
  code:
    | 'invalid_event'
    | 'invalid_metadata'
    | 'invalid_usage'
    | 'invalid_error_summary'
    | 'queue_full'
    | 'delivery_retry'
    | 'delivery_failed'
    | 'client_closed';
  count: number;
  attempt?: number;
  httpStatus?: number;
}

export interface TraceAIConfig {
  apiKey: string;
  /** API base URL or full /v1/events/batch URL. HTTPS except loopback development. */
  endpoint: string;
  enabled?: boolean;
  batchSize?: number;
  flushIntervalMs?: number;
  requestTimeoutMs?: number;
  maxQueueSize?: number;
  /** Includes the initial attempt. */
  maxAttempts?: number;
  retryBaseMs?: number;
  /** Upper bound for exponential backoff and Retry-After. */
  retryMaxMs?: number;
  /** A lightweight callback receiving sanitized codes only. Exceptions are ignored. */
  onDiagnostic?: (diagnostic: Readonly<Diagnostic>) => void;
  /** Optional transport override for testing or a compatible platform fetch. */
  fetch?: typeof globalThis.fetch;
}

/** An already-ended operation, e.g. a server-side OpenTelemetry span. */
export type CompletedTrace = import('@traceai/shared').TraceEvent;

/** Acknowledged by HTTP, not merely queued. Delivery is best effort, never exactly-once. */
export type DeliveryResult =
  | { status: 'delivered' }
  | {
      status: 'dropped';
      reason: 'disabled' | 'client_closed' | 'invalid_event' | 'queue_full' | 'delivery_failed';
    };
