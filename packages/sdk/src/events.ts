import {
  metadataSchema,
  sanitizeErrorSummary,
  traceEventSchema,
  usageSchema,
  type TraceEvent,
} from '@traceai/shared';
import type { ReportDiagnostic } from './diagnostics';
import type { TraceMetadata, TraceOptions, TraceSpan, Usage } from './types';

export interface OperationCapture {
  span: TraceSpan;
  summarizeError(error: unknown): string | undefined;
  complete(errorType?: TraceEvent['errorType'], errorSummary?: string): TraceEvent | undefined;
}

/** Snapshots valid plain scalar metadata; never serializes arbitrary objects or array indices. */
export const snapshotTraceMetadata = (value: unknown): TraceMetadata | undefined => {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    return metadataSchema.parse(value);
  } catch {
    return undefined;
  }
};
const snapshotOptions = (options: TraceOptions, report: ReportDiagnostic) => {
  const labels = { name: options.name, provider: options.provider, model: options.model };
  if (options.metadata === undefined) return labels;
  const metadata = snapshotTraceMetadata(options.metadata);
  if (metadata) return { ...labels, metadata };
  report({ code: 'invalid_metadata', count: 1 });
  return labels;
};

const captureErrorSummary = (options: TraceOptions, report: ReportDiagnostic) => {
  let callback: TraceOptions['errorSummary'];
  try {
    callback = options.errorSummary;
  } catch {
    report({ code: 'invalid_error_summary', count: 1 });
  }
  return (error: unknown): string | undefined => {
    if (callback === undefined) return undefined;
    try {
      const value: unknown = callback(error);
      if (value === undefined) return undefined;
      if (typeof value === 'string') {
        const sanitized = sanitizeErrorSummary(value);
        if (sanitized !== undefined) return sanitized;
      } else {
        // A mistakenly async callback must not create an unhandled rejection.
        void Promise.resolve(value).catch(() => undefined);
      }
    } catch {
      // Callback failures must never mask the application's original exception.
    }
    report({ code: 'invalid_error_summary', count: 1 });
    return undefined;
  };
};

export const snapshotCompletedEvent = (value: unknown): TraceEvent | undefined => {
  try {
    const parsed = traceEventSchema.safeParse(value);
    if (!parsed.success) return undefined;
    const { errorSummary, ...event } = parsed.data;
    const sanitized = errorSummary === undefined ? undefined : sanitizeErrorSummary(errorSummary);
    return sanitized === undefined ? event : { ...event, errorSummary: sanitized };
  } catch {
    return undefined;
  }
};

export const classifyError = (error: unknown): NonNullable<TraceEvent['errorType']> => {
  try {
    if (typeof error !== 'object' || error === null) return 'unknown';
    const classified = error as { name?: unknown; status?: unknown; code?: unknown };
    if (
      classified.name === 'AbortError' ||
      classified.name === 'TimeoutError' ||
      classified.code === 'ETIMEDOUT'
    )
      return 'timeout';
    if (classified.status === 429) return 'rate_limit';
    if (
      classified.name === 'NetworkError' ||
      (typeof classified.code === 'string' &&
        ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED'].includes(classified.code))
    )
      return 'network';
    return error instanceof Error ? 'application' : 'unknown';
  } catch {
    return 'unknown';
  }
};

export const captureOperation = (
  options: TraceOptions,
  report: ReportDiagnostic,
): OperationCapture | undefined => {
  try {
    const labels = snapshotOptions(options, report);
    const summarizeError = captureErrorSummary(options, report);
    const traceId = globalThis.crypto.randomUUID();
    const startedAtMs = Date.now();
    const monotonicStart = performance.now();
    let usage: Usage | undefined;
    let closed = false;
    const span: TraceSpan = {
      setUsage(value) {
        if (closed) return;
        try {
          usage = usageSchema.parse(value);
        } catch {
          report({ code: 'invalid_usage', count: 1 });
        }
      },
    };
    return {
      span,
      summarizeError,
      complete(errorType, errorSummary) {
        closed = true;
        const event = traceEventSchema.safeParse({
          ...labels,
          traceId,
          status: errorType === undefined ? 'success' : 'error',
          startedAt: new Date(startedAtMs).toISOString(),
          endedAt: new Date(Math.max(startedAtMs, Date.now())).toISOString(),
          durationMs: Math.max(0, performance.now() - monotonicStart),
          ...usage,
          ...(errorSummary === undefined ? {} : { errorSummary }),
          ...(errorType === undefined ? {} : { errorType }),
        });
        if (event.success) return event.data;
        report({ code: 'invalid_event', count: 1 });
        return undefined;
      },
    };
  } catch {
    report({ code: 'invalid_event', count: 1 });
    return undefined;
  }
};
